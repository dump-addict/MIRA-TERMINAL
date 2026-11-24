---
name: miraterminal
description: Generates and opens the interactive project map (2D/3D architecture map of the main building blocks and their links, live status, costs, open points, focused session per branch). Use when the user asks for the map, the architecture, the tree, the mind map or the project overview, types /miraterminal, or asks to update the map.
---

# miraterminal

The map lives in `.miraterminal/map.json` at the project root. `server.py` (Python standard library, next to this file) serves it in a window, runs the checks and opens a focused Claude session on a block or a link.

The full schema and the vocabulary are in `schema.md` (same folder). Read it before writing the map.

## 1. Pick the mode

- No `.miraterminal/map.json`: **generate**.
- Present: **update**. Keep existing `id`s, `todos` (done or not), `notes`, hand-added checks. Add what is new, remove what left the code, fix what changed. Update `generated_at` and `commit`.
- The user only asks to open it: go to step 4.

## 2. Analyse the project

Aim at the big picture, not file by file.

1. Inventory: `git ls-files`, README, CLAUDE.md, project memory, manifests (`package.json`, `pyproject.toml`, `foundry.toml`, `Cargo.toml`, `go.mod`, Dockerfile, `vercel.json`, CI, deploy scripts).
2. Entry points: servers, API routes, web pages, contracts, background workers, scheduled jobs, CLIs.
3. External systems: `grep` URLs (`https?://`, `wss://`), imported SDKs, environment variable names (`.env.example`, `os.environ`, `process.env`). **Read variable names only, never their values; never copy a `.env` value into the map.**
4. Flows: who calls whom, over which protocol (REST, WebSocket, JSON-RPC, transaction, file, module import). Follow the real calls in the code.
5. Infrastructure and costs: hosting, domains, paid plans, gas, keys. Never invent a price: `monthly_usd: null` and a "to confirm" note when unknown.
6. Open points: TODO/FIXME in the code, obvious gaps (missing variable, unauthorized domain, missing test, unwired alert), what the project memory says.

For a large repo, delegate the sweep to an Explore agent and keep the synthesis.

## 3. Write the map

The map must read in ten seconds: left to right, who does what, and what breaks.

- **Everything in English**, sentence case, never uppercase, no middle dots, short: labels 1 to 3 words, one-sentence summaries.
- **Precise architecture words** (C4 model, arc42, see the vocabulary in `schema.md`): user, web app, API service, gateway, worker, scheduled job, queue, data store, data stream, relayer, smart contract, oracle, external system, identity provider, hosting. Name a block by what it is ("Quote signer", "Settlement worker"), not by a vague verb ("Pricing", "Settlement").
- **Groups = columns in flow order**: users, clients (web app, wallet), backend, smart contracts or data stores, external systems (`row: 0`); infrastructure and research on the bottom row (`row: 1`). 4 to 7 groups, explicit `col` and `row`. Leave `color` out: swatches come from the design tokens.
- **Two levels.** "Essential" view: 10 to 15 top-level blocks, never more. Sub-parts (server modules, contracts, research scripts) become children through `parent`: they show when expanded. 15 to 35 blocks in total.
- Start with a **user** block (`kind: "user"`): the entry point of every flow.
- Give each block the most precise `kind` (list in `schema.md`): it picks the icon, the card caption and the 3D object. Never invent a kind: when none fits, use `other` with a `tag` saying what it is (the card shows a question mark). Secondary external systems: `size: "s"`.
- `brand`: the service's brand (Vercel, AWS, Pyth...), shown as a badge above the object. Royalty-free logo (for example Simple Icons, CC0) in `.miraterminal/logos/`, otherwise the name as text.
- **Links** (`links`): the real flows, short `label` naming what moves ("REST /api", "signed prices", "relayed transactions"). Direction = direction of the call or of the data. Prefer linking the precise children: the link moves up to the collapsed parent by itself. One link per real flow: the map routes them apart, no need to merge.
- **Every link carries its proof** (`evidence`): the file, the line and a short piece of that line (`match`, copied as is) where the call, import, request, transaction or config reference is. One to three per link. A link you cannot prove from the code is left out. For a link between two external systems, the proof is the line of the project's code that makes it happen.
- **Never merge two different things into one block**: two addresses, two keys, two environment variables or two services with different roles are two blocks, even when they look alike (a treasury that is displayed and a wallet that pays are two wallets).
- **Every source file belongs to a block**: small helpers go to the component that imports them.
- **Flows** (`flows`): 3 to 6 end-to-end flows (buy, sign in, pay, deploy...), 4 to 10 steps each, one sentence per step. They are what makes the map understood: take care of them.
- Each element: `summary` (one sentence), `details` (2 to 5 lines useful to someone picking the branch up), 2 to 6 `files` with their role, `tech`, `status` (`live`, `wip`, `planned`, `broken`), `cost` when relevant, `todos`.
- `metric`: one live number per block when a check provides it (balance, queue length, latest block, price).
- **Checks** (`checks`): non-destructive and fast only. Health GETs, public APIs, `rpc` `eth_blockNumber`, variables present (`env`), files (`file`), local port (`port`, with `optional: true` when the service does not always run). Secrets go through `${VAR}` (read from `.env` by the server, never shown). Never a POST that changes state, never a transaction, never a deployment. A slow command (tests, build) gets `manual: true`. Check labels are short and sentence case ("latest block", "pool seeded").
- Language: `lang: "en"` and English text, another language only when the user asks for it.

Then verify the map against the code, with the tool that reads the code without AI (`index.py`, next to this file):

```bash
python3 .claude/skills/miraterminal/index.py --root . build
python3 .claude/skills/miraterminal/index.py --root . verify .miraterminal/map.json
```

It checks that each proof is really at its line, lists the source files no block owns and the imports or HTTP calls between two blocks that no link shows. Fix the map and run it again until it prints `verified` (three rounds at most; say what is left if it still complains).

Then validate:

```bash
python3 .claude/skills/miraterminal/server.py --check --trust
```

`--trust` lets the map's checks run: shell commands and network calls written in `map.json`. Pass it only when the user owns the project or the checks are the ones you just wrote. On a cloned repository whose map you did not write, read its checks and ask the user before passing `--trust`. Without it, those checks show as off.

Fix the reported errors and the checks that fail because of the map itself (wrong URL, wrong JSON path). A real project failure stays visible: that is the useful information.

## 4. Open the map

Start the server in the background (Bash `run_in_background`):

```bash
python3 .claude/skills/miraterminal/server.py --trust
```

(Same rule for `--trust` as above.) It opens an app window (Chrome, Edge or Brave in `--app` mode, otherwise the browser) on `http://127.0.0.1:4700/?k=<launch key>` (next port when busy; the page only opens with the key printed at launch). Options: `--trust`, `--browser` (tab), `--no-open`, `--port`, `--root`.

Give the user the address and sum up in a few lines what is red or amber.

## 5. Focused sessions

The "Start a session" button of a block or a link opens a new terminal with `claude` and a prompt holding the branch role, its files, its connections, the check results right now, the costs, the open points, the latest commits and the request. The prompt is also saved in `.miraterminal/sessions/`.

When you get such a prompt: stay on that branch, and at the end update its entry in `.miraterminal/map.json` (`todos`, `status`, `notes`, `checks`). The window refreshes by itself.

Useful variables: `MIRATERMINAL_TERMINAL=iterm`, `MIRATERMINAL_EDITOR=cursor`, `MIRATERMINAL_CLAUDE="claude --model opus"`.
