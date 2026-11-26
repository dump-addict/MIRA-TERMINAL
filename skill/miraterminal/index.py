#!/usr/bin/env python3
"""Mira Terminal code index: the exact facts about a project, without AI.

It reads every source file of the project and records, with file and line :
imports between local files, entry points (servers, routes, pages, contracts, scripts, services),
HTTP calls made by the code (and which route answers them), external URLs and environment variable names.
The AI agents that draw the map query it and it checks what they claim (evidence, coverage).

    python3 index.py build                 # write .miraterminal/index.json
    python3 index.py summary               # tree with sizes, counts, entry points
    python3 index.py file app/server.py    # facts about one file, who imports it
    python3 index.py who app/server.py     # files that import it
    python3 index.py route /api/quote      # handler and callers of a route
    python3 index.py find "deribit"        # files and lines that mention a word (case insensitive)
    python3 index.py chunks 4              # split the code in N parts that keep linked files together
    python3 index.py verify map.json       # evidence exists, links are backed, every file has a block

Standard library only, Python 3.9+. Values of variables are never read: names only.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(".").resolve()
SKIP_DIRS = {"node_modules", ".git", "dist", "out", "build", ".next", ".nuxt", "coverage", ".venv", "venv", "__pycache__",
             "target", ".miraterminal", ".claude", ".idea", ".vscode", ".turbo", ".cache", "vendor"}
ASSET = re.compile(r"\.(png|jpe?g|gif|webp|ico|svg|mp4|mov|webm|mp3|wav|ttf|otf|woff2?|eot|pdf|zip|gz|lock)$", re.I)
DATA = re.compile(r"\.(csv|tsv|parquet|npy|npz|pkl|sqlite|db|jsonl)$", re.I)
LANG = {".py": "python", ".js": "js", ".mjs": "js", ".cjs": "js", ".ts": "ts", ".tsx": "ts", ".jsx": "js", ".html": "html",
        ".sol": "solidity", ".sh": "shell", ".bash": "shell", ".toml": "config", ".json": "config", ".yml": "config",
        ".yaml": "config", ".service": "config", ".md": "doc", ".txt": "doc", ".env": "config", ".css": "css",
        # read as code even though the index has no parser of its own for them: the readers follow their imports and calls
        ".rb": "ruby", ".erb": "ruby", ".rake": "ruby", ".haml": "ruby", ".slim": "ruby", ".go": "go", ".rs": "rust", ".java": "java", ".kt": "kotlin", ".kts": "kotlin",
        ".scala": "scala", ".groovy": "groovy", ".gradle": "groovy", ".cs": "csharp", ".cshtml": "csharp", ".razor": "csharp", ".fs": "fsharp", ".vb": "vb",
        ".php": "php", ".twig": "php", ".ex": "elixir", ".exs": "elixir", ".heex": "elixir", ".eex": "elixir", ".erl": "erlang", ".swift": "swift", ".m": "objc", ".mm": "objc",
        ".c": "c", ".h": "c", ".cc": "cpp", ".cpp": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp", ".dart": "dart", ".lua": "lua", ".r": "r", ".jl": "julia",
        ".vue": "vue", ".svelte": "svelte", ".astro": "astro", ".ejs": "html", ".hbs": "html", ".njk": "html", ".liquid": "html", ".pug": "html", ".mdx": "doc",
        ".graphql": "graphql", ".gql": "graphql", ".proto": "proto", ".sql": "sql", ".prisma": "sql", ".tf": "terraform", ".hcl": "terraform",
        ".zig": "zig", ".nim": "nim", ".ml": "ocaml", ".hs": "haskell", ".clj": "clojure", ".pl": "perl", ".move": "move", ".cairo": "cairo", ".vy": "vyper",
        ".scss": "css", ".sass": "css", ".less": "css", ".ps1": "shell", ".zsh": "shell", ".fish": "shell", ".bat": "shell", ".cmd": "shell", ".xml": "config", ".ini": "config", ".conf": "config"}


MANIFEST = re.compile(r"(^|/)(package|tsconfig[\w.-]*|jsconfig|vercel|netlify|firebase|composer|deno|foundry|hardhat\.config|turbo|nx|lerna|app|manifest|\.eslintrc|\.prettierrc|wrangler|railway|render|fly|now)\.(json|jsonc|toml|ya?ml)$", re.I)
# never code, whatever is inside: tools and libraries copied into the repository, generated code, agent settings
GENERATED = re.compile(
    r"(^|/)(typechain[\w-]*|generated|__generated__|genproto|\.yarn|\.pnp[\w.]*|vendor|vendors|third[_-]?party|bower_components|\.agents|\.claude|\.cursor|\.codex|\.gemini|\.husky|\.changeset|\.storybook)/"
    r"|(^|/)(proto/gen|gen/proto|gen/go|gen/ts)/"
    r"|\.(log|map|min\.js|min\.css|min\.mjs|snap|bak|generated\.[a-z]+|gen\.[a-z]+|pb\.go|pb\.gw\.go|pb\.ts|d\.ts)$|-wasm\.[jt]s$|\.wasm\.[jt]s$"
    r"|(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|AGENTS\.md|CLAUDE\.md|GEMINI\.md|CHANGELOG\.md|CODE_OF_CONDUCT\.md|CONTRIBUTING\.md|SECURITY\.md|THIRD_PARTY_NOTICES[\w.]*|(LICEN[SC]E|NOTICE|COPYING)([.-][\w.-]*)?)$", re.I)
# folders that usually hold recorded data or build leftovers. A folder can also just be NAMED logs or cache and hold the code
# of that feature: only what is not code in a known language is set aside there.
DATA_DIRS = re.compile(r"(^|/)(broadcast|cache|artifacts|coverage|logs?|tmp|temp|snapshots?|__snapshots__|fixtures?|candles|dumps?|gen)/", re.I)
# a library copied into the project to be served as is (an editor, a chart library): under a public or static folder, and large
VENDORED = re.compile(r"(^|/)(public|static|assets|wwwroot|dist|lib|libs)/.*\.(js|mjs|css)$", re.I)
TEST = re.compile(r"(^|/)(tests?|__tests__|spec|specs|e2e|cypress|playwright|mocks?|__mocks__|testdata|test-utils|\.storybook)/|\.(test|spec|stories|e2e)\.[a-z]+$|(^|/)(test_[\w-]+\.py|[\w-]+_test\.(go|py|rs|rb)|[\w-]+Tests?\.(java|kt|cs|swift))$", re.I)


# what a bundler leaves in its output (webpack, esbuild, Rollup and Rolldown, Parcel, Vite, a source map, a "do not edit" banner)
BUILT = re.compile(r"__webpack_require__|/\*{6}/|^//# sourceMappingURL=|^\s*// [\w./@+-]*node_modules/|rolldown/runtime|parcelRequire|__vite__|"
                   r"@generated|DO NOT EDIT", re.M)


def built(f: str) -> bool:
    """written by a build, not by a person: minified (lines of thousands of characters on average) or marked by a bundler"""
    try:
        with open(ROOT / f, "rb") as h:
            head = h.read(1_000_000).decode("utf-8", "ignore")
    except OSError:
        return True
    lines = head.count("\n") + 1
    return len(head) / lines > 1000 or bool(BUILT.search(head))


def is_data(f: str, size: int) -> bool:
    """content rather than code: it is counted and can be pointed at, never read as architecture.
       A JSON, YAML or text file is code only when it is a manifest or small enough to be a config; build output, logs and
       recorded data (broadcast runs, candles, snapshots) never are; a document is read only when it is short."""
    lg = lang_of(f)
    if GENERATED.search(f):
        # LICENSE, NOTICE and the like are the files of that exact name: LicenseService.php is code
        m = re.search(r"(^|/)(LICEN[SC]E|NOTICE|COPYING)([.-][\w.-]*)?$", f, re.I)
        if not (m and lg not in ("doc", "other", "config") and not re.search(r"(^|/)(LICEN[SC]E|NOTICE|COPYING)(\.(md|txt|rst))?$", f, re.I)):
            return True
    if DATA_DIRS.search(f) and lg in ("config", "doc", "other", "html", "css"):
        return True
    # a served library copied into the project; a large file that a build wrote (a bundle, minified code). A large file
    # a person wrote (a single-page app in one HTML file) is code and is read: its size alone says nothing
    if (VENDORED.search(f) and size > 60_000) or (size > 400_000 and built(f)):
        return True
    # a settings or text file is code only when it is a manifest or small; a file of a type nobody knows, only when small.
    # A source file in a known language is always code, whatever its size (the build check above still catches bundles).
    if lg in ("config", "other") or f.lower().endswith((".json", ".jsonc", ".yaml", ".yml", ".toml", ".txt", ".xml")):
        named = os.path.basename(f).lower() in ("dockerfile", "makefile", "procfile", "rakefile", "gemfile", "justfile", "caddyfile", "vagrantfile", "jenkinsfile")
        return not MANIFEST.search(f) and not named and size > 12_000
    if lg == "doc":
        return size > 40_000
    return False


def lang_of(p: str) -> str:
    name = os.path.basename(p)
    if name.startswith(".env"):
        return "config"
    if name in ("Dockerfile", "Makefile", "Procfile"):
        return "config"
    return LANG.get(os.path.splitext(p)[1].lower(), "other")


# --- files ---------------------------------------------------------------------------------------------------

def vendored_dirs() -> list[str]:
    """git submodules and library folders (forge lib/): third-party code, outside the map"""
    out = []
    gm = ROOT / ".gitmodules"
    if gm.exists():
        out += re.findall(r"path\s*=\s*(.+)", gm.read_text(errors="ignore"))
    for f in ROOT.rglob("foundry.toml"):
        if any(part in SKIP_DIRS for part in f.parts):
            continue
        m = re.search(r"libs\s*=\s*\[([^\]]*)\]", f.read_text(errors="ignore"))
        libs = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)) if m else ["lib"]
        for lib in libs:
            out.append(str((f.parent / lib).relative_to(ROOT)))
    found = sorted({o.strip().rstrip("/") for o in out if o.strip()})
    # only the topmost: contracts/lib already covers contracts/lib/solady
    return [v for v in found if not any(v != w and v.startswith(w + "/") for w in found)]


ALWAYS_SKIP = {"node_modules", ".git", "dist", ".next", ".nuxt", ".venv", "venv", "__pycache__", ".miraterminal", ".claude", ".idea", ".vscode", ".turbo", ".cache", "vendor"}


def list_files() -> list[str]:
    try:
        r = subprocess.run(["git", "-c", "core.fsmonitor=false", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True, timeout=20)
        if r.returncode == 0:
            files = [f for f in r.stdout.splitlines() if f]
        else:
            raise OSError
    except (OSError, subprocess.SubprocessError):
        files = []
        for d, dirs, fs in os.walk(ROOT):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith(".")]
            files += [os.path.relpath(os.path.join(d, f), ROOT) for f in fs]
    vend = vendored_dirs()
    keep = []
    for f in files:
        parts = f.split("/")
        if any(p in ALWAYS_SKIP for p in parts[:-1]) or parts[-1] == ".DS_Store":
            continue
        if any(f == v or f.startswith(v + "/") for v in vend):
            continue
        if (ROOT / f).is_file():
            keep.append(f)
    return sorted(keep)


# --- facts -----------------------------------------------------------------------------------------------------

URL = re.compile(r"""(?:https?|wss?)://[^\s'"`<>)\\]+""")
ENV_PATTERNS = [
    re.compile(r"""os\.environ(?:\.get)?\s*[\[(]\s*['"]([A-Z][A-Z0-9_]+)['"]"""),
    re.compile(r"""os\.getenv\(\s*['"]([A-Z][A-Z0-9_]+)['"]"""),
    re.compile(r"""process\.env\.([A-Z][A-Z0-9_]+)"""),
    re.compile(r"""process\.env\[\s*['"]([A-Z][A-Z0-9_]+)['"]"""),
    re.compile(r"""import\.meta\.env\.([A-Z][A-Z0-9_]+)"""),
    re.compile(r"""vm\.env(?:Uint|Address|String|Bool|Bytes32|Int|Or)?\w*\(\s*["']([A-Z][A-Z0-9_]+)["']"""),
]
ENV_SHELL = re.compile(r"\$\{?([A-Z][A-Z0-9_]{2,})\}?")
ENV_FILE = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=", re.M)
SHELL_BUILTIN = {"PATH", "HOME", "PWD", "USER", "SHELL", "IFS", "OPTARG", "OPTIND", "RANDOM", "LINENO", "BASH_SOURCE", "EUID", "UID"}

PY_IMPORT = re.compile(r"^\s*(?:from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)|import\s+([\w., ]+))", re.M)
JS_IMPORT = re.compile(r"""(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|import\(\s*|require\(\s*|export\s+[\w*{}\s,]+\s+from\s+)['"]([^'"]+)['"]""")
HTML_REF = re.compile(r"""<(?:script|link|img|source|iframe|a)\b[^>]*?\b(?:src|href)\s*=\s*['"]([^'"#?]+)""", re.I)
SOL_IMPORT = re.compile(r"""^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]""", re.M)
SH_RUN = re.compile(r"""(?:python3?|uv run(?: python)?|bash|sh|source|\.)\s+([\w./-]+\.(?:py|sh))""")
SH_MODULE = re.compile(r"""python3?\s+-m\s+([\w.]+)|uvicorn\s+([\w.]+):""")
SOL_SCRIPT = re.compile(r"""forge\s+script\s+([\w./-]+\.sol)""")

PY_ROUTE = re.compile(r"""@(?:\w+)\.(get|post|put|delete|patch|websocket|route|api_route)\(\s*['"]([^'"]+)['"]""")
PY_MOUNT = re.compile(r"""\.mount\(\s*['"]([^'"]+)['"]""")
JS_ROUTE = re.compile(r"""\b(?:app|router|server)\.(get|post|put|delete|patch|use|all)\(\s*['"]([^'"]+)['"]""")
HTTP_CALL = re.compile(r"""\b(?:fetch|axios(?:\.\w+)?|\$\.(?:get|post|ajax)|get|post|api|apiGet|apiPost|request)\s*\(\s*[`'"]([^`'"]*)[`'"]""")
WS_CALL = re.compile(r"""new\s+WebSocket\(\s*[`'"]([^`'"]+)""")
TEMPLATE_PATH = re.compile(r"""[`'"](/(?:api|ws|v\d)[\w/{}:$.-]*)[`'"]""")

ENTRY = [
    ("server", re.compile(r"""\bFastAPI\(|\bFlask\(|uvicorn\.run\(|\bexpress\(\)|\.listen\(\s*\d|createServer\(|ThreadingHTTPServer|HTTPServer\(|websockets\.serve\(""")),
    ("cli", re.compile(r"""^if\s+__name__\s*==\s*['"]__main__['"]""", re.M)),
    ("cli", re.compile(r"""argparse\.ArgumentParser\(""")),
    ("loop", re.compile(r"""while\s+True\s*:|asyncio\.run\(|schedule\.|apscheduler|create_task\(""")),
    ("timer", re.compile(r"""setInterval\(""")),
    ("service", re.compile(r"""^\[Service\]""", re.M)),
    ("cron", re.compile(r"""\bcrontab\b|OnCalendar=|"crons"\s*:""")),
]
SOL_CONTRACT = re.compile(r"""^\s*(abstract\s+contract|contract|interface|library)\s+(\w+)""", re.M)


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def strip_url(u: str) -> str:
    return u.rstrip(".,;:'\"`)}]")


def host_of(u: str) -> str:
    m = re.match(r"(?:https?|wss?)://([^/:?#]+)", u)
    return m.group(1).lower() if m else ""


def route_key(path: str) -> str:
    """normalise a route for matching: parameters and template parts become *, no trailing slash"""
    p = path.split("?")[0]
    p = re.sub(r"\$\{[^}]*\}|\{[^}]*\}|:[A-Za-z_]\w*|<[^>]*>", "*", p)
    p = re.sub(r"/+", "/", p).rstrip("/") or "/"
    return p


class Index:
    def __init__(self):
        self.files: dict[str, dict] = {}
        self.vendored = vendored_dirs()

    # resolving imports to project files
    def resolve_py(self, mod: str, src: str) -> str | None:
        if not mod:
            return None
        if mod.startswith("."):
            dots = len(mod) - len(mod.lstrip("."))
            base = Path(src).parent
            for _ in range(dots - 1):
                base = base.parent
            parts = [x for x in mod.lstrip(".").split(".") if x]
            cands = [base.joinpath(*parts)] if parts else [base]
        else:
            parts = mod.split(".")
            cands = [Path(*parts), Path(src).parent.joinpath(*parts)]
        for c in cands:
            for f in (str(c) + ".py", str(c / "__init__.py")):
                f = os.path.normpath(f)
                if f in self.files:
                    return f
        return None

    def resolve_rel(self, ref: str, src: str, exts=("", ".js", ".ts", ".tsx", ".jsx", ".mjs", "/index.js", "/index.ts")) -> str | None:
        if re.match(r"^(?:https?:|data:|mailto:|//)", ref):
            return None
        base = Path(src).parent
        cands = []
        if ref.startswith("/"):
            # absolute path of a web page: from the site root (the page's folder, then its parents)
            p = Path(src).parent
            while True:
                cands.append(p / ref.lstrip("/"))
                if str(p) in (".", ""):
                    break
                p = p.parent
        else:
            cands.append(base / ref)
            cands.append(Path(ref))
        for c in cands:
            for e in exts:
                f = os.path.normpath(str(c) + e)
                if f in self.files:
                    return f
        return None

    def resolve_sol(self, ref: str, src: str, remaps: list) -> tuple[str | None, str | None]:
        for pre, target in remaps:
            if ref.startswith(pre):
                lib = target.rstrip("/").split("/")
                return None, (lib[-2] if lib[-1] in ("src", "contracts") and len(lib) > 1 else lib[-1])
        f = os.path.normpath(str(Path(src).parent / ref))
        if f in self.files:
            return f, None
        f = os.path.normpath(ref)
        if f in self.files:
            return f, None
        for v in self.vendored:
            if os.path.normpath(str(Path(src).parent / ref)).startswith(v):
                return None, v.split("/")[-1]
        return None, ref.split("/")[0]

    def remappings(self) -> list:
        out = []
        for f in list(ROOT.rglob("remappings.txt")) + list(ROOT.rglob("foundry.toml")):
            if any(p in SKIP_DIRS for p in f.parts) or any(str(f.relative_to(ROOT)).startswith(v + "/") for v in self.vendored):
                continue
            txt = f.read_text(errors="ignore")
            for a, b in re.findall(r"['\"]?([@\w./-]+/)=([\w./-]+)['\"]?", txt):
                out.append((a, b))
        return sorted(set(out), key=lambda x: -len(x[0]))

    def build(self):
        names = list_files()
        for f in names:
            size = (ROOT / f).stat().st_size
            # a large config or text file (results JSON, an export) is data, not code
            kind = "asset" if ASSET.search(f) else "data" if DATA.search(f) or is_data(f, size) else "source"
            self.files[f] = {"lang": lang_of(f), "kind": kind, "test": bool(kind == "source" and TEST.search(f)), "bytes": size, "tokens": size // 4 if kind == "source" else 0,
                             "lines": 0, "imports": [], "external_libs": [], "entries": [], "routes": [], "http_calls": [],
                             "urls": [], "env": [], "contracts": [], "refs": []}
        remaps = self.remappings()
        for f, info in self.files.items():
            if info["kind"] != "source" or info["bytes"] > 3_000_000:
                continue
            try:
                txt = (ROOT / f).read_text(errors="ignore")
            except OSError:
                continue
            info["lines"] = txt.count("\n") + 1
            lg = info["lang"]
            imp, ext = info["imports"], info["external_libs"]

            def add_import(target, line, how):
                if target and target != f and not any(i["path"] == target for i in imp):
                    imp.append({"path": target, "line": line, "how": how})

            if lg == "python":
                for m in PY_IMPORT.finditer(txt):
                    ln = line_of(txt, m.start())
                    if m.group(1) is not None:
                        mod = m.group(1)
                        names_ = [n.strip(" ()") for n in m.group(2).split(",")]
                        hit = None
                        for n in names_:   # from pkg import module
                            if n and n != "*":
                                hit = self.resolve_py((mod + "." if not mod.endswith(".") else mod) + n, f)
                                if hit:
                                    add_import(hit, ln, "import")
                        if not hit:
                            r = self.resolve_py(mod, f)
                            if r:
                                add_import(r, ln, "import")
                            elif mod and not mod.startswith("."):
                                ext.append(mod.split(".")[0])
                    else:
                        for mod in m.group(3).split(","):
                            mod = mod.strip().split(" as ")[0].strip()
                            r = self.resolve_py(mod, f)
                            if r:
                                add_import(r, ln, "import")
                            elif mod:
                                ext.append(mod.split(".")[0])
            if lg in ("js", "ts", "html"):
                for m in JS_IMPORT.finditer(txt):
                    ref = m.group(1)
                    r = self.resolve_rel(ref, f) if ref.startswith((".", "/")) else None
                    if r:
                        add_import(r, line_of(txt, m.start()), "import")
                    elif not ref.startswith((".", "/")):
                        ext.append(ref if not ref.startswith("@") else "/".join(ref.split("/")[:2]))
            if lg == "html":
                for m in HTML_REF.finditer(txt):
                    r = self.resolve_rel(m.group(1), f, exts=("",))
                    if r:
                        add_import(r, line_of(txt, m.start()), "html")
            if lg == "solidity":
                for m in SOL_IMPORT.finditer(txt):
                    r, lib = self.resolve_sol(m.group(1), f, remaps)
                    if r:
                        add_import(r, line_of(txt, m.start()), "import")
                    elif lib:
                        ext.append(lib)
                for m in SOL_CONTRACT.finditer(txt):
                    info["contracts"].append({"kind": m.group(1).replace("abstract ", "abstract-"), "name": m.group(2), "line": line_of(txt, m.start())})
            if lg in ("shell", "config", "python", "js", "ts"):
                for rx, how in ((SH_RUN, "runs"), (SOL_SCRIPT, "runs")):
                    for m in rx.finditer(txt):
                        ref = m.group(1)
                        r = self.resolve_rel(ref, f, exts=("",)) or (os.path.normpath(ref) if os.path.normpath(ref) in self.files else None)
                        if r:
                            add_import(r, line_of(txt, m.start()), how)
                for m in SH_MODULE.finditer(txt):
                    mod = m.group(1) or m.group(2)
                    r = self.resolve_py(mod, f)
                    if r:
                        add_import(r, line_of(txt, m.start()), "runs")
            # entry points
            for kind, rx in ENTRY:
                m = rx.search(txt)
                if m and lg in ("python", "js", "ts", "shell", "config", "html") and not any(e["kind"] == kind for e in info["entries"]):
                    info["entries"].append({"kind": kind, "line": line_of(txt, m.start()), "match": m.group(0)[:40]})
            if lg == "html":
                info["entries"].append({"kind": "page", "line": 1, "match": os.path.basename(f)})
            if lg == "solidity" and any(c["kind"] == "contract" for c in info["contracts"]):
                info["entries"].append({"kind": "contract", "line": next(c["line"] for c in info["contracts"] if c["kind"] == "contract"), "match": "contract"})
            # routes served
            for rx in (PY_ROUTE, JS_ROUTE):
                for m in rx.finditer(txt):
                    info["routes"].append({"method": m.group(1).upper(), "path": m.group(2), "line": line_of(txt, m.start())})
            for m in PY_MOUNT.finditer(txt):
                info["routes"].append({"method": "MOUNT", "path": m.group(1), "line": line_of(txt, m.start())})
            # outgoing HTTP calls
            seen = {(None, r["line"]) for r in info["routes"]}
            route_lines = {r["line"] for r in info["routes"]}
            for rx in (HTTP_CALL, WS_CALL, TEMPLATE_PATH):
                for m in rx.finditer(txt):
                    p = m.group(1)
                    if not p or not (p.startswith("/") or p.startswith("${") or re.match(r"(?:https?|wss?)://", p)):
                        continue
                    if p.startswith("/") and (lg in ("python",) and rx is TEMPLATE_PATH):
                        continue   # server side, these paths are routes or files, not calls
                    key = (p, line_of(txt, m.start()))
                    if key in seen or key[1] in route_lines:   # a line that declares a route is not a call
                        continue
                    seen.add(key)
                    info["http_calls"].append({"path": p, "line": key[1]})
            # external addresses
            useen = set()
            for m in URL.finditer(txt):
                u = strip_url(m.group(0)); h = host_of(u)
                if not h or h.startswith("$") or h in ("localhost", "127.0.0.1", "0.0.0.0", "example.com", "www.w3.org") or (h, ) in useen:
                    continue
                useen.add((h,))
                info["urls"].append({"host": h, "url": u[:120], "line": line_of(txt, m.start())})
            # variables (names only)
            env = set()
            for rx in ENV_PATTERNS:
                env.update(rx.findall(txt))
            if lg == "shell" or f.endswith((".service", ".yml", ".yaml")):
                info["_shell_env"] = sorted({v for v in ENV_SHELL.findall(txt) if v not in SHELL_BUILTIN})
            if os.path.basename(f).startswith(".env") or f.endswith(".env"):
                env.update(ENV_FILE.findall(txt))
            info["env"] = sorted(env)
            info["external_libs"] = sorted(set(ext))
        known = {e for i in self.files.values() for e in i["env"]}
        for i in self.files.values():
            sh = i.pop("_shell_env", None)
            if sh:
                i["env"] = sorted(set(i["env"]) | (set(sh) & known))
        # HTTP links: call -> the route that answers it
        routes = []
        for f, info in self.files.items():
            for r in info["routes"]:
                routes.append((route_key(r["path"]), r, f))
        for f, info in self.files.items():
            for c in info["http_calls"]:
                p = c["path"]
                p = re.sub(r"^\$\{[^}]*\}", "", p)
                if re.match(r"(?:https?|wss?)://", p):
                    continue
                k = route_key(p)
                best = None
                for rk, r, rf in routes:
                    if r["method"] == "MOUNT":
                        if k == rk or k.startswith(rk.rstrip("/") + "/"):
                            best = best or (rf, r)
                        continue
                    pat = "^" + re.escape(rk).replace(r"\*", "[^/]+") + "$"
                    if re.match(pat, k) or rk == k:
                        best = (rf, r)
                        break
                if best and best[0] != f:
                    c["handler"] = {"path": best[0], "line": best[1]["line"], "route": best[1]["path"]}
        return self

    def to_json(self) -> dict:
        imported_by = defaultdict(list)
        for f, info in self.files.items():
            for i in info["imports"]:
                imported_by[i["path"]].append({"path": f, "line": i["line"], "how": i["how"]})
        for f in self.files:
            self.files[f]["imported_by"] = imported_by.get(f, [])
        return {"root": str(ROOT), "vendored": self.vendored, "files": self.files}


# --- queries -----------------------------------------------------------------------------------------------------

def load() -> dict:
    p = ROOT / ".miraterminal" / "index.json"
    if not p.exists():
        idx = Index().build().to_json()
        p.parent.mkdir(exist_ok=True)
        p.write_text(json.dumps(idx, indent=1))
        return idx
    return json.loads(p.read_text())


def human(n: int) -> str:
    return f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def cmd_summary(idx):
    files = idx["files"]
    src = {f: i for f, i in files.items() if i["kind"] == "source"}
    print(f"{len(files)} files: {len(src)} source ({human(sum(i['tokens'] for i in src.values()))} tokens), "
          f"{sum(1 for i in files.values() if i['kind'] == 'data')} data, {sum(1 for i in files.values() if i['kind'] == 'asset')} assets")
    if idx["vendored"]:
        print("third party, left out :", ", ".join(idx["vendored"]))
    tree = defaultdict(lambda: [0, 0])
    for f, i in src.items():
        d = os.path.dirname(f) or "."
        tree[d][0] += 1; tree[d][1] += i["tokens"]
    print("\nfolders (source files, tokens) :")
    for d in sorted(tree):
        print(f"  {d:<40} {tree[d][0]:>4}  {human(tree[d][1]):>7}")
    print("\nentry points :")
    for f, i in sorted(src.items()):
        if i["entries"]:
            print(f"  {f}: " + ", ".join(f"{e['kind']}@{e['line']}" for e in i["entries"]))
    print("\nexternal hosts :")
    hosts = defaultdict(set)
    for f, i in src.items():
        for u in i["urls"]:
            hosts[u["host"]].add(f)
    for h in sorted(hosts):
        print(f"  {h:<40} {len(hosts[h])} file(s)")
    env = sorted({e for i in src.values() for e in i["env"]})
    print(f"\nenvironment variables ({len(env)}) :", ", ".join(env))


def cmd_file(idx, path):
    i = idx["files"].get(path)
    if not i:
        print("unknown file"); return
    out = {k: v for k, v in i.items() if v not in ([], 0, "")}
    print(json.dumps(out, indent=1))


def cmd_who(idx, path):
    i = idx["files"].get(path)
    for x in (i or {}).get("imported_by", []):
        print(f"{x['path']}:{x['line']} ({x['how']})")


def cmd_route(idx, path):
    k = route_key(path)
    for f, i in sorted(idx["files"].items()):
        for r in i["routes"]:
            if route_key(r["path"]) == k or k.startswith(route_key(r["path"]).rstrip("/") + "/") and r["method"] == "MOUNT":
                print(f"handler {f}:{r['line']} {r['method']} {r['path']}")
        for c in i["http_calls"]:
            if route_key(re.sub(r"^\$\{[^}]*\}", "", c["path"])) == k:
                print(f"caller  {f}:{c['line']} {c['path']}")


def cmd_find(idx, word):
    rx = re.compile(re.escape(word), re.I)
    for f, i in sorted(idx["files"].items()):
        if i["kind"] != "source":
            continue
        try:
            for n, line in enumerate((ROOT / f).read_text(errors="ignore").splitlines(), 1):
                if rx.search(line):
                    print(f"{f}:{n}: {line.strip()[:140]}")
        except OSError:
            pass


def graph(idx):
    """weighted undirected graph: imports and HTTP calls (strong), same folder (weak)"""
    g = defaultdict(lambda: defaultdict(float))
    src = [f for f, i in idx["files"].items() if i["kind"] == "source"]
    for f in src:
        i = idx["files"][f]
        for x in i["imports"]:
            if idx["files"].get(x["path"], {}).get("kind") == "source":
                g[f][x["path"]] += 3; g[x["path"]][f] += 3
        for c in i["http_calls"]:
            h = c.get("handler")
            if h:
                g[f][h["path"]] += 2; g[h["path"]][f] += 2
    bydir = defaultdict(list)
    for f in src:
        bydir[os.path.dirname(f)].append(f)
    for fs in bydir.values():
        for a in fs:
            for b in fs:
                if a != b:
                    g[a][b] += 0.5
    return src, g


def communities(idx):
    """deterministic label propagation: closely linked files take the same label"""
    src, g = graph(idx)
    label = {f: f for f in src}
    for _ in range(20):
        changed = False
        for f in sorted(src):
            if not g[f]:
                continue
            score = defaultdict(float)
            for n, w in g[f].items():
                score[label[n]] += w
            best = max(sorted(score), key=lambda k: score[k])
            if score[best] > score.get(label[f], 0) and best != label[f]:
                label[f] = best; changed = True
        if not changed:
            break
    groups = defaultdict(list)
    for f in src:
        groups[label[f]].append(f)
    return list(groups.values())


def cmd_chunks(idx, n, out=None):
    tok = lambda f: max(1, idx["files"][f]["tokens"])
    comms = sorted(communities(idx), key=lambda c: -sum(map(tok, c)))
    total = sum(tok(f) for c in comms for f in c)
    cap = total / n * 1.15
    # a community that is too large is split by folder
    pieces = []
    for c in comms:
        if sum(map(tok, c)) <= cap:
            pieces.append(c); continue
        byd = defaultdict(list)
        for f in c:
            byd[os.path.dirname(f)].append(f)
        for x in byd.values():
            # a folder still too large: its files go one by one, the largest first
            pieces += [x] if sum(map(tok, x)) <= cap else [[f] for f in x]
    pieces.sort(key=lambda c: -sum(map(tok, c)))
    bins = [[] for _ in range(n)]
    load_ = [0] * n
    for c in pieces:
        k = min(range(n), key=lambda j: load_[j])
        bins[k] += c; load_[k] += sum(map(tok, c))
    res = [{"part": k + 1, "tokens": load_[k], "files": sorted(b)} for k, b in enumerate(bins)]
    for r in res:
        print(f"part {r['part']}: {len(r['files'])} files, {human(r['tokens'])} tokens")
        for f in r["files"]:
            print(f"   {f}  ({human(tok(f))})")
    if out:
        Path(out).write_text(json.dumps(res, indent=1))


def cmd_verify(idx, map_path):
    """what makes a map verifiable: every proof exists and holds what it claims, every link has a proof,
       every source file belongs to a block, every HTTP call and every external host is covered by a link"""
    m = json.loads(Path(map_path).read_text())
    files = idx["files"]
    problems, warnings = [], []

    def check_ev(where, ev):
        p, ln, match = ev.get("path"), ev.get("line"), ev.get("match")
        # a file git ignores (runtime data, a local config) is still a file: it counts when it is on disk
        if p not in files and not (p and (ROOT / p).is_file()):
            problems.append(f"{where}: evidence file not found: {p}"); return
        if ln:
            try:
                lines = (ROOT / p).read_text(errors="ignore").splitlines()
            except OSError:
                lines = []
            if not (1 <= ln <= len(lines)):
                problems.append(f"{where}: {p}:{ln} out of range ({len(lines)} lines)"); return
            if match:
                window = "\n".join(lines[max(0, ln - 3):ln + 2])
                if match.lower() not in window.lower():
                    problems.append(f"{where}: {p}:{ln} does not contain '{match}'")

    owner = {}
    owners = defaultdict(set)   # a file can be listed by several blocks (a server file by each of its components)
    ids = {n["id"] for n in m.get("nodes", [])}
    for n in m.get("nodes", []):
        for fe in n.get("files", []):
            p = fe["path"] if isinstance(fe, dict) else fe
            p = p.rstrip("/")
            hits = [f for f in files if f == p or f.startswith(p + "/")]
            if not hits and not (ROOT / p).exists():
                problems.append(f"node {n['id']}: file or folder not found: {p}")
            for h in hits:
                owner.setdefault(h, n["id"]); owners[h].add(n["id"])
        for ev in n.get("evidence", []):
            check_ev(f"node {n['id']}", ev)
    for l in m.get("links", []):
        lid = l.get("id") or f"{l.get('source')}--{l.get('target')}"
        for end in ("source", "target"):
            if l.get(end) not in ids:
                problems.append(f"link {lid}: unknown {end} {l.get(end)}")
        evs = l.get("evidence", [])
        if not evs:
            problems.append(f"link {lid}: no evidence (add \"evidence\": [{{\"path\", \"line\", \"match\"}}]: the line of code that shows this link)")
        for ev in evs:
            check_ev(f"link {lid}", ev)
    src = [f for f, i in files.items() if i["kind"] == "source"]
    # lock files, ignore files and pictures are not architecture: they need no block
    NOISE = re.compile(r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|\.gitignore|\.gitattributes|\.editorconfig|LICENSE[^/]*)$|\.(png|jpe?g|gif|ico|svg|webp|woff2?|ttf|mp3|mp4|pdf|lock)$", re.I)
    orphans = [f for f in src if f not in owner and not NOISE.search(f)]
    # HTTP calls between two different blocks that have no link
    pairs = {(l.get("source"), l.get("target")) for l in m.get("links", [])}
    parent = {n["id"]: n.get("parent") for n in m.get("nodes", [])}

    def up(x):
        seen = set()
        while x and x not in seen:
            seen.add(x); yield x; x = parent.get(x)

    kids = defaultdict(set)
    for c, p_ in parent.items():
        for anc in up(p_):
            kids[anc].add(c)

    def family(x):
        # the block, its parents and its children: a file of a container can carry the link of one of its components
        return set(up(x)) | kids.get(x, set())

    def linked(a, b):
        fa, fb = family(a), family(b)
        return any((x, y) in pairs or (y, x) in pairs for x in fa for y in fb)

    def joined(f, g):
        # the two files are in the same block, or some block of one is linked to some block of the other
        return any(a == b or linked(a, b) for a in owners[f] for b in owners[g])

    missing = []
    for f in src:
        for c in files[f]["http_calls"]:
            h = c.get("handler")
            if h and owners.get(f) and owners.get(h["path"]) and not joined(f, h["path"]):
                missing.append(f"{f}:{c['line']} calls {c['path']} handled in {h['path']}:{h['line']} ({' or '.join(sorted(owners[f]))} -> {' or '.join(sorted(owners[h['path']]))})")
        for x in files[f]["imports"]:
            if owners.get(f) and owners.get(x["path"]) and not joined(f, x["path"]):
                missing.append(f"{f}:{x['line']} imports {x['path']} ({' or '.join(sorted(owners[f]))} -> {' or '.join(sorted(owners[x['path']]))})")
    print(f"{len(m.get('nodes', []))} blocks, {len(m.get('links', []))} links")
    print(f"coverage: {len(src) - len(orphans)}/{len(src)} source files belong to a block")
    for o in orphans:
        print(f"  orphan  {o}")
    for p in problems:
        print(f"  error   {p}")
    for w in warnings:
        print(f"  warning {w}")
    for x in missing:
        print(f"  missing {x}")
    print(f"{len(problems)} errors, {len(warnings)} warnings, {len(orphans)} orphans, {len(missing)} unlinked calls")
    if problems or orphans or missing:
        print("fix: every error, give every orphan file to the block it belongs to, add a link (with its evidence) for every unlinked call or import, then run verify again")
    else:
        print("verified: every link has a proof found in the code, every source file belongs to a block")
    return 1 if problems or orphans or missing else 0


def main():
    global ROOT
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".")
    ap.add_argument("cmd", choices=["build", "summary", "file", "who", "route", "find", "chunks", "verify"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--out")
    a = ap.parse_args()
    ROOT = Path(a.root).resolve()
    if a.cmd == "build":
        idx = Index().build().to_json()
        p = ROOT / ".miraterminal" / "index.json"
        p.parent.mkdir(exist_ok=True)
        p.write_text(json.dumps(idx, indent=1))
        src = [i for i in idx["files"].values() if i["kind"] == "source"]
        print(f"{p}: {len(idx['files'])} files, {len(src)} source, {sum(len(i['imports']) for i in src)} imports, "
              f"{sum(len(i['routes']) for i in src)} routes, {sum(1 for i in src for c in i['http_calls'] if c.get('handler'))} matched HTTP calls")
        return
    idx = load()
    if a.cmd == "summary":
        cmd_summary(idx)
    elif a.cmd == "file":
        cmd_file(idx, a.arg)
    elif a.cmd == "who":
        cmd_who(idx, a.arg)
    elif a.cmd == "route":
        cmd_route(idx, a.arg)
    elif a.cmd == "find":
        cmd_find(idx, a.arg)
    elif a.cmd == "chunks":
        cmd_chunks(idx, int(a.arg or 4), a.out)
    elif a.cmd == "verify":
        sys.exit(cmd_verify(idx, a.arg))


if __name__ == "__main__":
    main()
