# Contributing to Mira Terminal

Thanks for helping make Mira better.

Found a security vulnerability? Do not open a public issue or pull request: report it privately, as described in [`SECURITY.md`](./SECURITY.md).

## Local setup

You need Node.js 24 or newer, pnpm 12, Python 3 and a C++ toolchain: the Xcode Command Line Tools on macOS, Visual Studio Build Tools on Windows, `build-essential` on Linux. `pnpm install` rebuilds the native terminal module (`node-pty`) for Electron, which is why it needs the toolchain. On Windows, agents run in Git Bash, so install Git for Windows too.

```bash
pnpm install
pnpm dev
```

With an older pnpm (10 or 11), every command fails with `Failed to switch pnpm to v12…` or `ENOEXEC`: it cannot run the pnpm 12 this repository asks for. Upgrade it (`brew upgrade pnpm` or `npm install -g pnpm@12`), then delete the half-installed copy it left in `~/Library/pnpm/.tools/pnpm/` on macOS (`~/.local/share/pnpm/.tools/pnpm/` on Linux, `%LOCALAPPDATA%\pnpm\.tools\pnpm\` on Windows).

To work on the map alone, draw it for a test project with `python3 skill/miraterminal/orchestrate.py --root /path/to/project --agent <your agent>` and open it with `python3 skill/miraterminal/server.py --root /path/to/project`. With Claude Code you can also link the skill (`sh install.sh /path/to/project --link`) and run `/miraterminal`.

## Before you start

- For anything bigger than a small fix, open an issue first, so we can agree on the approach before you spend time on it.
- Keep each pull request to one topic. Two small pull requests are reviewed faster than one big one.

## Branch names

Use a short name that says what the change does: `fix/terminal-resize-flicker`, `feat/map-search`, `docs/contributing`. Avoid vague names like `test`, `misc` or `changes`.

## Code guidelines

- **English only**, in code, comments, UI copy and docs.
- **Follow the design system.** UI work uses the tokens in [`DESIGN.md`](../DESIGN.md) (`bg-surface-1`, `text-text-2`, `border-line`…), never hard-coded colours or sizes. UI copy is short and in sentence case.
- **Keep the boundaries.** The renderer only reaches the system through `src/preload`. Add a function there only when the UI truly needs it, and validate what reaches the main process.
- **Stay local.** Mira has no server and stores no key. Do not add network calls, telemetry or accounts. Anything that touches the user's credentials or files must be explicit and visible in the UI.
- **Stay agent-neutral.** Generic behaviour must work for every supported agent (Claude Code, Codex, Gemini CLI, Cursor CLI, Copilot CLI, Grok CLI). Put agent-specific logic behind an explicit check on the agent.
- **Mind the hot paths.** Terminal output, typing, rendering and file watching run constantly: avoid extra work, polling and subprocesses there, and clean up what you create (listeners, watchers, ptys, timers).
- **Work on every platform.** Mira ships for macOS, Windows and Linux. Put platform-specific code behind `process.platform` (shared helpers live in `src/main/platform.ts` and `src/renderer/src/platform.ts`), build paths with `path.join`, and show shortcuts through `kbd()` so they read ⌘ on a Mac and Ctrl elsewhere. Say in your pull request which systems you tried.
- **Comments say why**, not what. Keep them short.

## Checks before opening a pull request

```bash
pnpm check
```

It runs what CI runs: the TypeScript typecheck, the production build, and syntax checks for the Python and JavaScript of the map. If your change touches the UI or how an agent behaves, also try it in the app with at least one agent.

## Pull requests

Fill in every section of the [pull request template](./pull_request_template.md):

- what changed and why, in plain words;
- the linked issue (required for outside contributors);
- a before and after (screenshot or short video) for any UI or behaviour change, or `N/A` with a reason;
- how you tested it, and with which agents;
- the risk: what could break, and for whom.

If an AI agent helped write the change, say which one. That is welcome here: Mira is built for agents, and with them. You remain responsible for every line you submit, so review it as if you wrote it yourself.

Versions, tags and releases are handled by the maintainers: pushing a `v*` tag builds the macOS, Windows and Linux apps and drafts a release. Do not bump the version in a pull request.

## Getting help

Open an [issue](https://github.com/mira-foundry/mira-terminal/issues/new/choose) for bugs, ideas and questions.

By contributing, you agree that your contributions are licensed under the [MIT License](../LICENSE), and you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
