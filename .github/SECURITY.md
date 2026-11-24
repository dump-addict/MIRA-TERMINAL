# Security policy

Mira Terminal runs coding agents with access to your files and your shell, so we take security reports seriously.

## Reporting a vulnerability

Please do **not** open a public issue or pull request for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include:

- what the issue is and what an attacker could do with it;
- the steps to reproduce it, or a proof of concept;
- the version or commit you tested, and your operating system and its version.

We will acknowledge your report within a few days, keep you informed while we work on a fix, and credit you in the release notes if you wish.

## Supported versions

Mira is in early preview: only the latest commit on `main` receives security fixes.

## Trust model

Opening a project is safe: a repository's map, notes and settings are shown, never run. **Trust project** is the line: once a project is trusted, the checks in its map (shell commands, network calls) run and Mira may start an agent on it. Trust is per folder and is not asked again after a `git pull`. A way to run code from an untrusted project, or to get past this line, is a vulnerability.

## Scope

In scope: the Electron app (main process, preload bridge, renderer), the local map server and the `miraterminal` skill.

Out of scope: vulnerabilities in the coding agents Mira launches (Claude Code, Codex, Gemini CLI, Cursor CLI, Copilot CLI, Grok CLI). Please report those to their own maintainers.
