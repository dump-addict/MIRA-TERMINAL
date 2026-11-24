#!/usr/bin/env python3
"""miraterminal: serves the project map (.miraterminal/map.json), runs the checks and opens a focused Claude session.

Standard library only (Python 3.9+). Listens on 127.0.0.1 only.

    python3 .claude/skills/miraterminal/server.py                 # map of the current folder, opens a window
    python3 .claude/skills/miraterminal/server.py --root ../other --port 4701 --no-open
    python3 .claude/skills/miraterminal/server.py --validate      # validates map.json and exits
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import hashlib
import json
import os
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
VIEWER = HERE / "viewer"
TOKEN = secrets.token_urlsafe(18)
CHECK_TYPES = {"http", "rpc", "cmd", "env", "file", "port"}
CACHE_TTL = 15.0

ROOT: Path = Path.cwd()
MAP_DIR: Path = ROOT / ".miraterminal"
_cache: dict = {}
_cache_lock = threading.Lock()


# ---------------------------------------------------------------- environment

def load_env(project_only: bool = False) -> dict:
    """Project variables: os.environ, then .env at the root (.env wins). Values never leave the server.
    project_only: the .env files alone, for ${VAR} in checks, so a map cannot send the user's shell secrets anywhere."""
    env = {} if project_only else dict(os.environ)
    for name in (".env", ".env.local"):
        p = ROOT / name
        if not p.exists():
            continue
        for line in p.read_text(errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            if k.startswith("export "):
                k = k[7:].strip()
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            else:
                v = v.split(" #", 1)[0].strip()
            env[k] = v
    return env


class MissingVar(Exception):
    pass


def subst(s, env: dict):
    """Replaces ${VAR} with its value (recursive through dicts and lists)."""
    if isinstance(s, str):
        def rep(m):
            k = m.group(1)
            if not env.get(k):
                raise MissingVar(k)
            return env[k]
        return re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", rep, s)
    if isinstance(s, list):
        return [subst(x, env) for x in s]
    if isinstance(s, dict):
        return {k: subst(v, env) for k, v in s.items()}
    return s


def jget(obj, path: str):
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict):
            if part not in cur:
                return None
            cur = cur[part]
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return None
    return cur


def short(v, n=120):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s if len(s) <= n else s[: n - 1] + "…"


# ---------------------------------------------------------------- map

def map_path() -> Path:
    return MAP_DIR / "map.json"


def read_map() -> dict:
    p = map_path()
    if not p.exists():
        return {"project": ROOT.name, "nodes": [], "links": [], "_missing": True}
    return json.loads(p.read_text())


def link_id(l: dict) -> str:
    return l.get("id") or f"{l.get('source')}--{l.get('target')}"


def elements(m: dict) -> dict:
    out = {}
    for n in m.get("nodes", []):
        out[f"node:{n['id']}"] = n
    for l in m.get("links", []):
        out[f"link:{link_id(l)}"] = l
    return out


def validate(m: dict) -> list:
    errs = []
    ids = [n.get("id") for n in m.get("nodes", [])]
    seen = set()
    for i in ids:
        if not i:
            errs.append("a node has no id")
        elif i in seen:
            errs.append(f"duplicate node id: {i}")
        seen.add(i)
    lids = set()
    for l in m.get("links", []):
        lid = link_id(l)
        if lid in lids:
            errs.append(f"duplicate link id: {lid}")
        lids.add(lid)
        for end in ("source", "target"):
            if l.get(end) not in seen:
                errs.append(f"link {lid}: unknown {end} ({l.get(end)})")
    for n in m.get("nodes", []):
        if n.get("parent") and n["parent"] not in seen:
            errs.append(f"node {n.get('id')}: unknown parent ({n['parent']})")
    for f in m.get("flows", []) or []:
        for st in f.get("steps", []):
            for end in ("from", "to"):
                if st.get(end) not in seen:
                    errs.append(f"flow {f.get('id')}: unknown {end} ({st.get(end)})")
    for key, el in elements(m).items():
        for c in el.get("checks", []) or []:
            if c.get("type") not in CHECK_TYPES:
                errs.append(f"{key}: unknown check type {c.get('type')}")
            if c.get("type") == "http" and not c.get("url"):
                errs.append(f"{key}: http check without url")
    return errs


# ---------------------------------------------------------------- checks

# a project runs its own checks (commands, network calls) only once the user trusts it:
# in Mira through "Trust project", on its own with --trust. A cloned repository's map is someone else's code.
EMBEDDED = os.environ.get("MIRA_EMBEDDED") == "1"
UNTRUSTED = os.environ.get("MIRA_TRUSTED") != "1"


def run_check(c: dict, env: dict) -> dict:
    t0 = time.time()
    kind = c.get("type")
    res = {"label": c.get("label") or kind, "type": kind, "status": "fail", "detail": "", "values": {}}
    if UNTRUSTED and kind in ("cmd", "http", "rpc", "port", "env"):
        res["status"], res["detail"] = "unknown", "checks are off until you trust this project" if EMBEDDED else "checks are off: start the map with --trust to run them"
        res["ms"] = 0
        return res
    try:
        if kind in ("http", "rpc"):
            env = load_env(project_only=True)  # ${VAR} in a request: the project's .env only, never the shell's variables
            if kind == "rpc":  # JSON-RPC (EVM, etc.): POST {method, params}
                url = subst(c["url"], env)
                body = {"jsonrpc": "2.0", "id": 1, "method": c.get("method", "eth_blockNumber"), "params": c.get("params", [])}
                method = "POST"
            else:
                url = subst(c["url"], env)
                body = subst(c.get("body"), env)
                method = c.get("method", "POST" if body is not None else "GET")
            data = None
            headers = {"User-Agent": "miraterminal/1", "Accept": "application/json, */*"}
            headers.update(subst(c.get("headers", {}), env))
            if body is not None:
                data = (json.dumps(body) if isinstance(body, (dict, list)) else str(body)).encode()
                headers.setdefault("Content-Type", "application/json")
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=c.get("timeout", 8)) as r:
                    code, text = r.status, r.read(8_000_000).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                code, text = e.code, e.read(20_000).decode("utf-8", "replace")
            want = c.get("status")
            ok = code == want if want else 200 <= code < 400
            status, notes = ("ok" if ok else "fail"), [f"HTTP {code}"]
            if ok and c.get("contains") and c["contains"] not in text:
                status = "fail"
                notes.append(f"“{c['contains']}” not found")
            js = None
            if any(k in c for k in ("expect", "warn", "nonempty", "warn_empty", "show")) or kind == "rpc":
                try:
                    js = json.loads(text)
                except ValueError:
                    js = None
                    if status == "ok":
                        status = "fail"
                        notes.append("response is not JSON")
            if js is not None:
                if kind == "rpc":
                    if "error" in js:
                        status = "fail"
                        notes.append(short(js["error"], 80))
                    else:
                        r = js.get("result")
                        if c.get("nonempty_result") and r in (None, "", "0x", "0x0", [], {}):
                            status = "fail"
                            notes.append("empty result")
                        if isinstance(r, str) and r.startswith("0x") and len(r) > 18:
                            r = f"{len(r) // 2 - 1} bytes"
                        res["values"]["result"] = int(r, 16) if isinstance(r, str) and r.startswith("0x") and len(r) <= 18 else short(r, 60)
                for p, v in (c.get("expect") or {}).items():
                    got = jget(js, p)
                    if got != v:
                        status = "fail"
                        notes.append(f"{p} = {short(got, 40)} (expected {short(v, 40)})")
                for p in c.get("nonempty") or []:
                    if not jget(js, p):
                        status = "fail"
                        notes.append(f"{p} empty")
                for p, v in (c.get("warn") or {}).items():
                    got = jget(js, p)
                    if got != v and status == "ok":
                        status = "warn"
                        notes.append(f"{p} = {short(got, 40)}")
                for p in c.get("warn_empty") or []:
                    if not jget(js, p) and status == "ok":
                        status = "warn"
                        notes.append(f"{p} empty")
                for p in c.get("show") or []:
                    res["values"][p] = jget(js, p)
            res["status"], res["detail"] = status, ", ".join(notes)
        elif kind == "env":
            missing = [v for v in c.get("vars", []) if not env.get(v)]
            res["status"] = "ok" if not missing else "fail"
            res["detail"] = "all set" if not missing else "missing: " + ", ".join(missing)
        elif kind == "file":
            p = (ROOT / c["path"]).resolve()
            if p != ROOT.resolve() and ROOT.resolve() not in p.parents:  # a map only learns about files of its own project
                res["detail"] = c["path"] + " is outside the project"
            else:
                res["status"] = "ok" if p.exists() else "fail"
                res["detail"] = c["path"] + (" found" if p.exists() else " not found")
        elif kind == "port":
            host, port = c.get("host", "127.0.0.1"), int(c["port"])
            try:
                with socket.create_connection((host, port), timeout=c.get("timeout", 1.5)):
                    pass
                res["status"], res["detail"] = "ok", f"{host}:{port} is up"
            except OSError:
                res["detail"] = f"{host}:{port} not responding"
        elif kind == "cmd":
            p = subprocess.run(c["run"], shell=True, cwd=ROOT, env=env, capture_output=True, text=True, timeout=c.get("timeout", 30))
            out = (p.stdout + p.stderr).strip()
            res["status"] = "ok" if p.returncode == 0 else ("warn" if p.returncode in c.get("warn_codes", []) else "fail")
            res["detail"] = f"exit code {p.returncode}" + (f": {out[-300:]}" if out and (c.get("show_output") or p.returncode) else "")
    except MissingVar as e:
        res["status"], res["detail"] = "fail", f"variable {e} missing from .env"
    except subprocess.TimeoutExpired:
        res["status"], res["detail"] = "fail", "timed out"
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        for v in load_env().values():  # never a secret in an error message (a URL with a key, for example)
            if v and len(v) >= 8 and v in msg:
                msg = msg.replace(v, "•••")
        res["status"], res["detail"] = "fail", f"{type(e).__name__}: {short(msg, 140)}"
    if res["status"] == "fail" and c.get("optional"):
        res["status"] = "off"
    res["ms"] = int((time.time() - t0) * 1000)
    return res


def aggregate(results: list) -> str:
    st = [r["status"] for r in results]
    if not st:
        return "unknown"
    for s in ("fail", "warn", "ok", "off"):
        if s in st:
            return s
    return "unknown"


def run_checks(keys: list | None, manual: bool, force: bool) -> dict:
    m = read_map()
    els = elements(m)
    env = load_env()
    targets = [k for k in (keys or els.keys()) if k in els]
    jobs = []
    for k in targets:
        for i, c in enumerate(els[k].get("checks") or []):
            if c.get("manual") and not manual:
                continue
            ck = json.dumps(c, sort_keys=True)
            with _cache_lock:
                hit = _cache.get(ck)
            if hit and not force and time.time() - hit[0] < CACHE_TTL:
                jobs.append((k, i, hit[1]))
            else:
                jobs.append((k, i, c))
    out: dict = {k: {"checks": [], "status": "unknown"} for k in targets}
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {}
        for k, i, c in jobs:
            if "status" in c and "ms" in c:  # cached result
                out[k]["checks"].append((i, c))
            else:
                futs[ex.submit(run_check, c, env)] = (k, i, json.dumps(c, sort_keys=True))
        for f in cf.as_completed(futs):
            k, i, ck = futs[f]
            r = f.result()
            r["t"] = time.time()
            with _cache_lock:
                _cache[ck] = (time.time(), r)
            out[k]["checks"].append((i, r))
    for k in targets:
        checks = els[k].get("checks") or []
        done = dict(out[k]["checks"])
        lst = []
        for i, c in enumerate(checks):
            if i in done:
                lst.append({**done[i], "index": i})
            else:
                with _cache_lock:
                    hit = _cache.get(json.dumps(c, sort_keys=True))
                lst.append({**hit[1], "index": i} if hit else {"label": c.get("label") or c.get("type"), "type": c.get("type"), "status": "pending", "manual": True, "index": i, "detail": "not run yet"})
        out[k] = {"checks": lst, "status": aggregate([x for x in lst if x["status"] != "pending"])}
    return out


# ---------------------------------------------------------------- git activity

def git(*args) -> str:
    try:
        # a repository's own config can name programs for git to run (fsmonitor, hooks): never run them from here
        p = subprocess.run(["git", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", *args], cwd=ROOT, capture_output=True, text=True, timeout=8)
        return p.stdout if p.returncode == 0 else ""
    except Exception:  # noqa: BLE001
        return ""


def el_files(el: dict) -> list:
    out = []
    for f in el.get("files") or []:
        p = f["path"] if isinstance(f, dict) else f
        if p and not p.startswith(("http:", "https:")):
            out.append(p)
    return out


def activity(key: str) -> dict:
    m = read_map()
    el = elements(m).get(key)
    if not el:
        return {}
    files = el_files(el)
    out = {"dirty": [], "commits": [], "sessions": []}
    if files:
        spec = ["--", *files]
        out["dirty"] = [l[3:] for l in git("status", "--porcelain", *spec).splitlines() if l.strip()][:20]
        for l in git("log", "-6", "--format=%h\t%ar\t%s", *spec).splitlines():
            h, when, msg = (l.split("\t", 2) + ["", ""])[:3]
            out["commits"].append({"hash": h, "when": when, "msg": msg})
    sd = MAP_DIR / "sessions"
    if sd.exists():
        slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", key)
        for p in sorted(sd.glob(f"*_{slug}.md"), reverse=True)[:5]:
            q = ""
            m2 = re.search(r"^## Request\n(.+?)(?:\n\n|\Z)", p.read_text(errors="replace"), re.M | re.S)
            if m2:
                q = m2.group(1).strip()
            out["sessions"].append({"file": str(p.relative_to(ROOT)), "when": time.strftime("%b %d %H:%M", time.localtime(p.stat().st_mtime)), "question": short(q, 140)})
    return out


# ---------------------------------------------------------------- focused session

T = {
    "en": {
        "intro": "Focused session on “{label}” ({kind}) of project {project}.",
        "node": "block", "link": "link",
        "between": "This link connects “{a}” → “{b}”.",
        "role": "## Role", "files": "## Key files", "conn": "## Connections", "checks": "## Check results (right now)",
        "cost": "## Cost", "todos": "## Open points", "act": "## Recent activity", "dirty": "Uncommitted changes: ",
        "ask": "## Request",
        "default_node": "Review this part: what works, what is missing, what is fragile, what can be optimized. End with the 3 most useful actions, ranked.",
        "default_link": "Review this link: speed (latency, round trips), reliability (errors, retries, timeouts), security, missing configuration. End with the 3 most useful actions, ranked.",
        "rules": "## Rules\n- Read the key files first, then widen to the rest of the project only when useful.\n- Stay focused on this part.\n- When you fix an open point, find a new one or change this part's state, update entry `{id}` ({kind_key}) in `.miraterminal/map.json` (`todos`, `status`, `notes`, `checks`): the map refreshes by itself.",
        "none": "none",
    },
}


def build_prompt(key: str, question: str) -> str:
    m = read_map()
    els = elements(m)
    el = els[key]
    t = T.get(m.get("lang") or "en", T["en"])
    kind_key = key.split(":", 1)[0]
    names = {n["id"]: n.get("label", n["id"]) for n in m.get("nodes", [])}
    lines = [t["intro"].format(label=el.get("label") or names.get(el.get("id"), key), kind=t[kind_key], project=m.get("project", ROOT.name))]
    if kind_key == "link":
        lines[0] = t["intro"].format(label=el.get("label") or f"{names.get(el['source'])} → {names.get(el['target'])}", kind=t["link"], project=m.get("project", ROOT.name))
        lines.append(t["between"].format(a=names.get(el["source"], el["source"]), b=names.get(el["target"], el["target"])))
    if m.get("summary"):
        lines.append(f"Project: {m['summary']}")
    lines += ["", t["role"], el.get("summary", "")]
    if el.get("details"):
        lines.append(el["details"])
    if el.get("tech"):
        lines.append("Tech: " + ", ".join(el["tech"]))
    if el.get("files"):
        lines += ["", t["files"]]
        for f in el["files"]:
            lines.append(f"- `{f['path']}`" + (f": {f['role']}" if f.get("role") else "") if isinstance(f, dict) else f"- `{f}`")
    if kind_key == "node":
        kids = [n for n in m.get("nodes", []) if n.get("parent") == el["id"]]
        if kids:
            lines += ["", "## Contains", *[f"- {k.get('label', k['id'])}: {k.get('summary', '')}" for k in kids]]
        if el.get("parent"):
            lines.append("Part of: " + names.get(el["parent"], el["parent"]))
        flows = [f for f in m.get("flows", []) or [] if any(el["id"] in (st.get("from"), st.get("to")) for st in f.get("steps", []))]
        if flows:
            lines += ["", "## Flows involved"]
            for f in flows:
                lines.append(f"- {f.get('label')}: " + " → ".join(st.get("text", "") for st in f.get("steps", [])))
        conn = []
        for l in m.get("links", []):
            if l["source"] == el["id"]:
                conn.append(f"- → {names.get(l['target'])}: {l.get('label', '')}")
            elif l["target"] == el["id"]:
                conn.append(f"- ← {names.get(l['source'])}: {l.get('label', '')}")
        if conn:
            lines += ["", t["conn"], *conn]
    res = run_checks([key], manual=False, force=False).get(key, {})
    if res.get("checks"):
        lines += ["", t["checks"]]
        for r in res["checks"]:
            vals = ", ".join(f"{k}={short(v, 40)}" for k, v in (r.get("values") or {}).items())
            lines.append(f"- {r['label']}: {r['status'].upper()}" + (f" ({r['detail']})" if r.get("detail") else "") + (f" [{vals}]" if vals else ""))
    if el.get("cost"):
        c = el["cost"]
        lines += ["", t["cost"], (f"{c['monthly_usd']} $" + "/month. " if c.get("monthly_usd") is not None else "") + (c.get("note") or "")]
    todos = el.get("todos") or []
    if todos:
        lines += ["", t["todos"]]
        for td in todos:
            txt = td if isinstance(td, str) else td.get("text", "")
            done = isinstance(td, dict) and td.get("done")
            lines.append(f"- [{'x' if done else ' '}] {txt}")
    if el.get("notes"):
        lines += ["", "## Notes", el["notes"]]
    act = activity(key)
    if act.get("commits") or act.get("dirty"):
        lines += ["", t["act"]]
        for c in act.get("commits", [])[:4]:
            lines.append(f"- {c['hash']} ({c['when']}) {c['msg'][:140]}")
        if act.get("dirty"):
            lines.append(t["dirty"] + ", ".join(act["dirty"][:10]))
    lines += ["", t["ask"], question.strip() or t["default_" + kind_key], "", t["rules"].format(id=el.get("id") or link_id(el), kind_key="nodes" if kind_key == "node" else "links")]
    return "\n".join(lines).strip() + "\n"


def write_inside(p: Path, text: str) -> None:
    """Writes a file under .miraterminal/, refusing any symlink (shipped by a cloned repository) that leads out of the project."""
    base = ROOT.resolve()
    d = base
    for part in p.parent.relative_to(ROOT).parts:  # check each level before creating it
        d = d / part
        if not d.exists():
            d.mkdir()
        d = d.resolve()
        if base not in d.parents:
            raise PermissionError(f"{p.parent} is outside the project")
    target = (d / p.name).resolve()
    if target.parent != d:
        raise PermissionError(f"{p} is outside the project")
    target.write_text(text)


def save_session(key: str, prompt: str) -> Path:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", key)
    p = MAP_DIR / "sessions" / f"{time.strftime('%Y%m%d-%H%M%S')}_{slug}.md"
    write_inside(p, prompt)
    return p


def applescript_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def launch_terminal(prompt_file: Path) -> tuple[bool, str]:
    """Opens a new terminal window that runs `claude` with the prompt. Returns (launched, command)."""
    claude = os.environ.get("MIRATERMINAL_CLAUDE", "claude")
    cmd = f"cd {shlex.quote(str(ROOT))} && {claude} \"$(cat {shlex.quote(str(prompt_file))})\""
    term = os.environ.get("MIRATERMINAL_TERMINAL", "").lower()
    try:
        if sys.platform == "darwin":
            if term == "iterm" or (not term and Path("/Applications/iTerm.app").exists() and os.environ.get("TERM_PROGRAM") == "iTerm.app"):
                script = f'tell application "iTerm" to create window with default profile command "/bin/zsh -lc " & quoted form of {applescript_str(cmd + "; exec $SHELL -l")}'
            else:
                script = f'tell application "Terminal"\nactivate\ndo script {applescript_str(cmd)}\nend tell'
            subprocess.run(["osascript", "-e", script], check=True, capture_output=True, timeout=10)
            return True, cmd
        for t in (["x-terminal-emulator", "-e"], ["gnome-terminal", "--"], ["konsole", "-e"], ["xterm", "-e"]):
            if shutil.which(t[0]):
                subprocess.Popen([*t, "bash", "-lc", cmd + "; exec bash"], start_new_session=True)
                return True, cmd
    except Exception:  # noqa: BLE001
        pass
    return False, cmd


def open_file(rel: str) -> bool:
    p = (ROOT / rel).resolve()
    if ROOT.resolve() not in p.parents and p != ROOT.resolve():
        return False
    if not p.exists():
        return False
    for ed in (os.environ.get("MIRATERMINAL_EDITOR"), "cursor", "code"):
        exe = ed and shutil.which(ed)
        if exe:
            # the full path : on Windows the editors' command is a .cmd file, which only runs found this way
            subprocess.Popen([exe, "-g", str(p)], start_new_session=True)
            return True
    # without a code editor : the file is shown, never run. A repository's .app, .command or script would run on a plain
    # `open` (files from git clone carry no quarantine), so macOS opens it as text, or reveals it in Finder when it is a folder
    if sys.platform == "darwin":
        subprocess.Popen(["open", "-R" if p.is_dir() else "-t", str(p)], start_new_session=True)
    elif sys.platform == "win32":
        # Explorer shows where it is, with the file selected ; nothing is opened, so nothing can run
        subprocess.Popen(["explorer", "/select,", str(p)])
    elif p.is_file() and not os.access(p, os.X_OK):
        subprocess.Popen(["xdg-open", str(p)], start_new_session=True)
    else:
        return False
    return True


# ---------------------------------------------------------------- HTTP

def csp(html: str) -> str:
    """Content-Security-Policy of a viewer page: only its own scripts, plus the hash of each inline script (the importmap).
    A map.json that slips markup into the page still cannot run code, load a remote script or rebase the page's URLs."""
    hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode() + "'"
        for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S))
    return ("default-src 'self'; script-src 'self' " + hashes + "; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")


MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2"}


class H(BaseHTTPRequestHandler):
    server_version = "miraterminal"

    def log_message(self, fmt, *args):  # silent except for errors
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("miraterminal: " + fmt % args + "\n")

    def send(self, code: int, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (json.dumps(body, ensure_ascii=False).encode() if ctype == "application/json" else body.encode())
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if ctype.startswith("text/html"):
            self.send_header("Content-Security-Policy", csp(data.decode()))
        self.end_headers()
        self.wfile.write(data)

    def host_ok(self) -> bool:
        # a web page that renames itself 127.0.0.1 (DNS rebinding) still sends its own name: refuse it
        h = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        return h in ("127.0.0.1", "localhost")

    def authed(self) -> bool:
        # the token is injected into the page: another site open in the browser cannot trigger a command
        return secrets.compare_digest(self.headers.get("X-Token", ""), TOKEN)

    def do_GET(self):
        if not self.host_ok():
            return self.send(403, {"error": "host"})
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.path in ("/", "/index.html"):
            # the page only opens with the launch key: another site cannot frame the map and trick a click on it
            if not secrets.compare_digest(q.get("k", ""), TOKEN):
                return self.send(403, {"error": "key"})
            html = (VIEWER / "index.html").read_text().replace("__TOKEN__", TOKEN)
            return self.send(200, html, MIME[".html"])
        if u.path.startswith("/viewer/"):
            p = (VIEWER / u.path[len("/viewer/"):]).resolve()
            if VIEWER not in p.parents or not p.is_file():
                return self.send(404, {"error": "not found"})
            return self.send(200, p.read_bytes(), MIME.get(p.suffix, "application/octet-stream"))
        if u.path.startswith("/logos/"):  # brand logos placed on the 3D objects: .miraterminal/logos/<file>
            d = (MAP_DIR / "logos").resolve()
            p = (d / urllib.parse.unquote(u.path[len("/logos/"):])).resolve()
            if d not in p.parents or not p.is_file() or p.suffix.lower() not in (".png", ".svg", ".jpg", ".jpeg", ".webp"):
                return self.send(404, {"error": "not found"})
            return self.send(200, p.read_bytes(), MIME.get(p.suffix.lower(), "application/octet-stream"))
        if not u.path.startswith("/api/"):
            return self.send(404, {"error": "not found"})
        if not self.authed():
            return self.send(403, {"error": "token"})
        if u.path == "/api/map":
            p = map_path()
            try:
                m = read_map()
            except ValueError as e:
                return self.send(200, {"error": f"map.json unreadable: {e}", "mtime": p.stat().st_mtime if p.exists() else 0})
            return self.send(200, {"map": m, "mtime": p.stat().st_mtime if p.exists() else 0, "root": str(ROOT), "errors": validate(m)})
        if u.path == "/api/checks":
            keys = q["key"].split(",") if q.get("key") else None
            return self.send(200, run_checks(keys, manual=q.get("manual") == "1", force=q.get("force") == "1"))
        if u.path == "/api/layout":
            p = MAP_DIR / "layout.json"
            try:
                return self.send(200, json.loads(p.read_text()) if p.exists() else {"positions": {}})
            except ValueError:
                return self.send(200, {"positions": {}})
        if u.path == "/api/activity":
            return self.send(200, activity(q.get("key", "")))
        return self.send(404, {"error": "not found"})

    def do_POST(self):
        if not self.host_ok() or not self.authed():
            return self.send(403, {"error": "token"})
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self.send(400, {"error": "json"})
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/session":
            key = body.get("key", "")
            if key not in elements(read_map()):
                return self.send(404, {"error": "unknown element"})
            prompt = build_prompt(key, body.get("question", ""))
            if not body.get("launch"):
                return self.send(200, {"prompt": prompt})
            f = save_session(key, prompt)
            ok, cmd = launch_terminal(f)
            return self.send(200, {"launched": ok, "command": cmd, "file": str(f.relative_to(ROOT)), "prompt": prompt})
        if u.path == "/api/layout":
            pos = body.get("positions")
            if not isinstance(pos, dict):
                return self.send(400, {"error": "positions"})
            clean = {str(k): {"x": float(v["x"]), "y": float(v["y"])} for k, v in pos.items() if isinstance(v, dict) and "x" in v and "y" in v}
            p3 = body.get("positions3d") if isinstance(body.get("positions3d"), dict) else {}
            clean3 = {str(k): {"x": float(v["x"]), "z": float(v["z"])} for k, v in p3.items() if isinstance(v, dict) and "x" in v and "z" in v}
            try:
                write_inside(MAP_DIR / "layout.json", json.dumps({"positions": clean, "positions3d": clean3}, indent=1) + "\n")
            except PermissionError as e:
                return self.send(403, {"error": str(e)})
            return self.send(200, {"ok": True, "count": len(clean)})
        if u.path == "/api/open":
            return self.send(200, {"ok": open_file(body.get("path", ""))})
        return self.send(404, {"error": "not found"})


def free_port(start: int) -> int:
    for p in range(start, start + 30):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise SystemExit("no free port")


def open_window(url: str):
    """App window (pop-up without an address bar) when Chrome, Edge or Brave is installed, otherwise the browser."""
    if sys.platform == "darwin":
        for app in ("Google Chrome", "Microsoft Edge", "Brave Browser", "Arc"):
            if Path(f"/Applications/{app}.app").exists() and app != "Arc":
                subprocess.Popen(["open", "-na", app, "--args", f"--app={url}", "--window-size=1440,900"])
                return
    webbrowser.open(url)


def main():
    global ROOT, MAP_DIR, UNTRUSTED
    ap = argparse.ArgumentParser(description="Interactive project map")
    ap.add_argument("--root", default=".", help="project root (default: current folder)")
    ap.add_argument("--port", type=int, default=4700)
    ap.add_argument("--no-open", action="store_true", help="do not open a window")
    ap.add_argument("--browser", action="store_true", help="browser tab instead of an app window")
    ap.add_argument("--validate", action="store_true", help="validate .miraterminal/map.json and exit")
    ap.add_argument("--check", action="store_true", help="run every automatic check, print the results and exit")
    ap.add_argument("--trust", action="store_true", help="run the map's checks (shell commands, network calls): only for a project you trust")
    a = ap.parse_args()
    if a.trust:
        UNTRUSTED = False
    ROOT = Path(a.root).resolve()
    MAP_DIR = ROOT / ".miraterminal"
    if a.validate or a.check:
        if not map_path().exists():
            raise SystemExit(f"not found: {map_path()}")
        m = read_map()
        errs = validate(m)
        print(f"{len(m.get('nodes', []))} blocks, {len(m.get('links', []))} links, {sum(len(e.get('checks') or []) for e in elements(m).values())} checks")
        for e in errs:
            print("  error:", e)
        if a.check and not errs:
            res = run_checks(None, manual=False, force=True)
            for k, r in res.items():
                for c in r["checks"]:
                    if c["status"] != "pending":
                        print(f"  {c['status']:5} {k:32} {c['label']} ({c.get('ms', 0)} ms) {c.get('detail', '')}")
        raise SystemExit(1 if errs else 0)
    port = free_port(a.port)
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    url = f"http://127.0.0.1:{port}/?k={TOKEN}"
    print(f"miraterminal: {url}  (root {ROOT})", flush=True)
    if not map_path().exists():
        print("  no .miraterminal/map.json yet: ask Claude for /miraterminal to generate the map", flush=True)

    if not a.no_open:
        threading.Timer(0.4, (lambda: webbrowser.open(url)) if a.browser else (lambda: open_window(url))).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
