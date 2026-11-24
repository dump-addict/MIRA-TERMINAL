# Notes for coding agents

You are working on Mira Terminal, an Electron app that runs coding agents side by side, draws a live map of each project and keeps tasks on one board. Read [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) first: its rules apply to you too.

## Layout

- `src/main`: Electron main process. One module per concern (`terminals.ts`, `agents.ts`, `projects.ts`, `mapserver.ts`, `voice.ts`…), each registering its own `ipcMain` handlers.
- `src/preload/index.ts`: the only bridge to the renderer. Every new IPC call needs an entry here.
- `src/renderer/src`: React UI. State in zustand stores, styles in Tailwind classes mapped to the design tokens.
- `skill/miraterminal`: the project map. `index.py` indexes a project, `server.py` serves the map and builds the prompts, `viewer/` draws it in plain JavaScript (no build step). `schema.md` is the format of the map.

## Rules

- English only, everywhere.
- Use the tokens from [`DESIGN.md`](DESIGN.md) and `skill/miraterminal/viewer/tokens.css`. Never hard-code a colour or a size.
- No network calls, telemetry, accounts or stored secrets.
- Keep behaviour the same for every supported agent (Claude Code, Codex, Gemini CLI, Cursor CLI, Copilot CLI, Grok CLI) unless the change is explicitly about one of them.
- Do not edit `skill/miraterminal/viewer/vendor/`: it is third-party code.
- Run `pnpm check` before you say you are done. If you changed the UI, say whether you tried it in the app.
