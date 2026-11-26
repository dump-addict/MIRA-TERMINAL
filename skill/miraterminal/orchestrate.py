#!/usr/bin/env python3
"""miraterminal: draws the diagram of a project with several readers at once.

The code index (index.py, no AI) cuts the project into parts. Each part is read in full by its own readers, all at the same time :
one cuts it into blocks, one lists its links with their proof (file, line, extract), one writes the notes. A lead then decides
the final blocks from every reader's report (one call). Everything else is mechanical: links are attached to blocks through
their proof, each proof is checked in the code, imports and matched HTTP calls come from the index.
The map is written as soon as its structure is known; flows and notes are added right after.

    python3 orchestrate.py --root . [--model sonnet] [--cap 60000] [--workers 12]
Progress goes to stdout as lines "MIRA {json}"; the last one holds the timings.
"""
from __future__ import annotations
import shutil
import argparse, concurrent.futures as cf, json, math, os, re, subprocess, sys, tempfile, time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import index as IX  # noqa: E402

ROOT = Path(".")
FULL: dict = {}
idx: dict = {}
SRC: list = []
TESTS: list = []   # test files: placed in the diagram and linked through their imports, not read line by line
READ: set = set()  # the source files the readers are given; a large project leaves some out (see choose_read)
A = None            # arguments
T0 = time.time()
STATS = {"calls": 0, "cost": 0.0, "out": 0, "in": 0, "fresh": 0, "cache_w": 0, "cache_r": 0, "errors": []}
SCRATCH = tempfile.mkdtemp(prefix="mira-")   # the readers run in an empty folder: no project instructions, no tools
tok = lambda f: max(1, idx[f]["bytes"] // 2)   # measured: about 2 characters per token on numbered code


def emit(phase: int, step: str, **more):
    print("MIRA " + json.dumps({"phase": phase, "step": step, "t": round(time.time() - T0, 1), **more}), flush=True)


# --- one call to the agent, no tools -----------------------------------------------------------------------------
SYSTEM = ("You extract software architecture from code. Answer with the requested JSON only. The diagram is written in English: every label, summary, "
          "note and sentence you write must be in English, whatever the language of the code, of its comments, or the language you are otherwise set to answer in.")


def ask(prompt: str, model: str | None = None, effort: str | None = "", timeout=900, session: str | None = None, keep: bool = False) -> dict:
    """one question, no tools, with the agent the user chose. The model is the agent's own default unless one is given."""
    model = model or A.model
    effort = A.effort if effort == "" else effort
    agent, t0 = A.agent, time.time()
    out_file = os.path.join(SCRATCH, f"answer-{os.getpid()}-{time.time_ns()}.txt")
    text = prompt
    if agent == "claude":
        cmd = [A.bin, "-p", "--tools", "", "--strict-mcp-config", "--no-chrome", "--settings", '{"disableAllHooks":true,"language":"english"}',
               "--output-format", "json"] + (["--model", model] if model else []) + (["--effort", effort] if effort else [])
        # a part read once can be asked several questions: the first call keeps its session, the others fork it and read the part from the cache
        if session: cmd += ["--resume", session, "--fork-session", "--no-session-persistence"]
        elif keep: cmd += ["--system-prompt", SYSTEM]
        else: cmd += ["--no-session-persistence", "--system-prompt", SYSTEM]
    else:
        text = SYSTEM + " Do not run any command and do not open any file: everything you need is below.\n\n" + prompt
        if agent == "codex":
            cmd = [A.bin, "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "--color", "never", "-o", out_file] + (["-m", model] if model else []) \
                + (["-c", f"model_reasoning_effort={effort}"] if effort else []) + ["-"]
        elif agent == "gemini":
            cmd = [A.bin, "--skip-trust", "-o", "text"] + (["-m", model] if model else []) + ["-p", " "]
        elif agent == "cursor":
            cmd = [A.bin, "-p", "--output-format", "text", "--mode", "ask", "--trust"] + (["--model", model] if model else [])
        elif agent == "copilot":
            # its prompt is an argument, not standard input: a part too large for a command line cannot be sent
            # Windows cuts a command line at 32 767 characters (8 191 through the copilot.cmd shim)
            if len(text) > (7_000 if sys.platform == "win32" else 120_000):
                return {"result": "", "wall": 0, "error": "part too large for this agent"}
            cmd, text = [A.bin, "--no-color"] + (["--model", model] if model else []) + ["-p", text], ""
        elif agent == "grok":
            # headless, no tool is approved: it can only answer. The prompt goes through a file (a command line is too short)
            prompt_file = out_file + ".prompt"
            with open(prompt_file, "w", encoding="utf-8") as fh:
                fh.write(text)
            cmd, text = [A.bin, "--no-auto-update", "--output-format", "plain"] + (["--model", model] if model else []) + ["--prompt-file", prompt_file], ""
        else:
            return {"result": "", "wall": 0, "error": f"unknown agent {agent}"}
    try:
        p = subprocess.run(cmd, input=text, capture_output=True, text=True, cwd=SCRATCH, timeout=timeout)
    except Exception as e:  # noqa: BLE001
        STATS["errors"].append(str(e)[:200])
        return {"result": "", "wall": time.time() - t0, "error": str(e)[:200]}
    STATS["calls"] += 1
    if os.path.exists(out_file + ".prompt"):
        os.remove(out_file + ".prompt")
    if agent != "claude":
        res = ""
        if agent == "codex" and os.path.exists(out_file):
            res = open(out_file, errors="ignore").read(); os.remove(out_file)
        res = res or p.stdout
        if p.returncode != 0 or not res.strip():
            err = (p.stderr or p.stdout or "no answer").strip().splitlines()[-1][:200] if (p.stderr or p.stdout).strip() else "no answer"
            STATS["errors"].append(err)
            return {"result": "", "wall": time.time() - t0, "error": err}
        return {"result": res, "wall": time.time() - t0, "out": len(res) // 4}
    try:
        o = json.loads(p.stdout)
    except Exception:  # noqa: BLE001
        err = (p.stderr or p.stdout or "no answer").strip()[-200:]
        STATS["errors"].append(err)
        return {"result": "", "wall": time.time() - t0, "error": err}
    u = o.get("usage", {})
    STATS["cost"] += o.get("total_cost_usd") or 0; STATS["out"] += u.get("output_tokens", 0)
    STATS["in"] += u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
    STATS["fresh"] += u.get("input_tokens", 0); STATS["cache_w"] += u.get("cache_creation_input_tokens", 0); STATS["cache_r"] += u.get("cache_read_input_tokens", 0)
    if o.get("is_error"):
        STATS["errors"].append(str(o.get("result"))[:200])
    return {"result": "" if o.get("is_error") else o.get("result", ""), "wall": time.time() - t0, "out": u.get("output_tokens", 0), "error": o.get("result") if o.get("is_error") else None, "session": o.get("session_id")}


def parse(raw: str):
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", (raw or "").strip())
    a, b = raw.find("{"), raw.rfind("}")
    raw = raw[a:b + 1] if a >= 0 else raw
    for fix in (lambda s: s, lambda s: re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", s), lambda s: s.replace("“", '"').replace("”", '"')):
        try:
            return json.loads(fix(raw))
        except Exception:  # noqa: BLE001
            continue
    return None


def ask_json(prompt: str, model=None, effort: str | None = "", session: str | None = None) -> dict | None:
    r = ask(prompt, model, effort, session=session)
    d = parse(r["result"])
    if d is None and not r.get("error"):
        d = parse(ask(prompt + "\n\nReturn strictly valid JSON (escape backslashes and quotes inside strings).", model, effort)["result"])
    return d


# --- cutting the project into parts ------------------------------------------------------------------------------
BOUND = re.compile(r"^\s*$|^\s*</?script|^\s*</?style|^\s*(async\s+)?function\s|^\s*(def|class)\s|^\s*// -{3,}|^\s*/\* ")


def links_of(f):
    return len(idx[f].get("imports", [])) + len(idx[f].get("imported_by", []))


def choose_read(budget):
    """the source files the readers are given. Above the budget, a project is not refused: the files that say least about
    the architecture are left out, and each is placed in the diagram next to the files of its folder.
    First the many look-alike files of one folder (pages of a site, translations, migrations): a few of them are read.
    Then markup, styles, docs and config before code, the least connected and the largest first, one read file per folder kept."""
    read = set(SRC)
    load = sum(tok(f) for f in read)
    if load <= budget:
        return read
    alike = defaultdict(list)
    for f in SRC:
        alike[(os.path.dirname(f), os.path.splitext(f)[1])].append(f)
    for fs in sorted((v for v in alike.values() if len(v) > 3), key=lambda v: -sum(map(tok, v))):
        if load <= budget:
            break
        for f in sorted(fs, key=lambda x: (-links_of(x), tok(x)))[3:]:
            read.discard(f); load -= tok(f)
    LIGHT = {"html": 0, "css": 0, "doc": 0, "config": 1, "other": 1}
    order = sorted(read, key=lambda f: (LIGHT.get(idx[f].get("lang"), 2), links_of(f), -tok(f)))
    for keep_folder in (True, False):
        for f in order:
            if load <= budget:
                return read
            if f not in read:
                continue
            d = os.path.dirname(f)
            if keep_folder and not any(g != f and os.path.dirname(g) == d for g in read):
                continue
            read.discard(f); load -= tok(f)
    return read


def read_lines(path):
    try:
        return (ROOT / path).read_text(errors="ignore").splitlines()
    except OSError:
        return []


def segments(path, cap):
    lines = read_lines(path)
    n = math.ceil(tok(path) / (cap * 0.9)); L = len(lines); cuts = [0]
    for k in range(1, n):
        t = k * L // n; best = t
        for d in range(0, 80):
            hit = next((c for c in (t - d, t + d) if 0 < c < L and BOUND.match(lines[c])), None)
            if hit is not None:
                best = hit; break
        cuts.append(best)
    cuts.append(L)
    return [(path, cuts[i] + 1, cuts[i + 1]) for i in range(len(cuts) - 1) if cuts[i + 1] > cuts[i]]


def utok(u):
    path, a, b = u
    return tok(path) if a is None else max(1, int(tok(path) * (b - a + 1) / max(1, idx[path]["lines"])))


def partition(cap):
    # only the files that are read: tests, data and generated files are in the index but not in the parts
    read = READ
    comms = [[f for f in c if f in read] for c in IX.communities(FULL)]
    comms = sorted((c for c in comms if c), key=lambda c: -sum(map(tok, c)))
    pieces = []
    for c in comms:
        if sum(map(tok, c)) <= cap:
            pieces.append([(f, None, None) for f in c]); continue
        byd = defaultdict(list)
        for f in c:
            byd[os.path.dirname(f)].append(f)
        for fs in byd.values():
            if sum(map(tok, fs)) <= cap:
                pieces.append([(f, None, None) for f in fs]); continue
            small = []
            for f in fs:
                if tok(f) > cap:
                    pieces += [[s] for s in segments(f, cap)]
                else:
                    small.append(f)
            cur, load = [], 0
            for f in sorted(small, key=lambda x: -tok(x)):
                if load + tok(f) > cap and cur:
                    pieces.append(cur); cur, load = [], 0
                cur.append((f, None, None)); load += tok(f)
            if cur:
                pieces.append(cur)
    pieces.sort(key=lambda p: -sum(map(utok, p)))
    _, G = IX.graph(FULL)

    def aff(p, b):
        fa, fb = {u[0] for u in p}, {u[0] for u in b["units"]}
        s = sum(G[x].get(y, 0) for x in fa for y in fb if x != y) + 4 * len(fa & fb)
        return s + 0.3 * len({os.path.dirname(x) for x in fa} & {os.path.dirname(y) for y in fb})

    target = math.ceil(sum(sum(map(utok, p)) for p in pieces) / cap)
    bins = []
    for p in pieces:
        w = sum(map(utok, p))
        fit = [b for b in bins if b["load"] + w <= cap]
        best = max(fit, key=lambda b: aff(p, b), default=None)
        if best is not None and (aff(p, best) > 0 or len(bins) >= target):
            best["units"] += p; best["load"] += w
        else:
            bins.append({"units": list(p), "load": w})
    for b in bins:
        b["units"].sort(key=lambda u: (u[0], u[1] or 0))
    return bins


# --- what a reader is given --------------------------------------------------------------------------------------
def facts_of(f):
    i = idx[f]; b = []
    if i["imports"]: b.append("imports " + ", ".join(f"{x['path']}@{x['line']}" for x in i["imports"]))
    if i.get("imported_by"): b.append("used by " + ", ".join(f"{x['path']}@{x['line']}" for x in i["imported_by"]))
    if i["routes"]: b.append("serves " + ", ".join(f"{r['method']} {r['path']}@{r['line']}" for r in i["routes"]))
    hc = [c for c in i["http_calls"] if c.get("handler")]
    if hc: b.append("calls " + ", ".join(sorted({f"{c['path']} -> {c['handler']['path']}" for c in hc})))
    if i["urls"]: b.append("hosts " + ", ".join(f"{u['host']}@{u['line']}" for u in i["urls"]))
    if i["contracts"]: b.append("declares " + ", ".join(f"{c['kind']} {c['name']}@{c['line']}" for c in i["contracts"]))
    if i["entries"]: b.append("entry " + ", ".join(f"{e['kind']}@{e['line']}" for e in i["entries"]))
    return f"{f}: " + ("; ".join(b) if b else "no facts")


OUTLINE = re.compile(r"^\s*(?:(?:async\s+)?function\s+\w+|<script[^>]*>|<style[^>]*>|<(?:section|main|nav|header|dialog)\b[^>]*id=|(?:def|class)\s+\w+|@app\.\w+\(|// -{3,}.*|/\* =+.*)")


def project_map():
    out = []
    for f in SRC:
        i = idx[f]; b = []
        if i["contracts"]: b.append("declares " + ", ".join(f"{c['kind']} {c['name']}" for c in i["contracts"]))
        if i["routes"]: b.append(f"serves {len(i['routes'])} routes (" + ", ".join(sorted({r['path'] for r in i['routes']})[:6]) + (" ..." if len(i['routes']) > 6 else "") + ")")
        if i["entries"]: b.append("entry: " + ", ".join(sorted({e['kind'] for e in i['entries']})))
        if i.get("imported_by"): b.append(f"used by {len(i['imported_by'])} file(s)")
        if f not in READ: b.append("not read, too large a project: it belongs with its folder")
        out.append(f + (" — " + "; ".join(b) if b else ""))
    other = defaultdict(Counter)
    for f, i in idx.items():
        if i["kind"] != "source":
            other[os.path.dirname(f) or "."][os.path.splitext(f)[1].lstrip(".") or "file"] += 1
    data = [f"{d}/ — " + ", ".join(f"{n} {e}" for e, n in c.most_common(4)) for d, c in sorted(other.items())]
    tdirs = Counter(os.path.dirname(f) or "." for f in TESTS)
    if tdirs:
        data += [f"{d}/ — {n} test file{'s' if n > 1 else ''} (not read: tests are one block of the diagram)" for d, n in sorted(tdirs.items())[:60]]
    return ("## Project map (every source file of the project; yours are given in full below)\n" + "\n".join(out)
            + "\n\n## Data and media folders (not read; use the folder path as a target)\n" + "\n".join(data) + "\n\n")


def content(units):
    facts, body, seen = [], [], set()
    for path, a, b in units:
        lines = read_lines(path)
        if path not in seen:
            seen.add(path); facts.append(facts_of(path))
        if a is None:
            body.append(f"=== {path} ({len(lines)} lines) ===\n" + "\n".join(f"{n}\t{l}" for n, l in enumerate(lines, 1)))
        else:
            out = [f"{n}: {l.strip()[:90]}" for n, l in enumerate(lines, 1) if OUTLINE.match(l)][:400]
            body.append(f"=== {path} (lines {a}-{b} of {len(lines)}; outline of the whole file first) ===\n[outline]\n" + "\n".join(out)
                        + f"\n[lines {a}-{b}]\n" + "\n".join(f"{n}\t{lines[n - 1]}" for n in range(a, min(b, len(lines)) + 1)))
    return "## Facts from the code index\n" + "\n".join(facts) + "\n\n## Files of your part\n" + "\n\n".join(body) + "\n\n"


KINDS = "user, app, wallet, server, api, gateway, engine, math, worker, queue, cache, relay, clock, alert, contract, oracle, swap, token, feed, stream, external, chain, database, cloud, cdn, research, test, key, chart, deploy, security, auth, code, mobile, desktop, extension, game, admin, ai, payment, email, notify, storage, sheet, search, cms, media, webhook, device, docs, cli, site, team, agent, vector, pipeline, warehouse, events, logs, container, lb, network, dns, infra, ci, repo, package, automation, chat, realtime, video, maps, calendar, flags, firmware, backup, bridge, indexer, mcp, scraper, training, gpu, evals, speech, dataset, ui, i18n, function, crm, shop, ledger, kyc, org, governance, xr, sandbox, proxy, coordination, workflow, parser, connector, renderer, browser, federation, p2p, os, telephony, shipping, erp, gameserver, other"
COMMON = '''You are one of several readers building an architecture diagram (C4 containers and components) of a software project. Above: the project map (every source file), the exact facts already extracted from your part, then your part in full with line numbers. No tools: answer in one go. Report the structure only, never bugs or code quality. Write every label, summary and note in English, sentence case, even when the code and its comments are in another language.
'''
ASK_BLOCKS = COMMON + f'''
Task: cut your part into blocks.
- A block is a running unit (page, server, worker, contract, script group, deploy unit, data store) or a component inside one (a module that matters, a unit someone would open on its own).
- Every file of the part goes into exactly one block, or into "unassigned" (pure repo config or docs). A large file can hold several components: give each its line range as "path:start-end".
- Never merge two different things: two wallets, two keys or two services with different roles are two blocks.
- A file several blocks use (a helper, a shared component, a utils module, a types file) goes into a block of shared code, never into one of the blocks that use it. The facts say who uses each file ("used by").
- Mark as legacy the files nothing serves, imports or deploys (they still belong to a block).
- Kinds: {KINDS}. Take the most precise one; when none fits, "other" (never a kind outside this list). A monolith serving pages and API is server; nginx or PgBouncer in front is proxy; Kafka or NATS is events, a job queue is queue; relay and bridge are crypto only (an integration adapter is connector); ai is a model that answers, math a calculation of the project's own.
- Name a block by what it is ("Quote signer", "Settlement worker"), 1 to 3 words. The summary is one short sentence saying what it does.

Answer with this JSON only, compact, arrays not objects, no prose:
{{"b":[["kebab-id","Label","kind","parent-id or null",["path","path:start-end"],"one sentence summary"]],"legacy":["path"],"unassigned":["path"]}}'''
ASK_LINKS = COMMON + '''
Task: list every relation that leaves a file of your part.
- What counts: an import, a call, an HTTP or WebSocket request, a JSON-RPC or contract call, a transaction, a shell command that runs another file, a file read or written, a config or deploy reference, a page that loads a script.
- What does not count: a sentence in a README, a report or a comment; a relation between two lines of the same component.
- The source is the line that proves it: "path:line:match", match being a literal substring (3 to 40 chars) of that line, copied as is.
- The target is a file of the project (exact path from the project map: the contract, the route handler, the module, the script), or "ext:<name>" for a system that is not in the project map (hosted service, chain, CDN, wallet, token contract, another server).
- Two external systems with different roles get two names (a wallet that pays and a wallet that is only displayed, a node and an explorer).
- Go through the part twice: once following the code from each entry point, once looking only for what points outside (hosts, addresses, paths, environment and config).
- One line per distinct relation (same source file and same target: once, with its best proof).
- The facts above already hold every "imports" and every matched "calls ... -> handler file": they are added to the diagram automatically, do NOT list them again. List everything else, including calls to routes the facts did not match.
- A path read or written at runtime that is not in the project map (a log, a ledger, a cache, an .env file): give the path as the target.
- When a line makes something move between two outside systems (a transfer from one wallet to another, a token burned from a user's wallet, fees claimed from a program to a wallet), add that relation too, with the outside source as a 4th item.

Answer with this JSON only, compact, arrays not objects, no prose:
{"l":[["path:line:match","target path or ext:name","what moves, 2 to 4 words"],["path:line:match","ext:target","what moves","ext:source"]]}'''
ASK_BOTH = COMMON + f'''
Two tasks on your part, in one answer.

Task 1: cut your part into blocks.
- A block is a running unit (page, server, worker, contract, script group, deploy unit, data store) or a component inside one (a module that matters, a unit someone would open on its own).
- Every file of the part goes into exactly one block, or into "unassigned" (pure repo config or docs). A large file can hold several components: give each its line range as "path:start-end".
- Never merge two different things: two wallets, two keys or two services with different roles are two blocks.
- A file several blocks use (a helper, a shared component, a utils module, a types file) goes into a block of shared code, never into one of the blocks that use it. The facts say who uses each file ("used by").
- Mark as legacy the files nothing serves, imports or deploys (they still belong to a block).
- Kinds: {KINDS}.
- Name a block by what it is ("Quote signer", "Settlement worker"), 1 to 3 words. The summary is one short sentence saying what it does.

Task 2: list every relation that leaves a file of your part.
- What counts: an import, a call, an HTTP or WebSocket request, a JSON-RPC or contract call, a transaction, a shell command that runs another file, a file read or written, a config or deploy reference, a page that loads a script. Not a sentence in a README or a comment, not a relation inside one component.
- The source is the line that proves it: "path:line:match", match being a literal substring (3 to 40 chars) of that line, copied as is.
- The target is a file of the project (exact path from the project map), or "ext:<name>" for a system that is not in the project map (hosted service, chain, CDN, wallet, token contract, another server). Two outside systems with different roles get two names.
- Look twice: once following the code from each entry point, once only for what points outside (hosts, addresses, paths, environment and config).
- One line per distinct relation. The facts above already hold every "imports" and every matched "calls ... -> handler file": do NOT list them again.
- A path read or written at runtime that is not in the project map: give the path as the target.
- When a line makes something move between two outside systems, add that relation with the outside source as a 4th item.

Answer with this JSON only, compact, arrays not objects, no prose:
{{"b":[["kebab-id","Label","kind","parent-id or null",["path","path:start-end"],"one sentence summary"]],"legacy":["path"],"unassigned":["path"],
 "l":[["path:line:match","target path or ext:name","what moves, 2 to 4 words"],["path:line:match","ext:target","what moves","ext:source"]]}}'''
ASK_NOTES = COMMON + '''
Task: write the notes someone needs before working on each component of your part.
- One entry per component: a file, or "path:start-end" for a component inside a large file.
- details: 2 to 4 short lines, facts only (how it starts, its limits and timings, what it stores, what it refuses), separated by " / ".
- tech: the libraries and frameworks it really uses (0 to 4 names).
- todos: open points written in the code (TODO, FIXME) or plain gaps you can prove from the code (a variable read but not documented, a comment that contradicts the code). 0 to 2, never a guess.

Answer with this JSON only, compact, arrays not objects, no prose:
{"n":[["path or path:start-end","details","tech, tech",["todo"]]]}'''


# --- proofs ------------------------------------------------------------------------------------------------------
_cache: dict = {}


def ev_parse(s):
    m = re.match(r"(.+?):(\d+):(.*)$", s or "", re.S)
    return {"path": m.group(1), "line": int(m.group(2)), "match": m.group(3).strip()} if m else None


def ev_fix(ev):
    """a proof is kept only when its extract is really there; a line number off by a few lines is put right"""
    if not ev or ev["path"] not in idx:
        return None
    L = _cache.setdefault(ev["path"], read_lines(ev["path"]))
    ln, m = ev["line"], (ev["match"] or "").lower()
    if not m or not 1 <= ln <= len(L):
        return None
    for d in (0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5):
        if 1 <= ln + d <= len(L) and m in L[ln + d - 1].lower():
            return {"path": ev["path"], "line": ln + d, "match": ev["match"][:60]}
    return None


# --- the lead: final blocks from the readers' reports -----------------------------------------------------------
def lead_prompt(pblocks, legacy, unassigned):
    return '''You are the lead architect merging the reports of several readers into ONE architecture diagram of a software project (C4: containers, and components inside them). Each reader saw only a part of the code and cut it into blocks. You do not rewrite their blocks: you say how they are grouped. Answer as briefly as the format allows.

Rules
- Top level: at most 15 blocks with code, one per deployable or per domain (the web app, the server, the contracts, the hosting, the research code, the test bench, the old versions), never one per page or per script. Start with one "user" block (no reader block).
- Every reader block goes into exactly one top-level block: either it IS that block (same thing, possibly seen by several readers) or it becomes one of its components. Two levels only.
- "merge": components that are the same thing seen twice (same file, or ranges of one file forming one component), and a component too small to matter on its own (a helper, a style sheet, a file of constants) with the component it serves: list the bigger one first. Aim at 3 to 8 components per top-level block. Never merge two things with different roles.
- Old, unused code goes together in one top-level block of kind "code" labelled as old versions.
- Groups are columns in flow order on row 0 (users, clients, backend, contracts or data stores, then always one last column with the id "external" for the outside systems) and a bottom row 1 for infrastructure, research and tools, old versions. 4 to 7 groups. The outside systems themselves are sorted by someone else: do not list them.
- Everything in English, sentence case, even when the readers' text is in another language. Labels of 1 to 3 words, summaries of one short sentence.

Answer with this JSON only, compact, arrays not objects where shown, no prose:
{"summary":"one sentence saying what the project is",
 "groups":[["id","Label",col,row]],
 "top":[["id","Label","kind","group id","one sentence summary",[numbers of the reader blocks that ARE this block],[numbers of the reader blocks that become its components]]],
 "merge":[[numbers of components that are one same thing]],
 "files":{"unassigned path":"top-level id"}}

Every reader block number appears exactly once in "top". Every unassigned file is given.

## Reader blocks (number | label | kind | reader's parent | files or ranges | summary)
''' + "\n".join(f"{i} | {b['label']} | {b['kind']} | {b['parent']} | {', '.join(map(str, b['ranges']))} | {b['summary']}" for i, b in enumerate(pblocks)) \
        + "\n\n## Legacy files\n" + ", ".join(legacy) + "\n\n## Unassigned files (repo config, docs)\n" + ", ".join(unassigned) + "\n"


def outside_prompt(pblocks, ext, paths):
    return '''Readers of a software project named the outside systems and the runtime paths its code talks to, each in their own words. Sort them for the architecture diagram. Answer as briefly as the format allows.

- One node for each real system: merge the names that mean the same system, keep different roles apart (a wallet that pays and a wallet that is only displayed are two; a node and an explorer are two).
- Kinds: external, chain, feed, swap, token, wallet, auth, cdn, cloud, alert, oracle, contract, database, ai, payment, email, notify, storage, search, cms, maps, video, chat, logs, dns, repo, package, automation, calendar, flags, sheet, bridge, indexer, vector, warehouse, events, mcp, gpu, speech, crm, shop, kyc, org, governance, connector, federation, telephony, shipping, erp, p2p; "other" when none fits.
- Third-party libraries and tools (a framework, a compiler, a browser API such as local storage, the language runtime) are not systems: list them in "drop".
- Runtime and data paths (a log, a ledger, a cache, an env file): give each the number of the code block that owns that data, or make it a node of kind database or key when several blocks share it, or null when irrelevant.
- English, sentence case, labels of 1 to 3 words, one short sentence per summary. "s" marks a secondary system (small card).

Answer with this JSON only, compact, no prose:
{"ext":[["kebab-id","Label","kind","one sentence summary","s or null",["ext:name","other name or path of the same thing"]]],
 "drop":["ext:name"],
 "paths":{"path":block number or null}}

Every name and every path appears exactly once.

## Outside names used by the readers (count)
''' + "\n".join(f"{k} ({v})" for k, v in ext.most_common()) \
        + "\n\n## Paths outside the code used as targets (count)\n" + "\n".join(f"{k} ({v})" for k, v in paths.most_common()) \
        + "\n\n## Code blocks (number | label | kind | files)\n" + "\n".join(f"{i} | {b['label']} | {b['kind']} | {', '.join(map(str, b['ranges'][:4]))}" for i, b in enumerate(pblocks)) + "\n"


def build_nodes(d, o, pblocks):
    """the lead's grouping + the readers' blocks -> final blocks, where each reader block ends up, and where each external name goes"""
    nodes, where, extmap, alias = {}, {}, {}, {}
    slug = lambda t: re.sub(r"[^a-z0-9]+", "-", str(t).lower()).strip("-") or "block"

    def uid(base):
        k, n = base, 2
        while k in nodes:
            k = f"{base}-{n}"; n += 1
        return k

    ok = lambda i: isinstance(i, int) and 0 <= i < len(pblocks) and i not in where
    for t in d.get("top", []):
        if not (isinstance(t, list) and len(t) >= 5):
            continue
        tid = uid(slug(t[0])); alias[str(t[0])] = tid
        own = [i for i in (t[5] if len(t) > 5 and isinstance(t[5], list) else []) if ok(i)]
        for i in own: where[i] = tid
        summary = str(t[4] or "").strip() or (pblocks[own[0]]["summary"] if own else "")
        nodes[tid] = {"id": tid, "label": t[1], "kind": t[2], "parent": None, "group": t[3], "summary": summary, "size": None}
        comps = [i for i in (t[6] if len(t) > 6 and isinstance(t[6], list) else []) if ok(i)]
        # components that are one same thing take one block
        same = {}
        for grp in d.get("merge", []):
            g = [i for i in grp if i in comps] if isinstance(grp, list) else []
            for i in g[1:]: same[i] = g[0]
        for i in comps:
            if i in same and same[i] in where:
                where[i] = where[same[i]]; continue
            b = pblocks[i]
            cid = uid(slug(b["key"].split(":", 1)[1]))
            nodes[cid] = {"id": cid, "label": b["label"], "kind": b["kind"], "parent": tid, "group": t[3], "summary": b["summary"], "size": None}
            where[i] = cid
    # a reader block the lead forgot: a component of the top-level block that holds its folder, else a block of its own
    for i, b in enumerate(pblocks):
        if i in where:
            continue
        folder = os.path.dirname(str(b["ranges"][0]).split(":")[0]) if b["ranges"] else ""
        near = Counter(nodes[where[j]]["parent"] or where[j] for j, o in enumerate(pblocks) if j in where and o["ranges"] and os.path.dirname(str(o["ranges"][0]).split(":")[0]) == folder)
        cid = uid(slug(b["key"].split(":", 1)[1]))
        par = near.most_common(1)[0][0] if near else None
        nodes[cid] = {"id": cid, "label": b["label"], "kind": b["kind"], "parent": par, "group": nodes[par]["group"] if par else "", "summary": b["summary"], "size": None}
        where[i] = cid
    xg = next((g[0] for g in d.get("groups", []) if isinstance(g, list) and g and g[0] == "external"), None) or next((g[0] for g in reversed(d.get("groups", [])) if isinstance(g, list) and len(g) >= 4 and g[3] == 0), "")
    for e in (o or {}).get("ext", []):
        if not (isinstance(e, list) and len(e) >= 3):
            continue
        eid = uid(slug(e[0]))
        nodes[eid] = {"id": eid, "label": e[1], "kind": e[2], "parent": None, "group": xg, "summary": str(e[3] if len(e) > 3 else ""), "size": "s" if len(e) > 4 and e[4] == "s" else None}
        for name in (e[5] if len(e) > 5 and isinstance(e[5], list) else []):
            extmap[str(name)] = eid
    for path, i in ((o or {}).get("paths") or {}).items():
        if isinstance(i, int) and i in where:
            extmap[str(path)] = where[i]
    # two outside systems with the same name are one system; two components with the same name under one parent are one component
    first, merged = {}, {}
    for v in list(nodes.values()):
        key = (v["parent"], str(v["label"]).strip().lower())
        if key in first and (v["parent"] or not any(where[i] in (v["id"], first[key]) for i in where)):
            merged[v["id"]] = first[key]; del nodes[v["id"]]
        else:
            first.setdefault(key, v["id"])
    if merged:
        for i in where:
            where[i] = merged.get(where[i], where[i])
        for k in extmap:
            extmap[k] = merged.get(extmap[k], extmap[k])
        for v in nodes.values():
            if v["parent"] in merged: v["parent"] = merged[v["parent"]]
    # a kind the viewer does not know would have no icon
    known = {k.strip() for k in KINDS.split(",")}
    for v in nodes.values():
        if v["kind"] not in known: v["kind"] = "code" if any(where[i] == v["id"] for i in where) else "external"
    return nodes, where, extmap, alias


FAMILIES = [("wallets", "Wallets", {"wallet"}),
            ("onchain", "Chain and programs", {"chain", "token", "contract", "swap", "oracle"}),
            ("hosting", "Hosting and delivery", {"cloud", "cdn", "deploy", "site"}),
            ("data", "Data services", {"database", "storage", "cache", "queue", "search", "sheet"}),
            ("accounts", "Accounts and messaging", {"auth", "payment", "email", "notify", "alert", "team"})]


def split_tall(groups, nodes):
    """a column of more than 7 blocks is hard to read: its second half moves to a new column right next to it"""
    for g in list(groups):
        mine = [v for v in nodes.values() if v["group"] == g["id"] and not v["parent"]]
        if len(mine) <= 7:
            continue
        cols = math.ceil(len(mine) / 7); per = math.ceil(len(mine) / cols)
        for o in groups:
            if o["row"] == g["row"] and o["col"] > g["col"]: o["col"] += cols - 1
        for c in range(1, cols):
            g2 = {"id": f"{g['id']}-{c + 1}", "label": g["label"], "col": g["col"] + c, "row": g["row"]}
            groups.append(g2)
            for v in mine[c * per:(c + 1) * per]: v["group"] = g2["id"]
    for v in nodes.values():   # components follow their parent
        if v["parent"] and v["parent"] in nodes: v["group"] = nodes[v["parent"]]["group"]
    return groups


def spread_outside(groups, nodes, xg):
    """the outside systems of a project can be many: one tall column is unreadable. They are split by nature into a few
       columns (the wallets, the chain with its programs, the hosting, the other services), next to each other."""
    out = [v for v in nodes.values() if v["group"] == xg and not v["parent"]]
    if len(out) <= 6:
        return split_tall(groups, nodes)
    fam = {}
    for v in out:
        fam[v["id"]] = next((fid for fid, _, kinds in FAMILIES if v["kind"] in kinds), xg)
    sizes = Counter(fam.values())
    keep = [f for f in FAMILIES if sizes.get(f[0], 0) >= 2 and sizes.get(f[0], 0) < len(out)]
    if not keep:
        return split_tall(groups, nodes)
    base = next((g for g in groups if g["id"] == xg), None)
    col = base["col"] if base else max((g["col"] for g in groups if g["row"] == 0), default=0) + 1
    new, k = [], 0
    for fid, label, _ in keep:
        new.append({"id": fid, "label": label, "col": col + k, "row": 0}); k += 1
    left = [v for v in out if fam[v["id"]] not in {f[0] for f in keep}]
    if base:
        if left: base["col"] = col + k; base["label"] = "Outside services"
        else: groups = [g for g in groups if g["id"] != xg]
    for v in out:
        if fam[v["id"]] in {f[0] for f in keep}:
            v["group"] = fam[v["id"]]
    return split_tall(groups + new, nodes)


VERIFY = '''You check links of an architecture diagram against the code. For each claim: the source block, the target block, what is said to move, and the code around the cited line. Judge only from the snippet and the file path.
- "ok": the snippet shows a relation between these two blocks (a call, an import, a request, a transaction, a file read or written, a command run, a config reference), in either direction. A block with no file is an outside system named in its description. Judge the relation, not the wording of the label.
- "bad": the snippet does not show it, or shows a relation with a different target.
- "unsure": the snippet is not enough to decide.
Answer with this JSON only: {"ok":[ids],"bad":[ids],"unsure":[ids]}

Claims
'''


def run():
    emit(2, "Reading the files (no AI)")
    parts = partition(A.cap)
    pmap = project_map()
    n = len(parts)
    ex = cf.ThreadPoolExecutor(max_workers=A.workers)
    body = [pmap + content(p["units"]) for p in parts]
    if A.mode == "one":
        # the least reading: each part is read once and answers blocks and links together (notes are left out)
        fb = [ex.submit(ask_json, body[k] + ASK_BOTH, A.reader_model, A.links_effort) for k in range(n)]
        fl, fn = fb, []
    elif A.mode == "cached" and A.agent == "claude":
        # each part is read once and kept in a session; its three questions fork that session and read the part from the cache
        def primed(k):
            r = ask(body[k] + "Read this part. More questions follow. For now answer with the single word READY.", A.reader_model, "low", keep=True)
            return r.get("session")
        prim = [ex.submit(primed, k) for k in range(n)]

        def after(k, question, model, effort=""):
            sid = prim[k].result()
            return ask_json(question, model, effort, session=sid) if sid else ask_json(body[k] + question, model, effort)
        fb = [ex.submit(after, k, ASK_BLOCKS, A.reader_model) for k in range(n)]
        fl = [ex.submit(after, k, ASK_LINKS, A.links_model or A.reader_model, A.links_effort) for k in range(n)]
        fn = [ex.submit(after, k, ASK_NOTES, A.notes_model or A.reader_model) for k in range(n)] if not A.no_notes else []
    else:
        fb = [ex.submit(ask_json, body[k] + ASK_BLOCKS, A.reader_model) for k in range(n)]
        # the links answer grows with the amount of code: it is read on smaller parts, by more readers at once
        lparts = partition(A.links_cap) if A.links_cap < A.cap else parts
        fl = [ex.submit(ask_json, pmap + content(p["units"]) + ASK_LINKS, A.links_model or A.reader_model, A.links_effort) for p in lparts]
        fn = [ex.submit(ask_json, body[k] + ASK_NOTES, A.notes_model or A.reader_model) for k in range(n)] if not A.no_notes else []
    readers = len(fb) + (0 if fl is fb else len(fl)) + len(fn)
    emit(3, f"{n} part{'s' if n > 1 else ''}, {readers} readers at once", parts=n, readers=readers, loads=[p["load"] for p in parts])

    # blocks first: the lead starts as soon as every part is cut, while links and notes are still being read
    pblocks, legacy, unassigned = [], set(), set()
    for k, f in enumerate(fb):
        d = f.result() or {}
        for b in d.get("b", []):
            if isinstance(b, list) and len(b) >= 5:
                pblocks.append({"key": f"{k}:{b[0]}", "label": b[1], "kind": b[2], "parent": b[3], "ranges": b[4] if isinstance(b[4], list) else [b[4]], "summary": b[5] if len(b) > 5 else ""})
        legacy |= set(d.get("legacy", [])); unassigned |= set(d.get("unassigned", []))
    t_blocks = time.time() - T0
    if not pblocks:
        # no reader answered: the agent is not signed in, is out of quota, or refused
        emit(3, "The agent gave no answer: " + (STATS["errors"][0] if STATS["errors"] else "no reply"), error=True)
        return 1
    emit(4, f"{len(pblocks)} blocks found, grouping them", blocks=len(pblocks))
    f_lead = ex.submit(ask_json, lead_prompt(pblocks, sorted(legacy), sorted(unassigned)), A.lead_model)
    links = []
    for f in fl:
        for l in ((f.result() or {}).get("l", [])):
            if isinstance(l, list) and len(l) >= 2:
                links.append({"ev": ev_parse(str(l[0])), "t": str(l[1]), "label": str(l[2]) if len(l) > 2 else "", "s": str(l[3]) if len(l) > 3 and str(l[3]).startswith("ext:") else None})
    t_links = time.time() - T0
    ext = Counter(x for l in links for x in (l["t"], l["s"]) if x and x.startswith("ext:"))
    paths = Counter(l["t"] for l in links if not l["t"].startswith("ext:") and l["t"] not in idx)
    emit(4, f"{len(links)} links read, sorting the outside systems", links=len(links))
    o = ask_json(outside_prompt(pblocks, ext, paths), A.lead_model) if (ext or paths) else {}
    t_out = time.time() - T0
    d = f_lead.result()
    t_lead = time.time() - T0
    if not d or not d.get("top"):
        emit(4, "The agent stopped answering: " + (STATS["errors"][-1] if STATS["errors"] else "no reply"), error=True)
        return 1

    # --- mechanical assembly --------------------------------------------------------------------------------------
    nodes, where, extmap, alias = build_nodes(d, o, pblocks)
    ranges = defaultdict(list)   # path -> [(start, end, node)]
    known = set(SRC) | set(TESTS)
    for i, b in enumerate(pblocks):
        for x in b["ranges"]:
            m = re.match(r"(.+?):(\d+)-(\d+)$", str(x))
            if m: ranges[m.group(1)].append((int(m.group(2)), int(m.group(3)), where[i])); continue
            x = str(x)
            if x in known or x in idx:
                ranges[x].append((0, 10 ** 9, where[i])); continue
            # a folder ("app/models/") or a pattern ("app/models/*.rb") stands for every source file inside it
            stem = re.split(r"[*?\[]", x)[0].rstrip("/")
            ext = os.path.splitext(x)[1] if "*" in x else ""
            inside = [f for f in SRC if (f.startswith(stem + "/") or (stem and "*" in x and f.startswith(stem))) and (not ext or f.endswith(ext))] if stem else []
            for f in inside:
                if f not in ranges: ranges[f].append((0, 10 ** 9, where[i]))
            if not inside: ranges[x].append((0, 10 ** 9, where[i]))
    for f, nid in (d.get("files") or {}).items():
        nid = alias.get(str(nid), nid)
        if nid in nodes and f not in ranges: ranges[f].append((0, 10 ** 9, nid))

    def node_at(path, line=None):
        rs = ranges.get(path)
        if not rs:
            return None
        if line:
            hit = [r for r in rs if r[0] <= line <= r[1] and r[1] < 10 ** 9]
            if hit:
                return min(hit, key=lambda r: r[1] - r[0])[2]
        whole = [r for r in rs if r[1] == 10 ** 9]
        if whole:
            return whole[0][2]
        return Counter(nodes[r[2]]["parent"] or r[2] for r in rs).most_common(1)[0][0]

    # a source file no reader placed: the block that holds most of its folder, else the block of the file that imports it
    for f in SRC:
        if f in ranges or IX_NOISE.search(f):
            continue
        # the nearest folder that holds a placed file: its own, else the one above (a file that was not read lands here)
        near, folder = Counter(), os.path.dirname(f)
        while True:
            near = Counter(n for n in (node_at(g) for g in ranges if os.path.dirname(g) == folder and g in idx) if n)
            if near or not folder:
                break
            folder = os.path.dirname(folder)
            if not folder:
                break   # the files at the root say nothing about a folder
        users = Counter(node_at(x["path"]) for x in idx[f].get("imported_by", []))
        pick = next((c.most_common(1)[0][0] for c in (users, near) if c and c.most_common(1)[0][0]), None)
        if pick:
            ranges[f].append((0, 10 ** 9, pick))
    if TESTS:
        gid = next((g[0] for g in d.get("groups", []) if isinstance(g, list) and len(g) >= 4 and g[3] == 1), None) or next((g[0] for g in d.get("groups", []) if isinstance(g, list)), "")
        nodes["tests"] = {"id": "tests", "label": "Tests", "kind": "test", "parent": None, "group": gid, "summary": f"Automated tests: {len(TESTS)} file{'s' if len(TESTS) > 1 else ''}.", "size": None}
        for f in TESTS:
            if f not in ranges: ranges[f].append((0, 10 ** 9, "tests"))
    # what is still left (repo config, a lone script): one block of its own, so that no source file is outside the diagram
    left = [f for f in SRC if f not in ranges and not IX_NOISE.search(f)]
    if left:
        gid = next((g[0] for g in d.get("groups", []) if isinstance(g, list) and len(g) >= 4 and g[3] == 1), None) or next((g[0] for g in d.get("groups", []) if isinstance(g, list)), "")
        nodes["repo-config"] = {"id": "repo-config", "label": "Repository config", "kind": "code", "parent": None, "group": gid, "summary": "Build, tooling and repository settings.", "size": "s", "from": []}
        for f in left:
            ranges[f].append((0, 10 ** 9, "repo-config"))

    BARREL = re.compile(r"(^|/)(index\.[jt]sx?|__init__\.py|mod\.rs|lib\.rs|index\.vue)$")
    defs = defaultdict(set)   # name -> files that define it
    DEF = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|def|func|fn|struct|trait|module|contract|library|object|record|pub\s+(?:async\s+)?fn|pub\s+struct|pub\s+enum)\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)", re.M)
    for f in SRC:
        for mm in DEF.finditer("\n".join(_cache.setdefault(f, read_lines(f)))):
            if len(mm.group(1)) > 2: defs[mm.group(1)].add(f)

    def by_name(t, ev):
        """the file meant by a link that only names a folder or a re-exporting file: the one that defines a name used on the proof line"""
        L = _cache.setdefault(ev["path"], read_lines(ev["path"]))
        text = L[ev["line"] - 1] if 0 < ev["line"] <= len(L) else ""
        scope = os.path.dirname(t) if BARREL.search(t) else t.rstrip("/")
        best = Counter()
        # only the names this very line brings in: inside the braces of an import, right after "import", at the end of a
        # "use a::b::Name", or a capitalised name it calls on (Rails, Java, C#). A word that merely appears proves nothing.
        names = set()
        for grp in re.findall(r"\{([^}]*)\}", text):
            names |= {x.strip().split(" as ")[0].strip() for x in grp.split(",")}
        names |= set(re.findall(r"\bimport\s+([A-Za-z_]\w+)", text)) | set(re.findall(r"::([A-Za-z_]\w+)\s*;?\s*$", text))
        names |= set(re.findall(r"\b([A-Z][a-z]\w+)(?:\.|::)[a-z_]\w*", text))
        for name in {n for n in names if len(n) > 2}:
            cands = [f for f in defs.get(name, ()) if (f.startswith(scope + "/") if scope else True) and f != ev["path"]]
            if len(cands) == 1: best[cands[0]] += 1
        return best.most_common(1)[0][0] if best else None

    def node_of_target(t, ev=None):
        if t in extmap:
            return extmap[t]
        if ev and (BARREL.search(t) or t not in ranges):
            f = by_name(t, ev)
            if f and f in ranges:
                return node_at(f)
        if t in ranges:
            return node_at(t)
        hits = [h for h in (node_at(f) for f in ranges if f.startswith(t.rstrip("/") + "/")) if h]
        return Counter(hits).most_common(1)[0][0] if hits else None

    out, bad, lost = {}, 0, Counter()

    def add(s, t, label, ev):
        if not s or not t or s == t or t not in nodes or s not in nodes:
            return
        k = (s, t) if (s, t) in out or (t, s) not in out else (t, s)
        if k not in out:
            out[k] = {"id": f"{k[0]}--{k[1]}", "source": k[0], "target": k[1], "label": label, "evidence": [ev]}
        elif len(out[k]["evidence"]) < 3 and ev not in out[k]["evidence"]:
            out[k]["evidence"].append(ev)

    for l in links:
        ev = ev_fix(l["ev"])
        if not ev:
            bad += 1; continue
        s, t = (node_of_target(l["s"]) if l["s"] else node_at(ev["path"], ev["line"])), node_of_target(l["t"], ev)
        if not s or not t:
            lost[l["t"] if not t else "source " + ev["path"]] += 1; continue
        add(s, t, l["label"], ev)
    n_reader = len(out)
    for f in SRC + TESTS:
        i = idx[f]
        for x in i["imports"]:
            L = _cache.setdefault(f, read_lines(f))
            line = L[x["line"] - 1].strip() if 0 < x["line"] <= len(L) else ""
            add(node_at(f, x["line"]), node_at(x["path"]), "runs" if x.get("how") == "runs" else "loads" if x.get("how") in ("src", "href", "loads") else "imports", {"path": f, "line": x["line"], "match": line[:60]})
        for c in i["http_calls"]:
            h = c.get("handler")
            if h:
                add(node_at(f, c["line"]), node_at(h["path"], h["line"]), "REST " + h["route"][:24], {"path": f, "line": c["line"], "match": c["path"][:60]})
    # the user reaches the app: the proof is the page it opens. Only a block that is an app or a site counts (a page a server
    # ships for its own status is not what the user opens), and one link per block.
    user = next((v["id"] for v in nodes.values() if v["kind"] == "user"), None)
    if user:
        seen_user = set()
        for f in SRC:
            if not (idx[f].get("lang") == "html" and any(e["kind"] in ("page", "html") for e in idx[f].get("entries", [])) or f in ("index.html", "public/index.html", "app/index.html")):
                continue
            nid = node_at(f)
            top_ = nodes[nid]["parent"] or nid if nid in nodes else None
            if not top_ or top_ in seen_user or not ({nodes[nid]["kind"], nodes[top_]["kind"]} & {"app", "site", "mobile", "desktop", "extension", "game", "admin", "docs"}):
                continue
            seen_user.add(top_)
            L = _cache.setdefault(f, read_lines(f))
            ln = next((k for k, x in enumerate(L, 1) if "<title" in x.lower() or "<body" in x.lower()), 1)
            add(user, nid, "opens the app", {"path": f, "line": ln, "match": (L[ln - 1].strip()[:60] if L else "")})

    files_of = defaultdict(list)
    for f in sorted(ranges):
        if f in idx or (ROOT / f).exists():
            for nid in sorted({r[2] for r in ranges[f]}):
                files_of[nid].append(f)
    commit = ""
    try:
        commit = subprocess.run(["git", "-c", "core.fsmonitor=false", "-C", str(ROOT), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:  # noqa: BLE001
        pass
    final = {"version": 1, "project": ROOT.name, "lang": "en", "source": "agent", "generated_at": time.strftime("%Y-%m-%d"), **({"commit": commit} if commit else {}),
             "summary": d.get("summary", ""),
             "groups": spread_outside([{"id": g[0], "label": g[1], "col": g[2], "row": g[3]} for g in d.get("groups", []) if isinstance(g, list) and len(g) >= 4], nodes,
                                      (Counter(nodes[i]["group"] for i in set(extmap.values()) - set(where.values()) if i in nodes).most_common(1) or [("external", 0)])[0][0]),
             "nodes": [], "links": list(out.values()), "flows": []}
    gids = {g["id"] for g in final["groups"]}
    for v in nodes.values():
        node = {"id": v["id"], "label": v["label"], "kind": v["kind"], "group": v["group"] if v["group"] in gids else next(iter(gids), ""), "status": "live", "summary": v["summary"]}
        if v["parent"]: node["parent"] = v["parent"]
        if v["size"]: node["size"] = "s"
        fs = files_of.get(v["id"], [])
        if fs: node["files"] = [{"path": f, "role": ""} for f in sorted(fs, key=lambda f: -idx.get(f, {}).get("bytes", 0))]   # every file: the biggest first
        final["nodes"].append(node)
    used = {l["source"] for l in final["links"]} | {l["target"] for l in final["links"]}
    kids = {v["parent"] for v in nodes.values() if v["parent"]}
    # an external system nothing is linked to has no proof: it is left out
    final["nodes"] = [x for x in final["nodes"] if x["id"] in used or x["id"] in kids or x.get("files") or x["kind"] == "user"]
    mp = ROOT / ".miraterminal" / "map.json"
    mp.write_text(json.dumps(final, indent=1))
    t_map = time.time() - T0
    emit(4, f"Diagram drawn: {len(final['nodes'])} blocks, {len(final['links'])} links", first_map=round(t_map, 1), nodes=len(final["nodes"]), links=len(final["links"]),
         reader_links=n_reader, bad_proofs=bad, lost=sum(lost.values()))

    # --- right after: flows (one call) and notes (already being read) ------------------------------------------
    by_id = {x["id"]: x for x in final["nodes"]}
    fv, claims = [], list(final["links"])
    if not A.no_verify and claims:
        def v_desc(i):
            n = by_id[i]; fs = [f["path"] for f in n.get("files", [])][:6]
            return f"{n['label']} ({n.get('kind')}: {n.get('summary', '')[:110]})" + (f" files: {', '.join(fs)}" if fs else " [no file: outside the code]")

        def v_snip(e, pad=10):
            L = _cache.setdefault(e["path"], read_lines(e["path"]))
            a, b = max(1, e["line"] - pad), min(len(L), e["line"] + pad)
            return "\n".join(f"{k}\t{L[k - 1][:200]}" for k in range(a, b + 1))

        def v_ask(lo):
            return ask_json(VERIFY + "\n".join(f"[{k}] source: {v_desc(c['source'])}\n     target: {v_desc(c['target'])}\n     moves: {c['label']}\nfile {c['evidence'][0]['path']} line {c['evidence'][0]['line']}:\n{v_snip(c['evidence'][0])}\n"
                                                for k, c in list(enumerate(claims))[lo:lo + 50]), A.lead_model)
        fv = [ex.submit(v_ask, lo) for lo in range(0, len(claims), 50)]
    ff = None
    if not A.no_flows:
        flow_prompt = '''Here is the architecture diagram of a software project: its blocks and its links (each link is proven in the code). Write the 3 to 6 end-to-end flows that make it understood (the main user actions, the main background jobs, the deployment).
- Each flow: 4 to 9 steps, each step goes from one block to another along an existing link (either direction), one short sentence saying what happens.
- Use only the block ids given. Everything in English, sentence case.

Answer with this JSON only, compact, no prose:
{"flows":[["kebab-id","Label of 2 to 4 words","one line summary",[["from id","to id","what happens"]]]]}

## Blocks (id | label | kind | parent | summary)
''' + "\n".join(f"{x['id']} | {x['label']} | {x['kind']} | {x.get('parent', '-')} | {x['summary']}" for x in final["nodes"]) \
            + "\n\n## Links (from -> to | what moves)\n" + "\n".join(f"{l['source']} -> {l['target']} | {l['label']}" for l in final["links"]) + "\n"
        ff = ex.submit(ask_json, flow_prompt, A.lead_model)
    emit(5, "Writing the flows and the notes")
    for f in fn:
        for x in ((f.result() or {}).get("n", [])):
            if not (isinstance(x, list) and len(x) >= 2):
                continue
            m = re.match(r"(.+?):(\d+)-(\d+)$", str(x[0]))
            nid = node_at(m.group(1), (int(m.group(2)) + int(m.group(3))) // 2) if m else node_at(str(x[0]))
            node = by_id.get(nid)
            if not node:
                continue
            det = str(x[1]).strip()
            if det and len(node.get("details", "")) < 600:
                node["details"] = (node.get("details", "") + ("\n" if node.get("details") else "") + det.replace(" / ", "\n"))[:900]
            tech = [t.strip() for t in str(x[2]).split(",") if t.strip()] if len(x) > 2 else []
            if tech: node["tech"] = list(dict.fromkeys(node.get("tech", []) + tech))[:5]
            for todo in (x[3] if len(x) > 3 and isinstance(x[3], list) else [])[:2]:
                node.setdefault("todos", [])
                if len(node["todos"]) < 4: node["todos"].append({"text": str(todo)[:160], "done": False})
    if ff:
        fd = ff.result() or {}
        pairs = {(l["source"], l["target"]) for l in final["links"]}
        for fw in fd.get("flows", []):
            if isinstance(fw, list) and len(fw) >= 4:
                steps = [{"from": s[0], "to": s[1], "text": s[2]} for s in fw[3] if isinstance(s, list) and len(s) >= 3 and s[0] in by_id and s[1] in by_id]
                if len(steps) >= 3:
                    final["flows"].append({"id": fw[0], "label": fw[1], "summary": fw[2], "steps": steps})
        final["flow_steps_off_links"] = sum(1 for fw in final["flows"] for s in fw["steps"] if (s["from"], s["to"]) not in pairs and (s["to"], s["from"]) not in pairs)
    checked = {"ok": 0, "bad": 0, "unsure": 0}
    if fv:
        verdict = {}
        for f in fv:
            d2 = f.result() or {}
            for kk in ("ok", "bad", "unsure"):
                for i in d2.get(kk, []):
                    if isinstance(i, int): verdict[i] = kk
        refused = {id(claims[i]) for i, kk in verdict.items() if kk == "bad" and 0 <= i < len(claims)}
        for kk in checked: checked[kk] = sum(1 for x in verdict.values() if x == kk)
        final["links"] = [l for l in final["links"] if id(l) not in refused]
        kept = {(l["source"], l["target"]) for l in final["links"]}
        for fw in final["flows"]:
            fw["steps"] = [st for st in fw["steps"] if (st["from"], st["to"]) in kept or (st["to"], st["from"]) in kept or (st["from"], st["to"]) not in {(c["source"], c["target"]) for c in claims}]
        final["verified"] = {"read_again": len(verdict), "removed": len(refused), "unsure": checked["unsure"]}
    mp.write_text(json.dumps(final, indent=1))
    emit(5, "Done", done=True, verify=checked, total=round(time.time() - T0, 1), first_map=round(t_map, 1), t_blocks=round(t_blocks, 1), t_links=round(t_links, 1), t_lead=round(t_lead, 1), t_out=round(t_out, 1),
         nodes=len(final["nodes"]), links=len(final["links"]), flows=len(final["flows"]), calls=STATS["calls"], cost=round(STATS["cost"], 2), out_tokens=STATS["out"], fresh=STATS["fresh"], cache_w=STATS["cache_w"], cache_r=STATS["cache_r"], mode=A.mode, in_tokens=STATS["in"],
         bad_proofs=bad, lost=dict(lost.most_common(8)), errors=STATS["errors"][:3])
    return 0


IX_NOISE = re.compile(r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|\.gitignore|\.gitattributes|\.editorconfig|LICENSE[^/]*)$|\.(png|jpe?g|gif|ico|svg|webp|woff2?|ttf|mp3|mp4|pdf|lock)$", re.I)


def main():
    global ROOT, FULL, idx, SRC, TESTS, READ, A
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".")
    ap.add_argument("--agent", default="claude", choices=["claude", "codex", "gemini", "cursor", "copilot", "grok"], help="the agent that reads (the user's default agent)")
    ap.add_argument("--bin", default=None, help="the agent's command (default: its usual name)")
    ap.add_argument("--model", default=None, help="model of every call (default: the agent's own default model, as in the user's terminal)")
    ap.add_argument("--reader-model", default=None); ap.add_argument("--links-model", default=None); ap.add_argument("--lead-model", default=None); ap.add_argument("--notes-model", default=None)
    ap.add_argument("--effort", default="low", help="how hard the agent thinks when it cuts, groups and annotates: low, medium, high, or '' for the agent's own")
    ap.add_argument("--links-effort", default=None, help="the same for the readers that look for the links (default: the agent's own, the links are what must be right)")
    ap.add_argument("--cap", type=int, default=60000, help="size of a part, in tokens")
    ap.add_argument("--mode", default="three", choices=["three", "one", "cached"],
                    help="three: three readers per part, each sent the part (fastest); one: one reader per part answers blocks and links (least reading); cached: the part is sent once, its three questions read it from the cache")
    ap.add_argument("--max-tokens", type=int, default=1_200_000, help="above this much code, the project is not read in full (it would cost too much): the files that say least are placed by their folder")
    ap.add_argument("--links-cap", type=int, default=20000, help="size of a part for the readers that look for the links")
    ap.add_argument("--workers", type=int, default=48)
    ap.add_argument("--no-notes", action="store_true"); ap.add_argument("--no-flows", action="store_true")
    ap.add_argument("--skip-tests", action="store_true", help="do not read the test files line by line: one Tests block, linked through its imports only")
    ap.add_argument("--no-verify", action="store_true", help="do not read every link again on its proof before keeping it")
    A = ap.parse_args()
    A.effort = A.effort or None
    A.bin = A.bin or {"claude": "claude", "codex": "codex", "gemini": "gemini", "cursor": "cursor-agent", "copilot": "copilot", "grok": "grok"}[A.agent]
    # on Windows an agent installed with npm is a .cmd file : only its full path runs without a shell
    A.bin = shutil.which(A.bin) or A.bin
    ROOT = Path(A.root).resolve(); IX.ROOT = ROOT
    emit(1, "Listing the files")
    FULL = IX.Index().build().to_json()
    (ROOT / ".miraterminal").mkdir(exist_ok=True)
    (ROOT / ".miraterminal" / "index.json").write_text(json.dumps(FULL, indent=1))
    idx = FULL["files"]
    SRC = sorted(f for f, i in idx.items() if i["kind"] == "source" and (not i.get("test") or not A.skip_tests) and not IX_NOISE.search(f))
    TESTS = sorted(f for f, i in idx.items() if i["kind"] == "source" and i.get("test")) if A.skip_tests else []
    if not SRC:
        emit(1, "No source file to read", error=True); return 1
    total = sum(tok(f) for f in SRC)
    READ = choose_read(A.max_tokens)
    if len(READ) < len(SRC):
        emit(1, f"Large project: {len(READ)} of {len(SRC)} files read, the others placed with their folder", tokens=total, read=len(READ))
    return run()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        # the whole trace for the log, and where it broke in the message the user sees
        import traceback
        traceback.print_exc()
        tb = traceback.extract_tb(e.__traceback__)[-1]
        emit(5, f"{type(e).__name__}: {e} (orchestrate.py line {tb.lineno})", error=True)
        sys.exit(1)
