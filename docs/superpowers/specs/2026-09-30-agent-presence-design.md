# agent-presence - Design

Date: 2026-09-30
Status: approved

## Goal

Show the AI coding tool a user is currently working in as their Discord activity
("Playing Claude Code", with logo and elapsed time). One small background tool covers
all major agents and editors, installable by asking your coding agent to set it up.

## Scope

In scope:
- Activity = tool name + logo + elapsed time. No project names, no working/idle state.
- Windows, macOS, Linux.
- Initial tools: Claude (desktop app), Claude Code (CLI), ChatGPT (desktop app),
  Codex (CLI and app), Cursor, Antigravity, Windsurf.
- Install via `npm i -g agent-presence` + `agent-presence install` (autostart), plus an
  agent-readable `INSTALL.md` and a copy-paste prompt in the README.

Out of scope (YAGNI):
- Hooks/plugins inside the tools, per-project details, tray icon, GUI, packaged binaries.
- Foreground-window detection.

## Architecture

Plain Node.js (>= 20, ESM, no build step). Single runtime dependency:
`@xhayper/discord-rpc` (handles IPC pipe paths on Windows, macOS, Linux, Flatpak, Snap).

```
bin/agent-presence.js      CLI entry: install | uninstall | start | status | detect
src/apps.json              tool registry
src/config.js              load + merge user config over defaults
src/detector.js            list running processes (per-OS), match against registry
src/selector.js            pick one tool when several run
src/presence.js            Discord connection per app ID, set/clear activity
src/daemon.js              poll loop tying detector -> selector -> presence
src/autostart/{win32,darwin,linux}.js   register/unregister autostart
src/log.js                 file logger, capped at 1 MB
```

### Registry (`src/apps.json`)

One entry per tool, ordered by default priority (first = highest):

```json
{
  "id": "claude-code",
  "name": "Claude Code",
  "discordAppId": "<snowflake>",
  "largeImage": "logo",
  "match": {
    "win32":  [{ "process": "claude.exe" }],
    "darwin": [{ "process": "claude" }],
    "linux":  [{ "process": "claude" }]
  }
}
```

A match rule has `process` (case-insensitive exact executable name) and optional
`cmdline` (regex tested against the full command line, for tools running under a shared
runtime such as `node`). An entry matches if any rule for the current OS matches.

Default priority: CLI agents first (Claude Code, Codex CLI), then agent editors
(Cursor, Antigravity, Windsurf), then desktop chat apps (Claude, ChatGPT).

Each tool has its own Discord application (created by the maintainer in the Discord
Developer Portal), because Discord shows the application name as the activity name.
App IDs are public and committed to the repo; users never touch the portal.

### Detector

Every 15 s:
- Windows: `Get-CimInstance Win32_Process | Select Name, CommandLine` via `powershell.exe
  -NoProfile`, output as JSON.
- macOS / Linux: `ps -axo comm=,args=`.
Returns a list of `{ name, cmdline }`; the matcher returns the set of registry IDs found.
Process-listing errors are logged and treated as "nothing detected" for that tick.

### Selector

Given the detected IDs, returns the one with the highest priority. Priority order comes
from `config.priority` if set, otherwise registry order. Disabled IDs are ignored.

### Presence

- Holds at most one Discord client, bound to the current tool's app ID.
- When the selected tool changes: destroy the old client, connect with the new app ID,
  set activity. When nothing is selected: clear activity and disconnect.
- Activity: `details` = tool name, `largeImageKey` = registry image, `startTimestamp` =
  time the tool was first detected in this run (kept while the same tool stays selected).
- If Discord is not running or the pipe closes: log once, retry on the next tick. No crash.

### Config

Optional file `~/.config/agent-presence/config.json` (Windows: `%APPDATA%\agent-presence\`):

```json
{ "disabled": ["chatgpt"], "priority": ["cursor", "claude-code"], "pollSeconds": 15 }
```

Unknown keys are ignored; invalid JSON is logged and defaults are used.
Log file `agent-presence.log` lives next to the config, truncated when it exceeds 1 MB.

## CLI

- `start`: run the daemon in the foreground (autostart entries call this).
- `install`: register autostart for the current OS and start the daemon detached.
- `uninstall`: remove autostart and stop a running daemon.
- `status`: whether autostart is registered, whether the daemon runs (PID file), what is
  shown right now.
- `detect`: one-shot scan, prints every matched tool and the one that would be shown.

A PID file next to the config prevents two daemons from running.

### Autostart

- Windows: a `.vbs` launcher in the user's Startup folder running
  `node <path>\bin\agent-presence.js start` without a console window.
- macOS: LaunchAgent `~/Library/LaunchAgents/dev.agent-presence.plist`, `RunAtLoad`.
- Linux: `~/.config/autostart/agent-presence.desktop` (XDG autostart).
All entries store the absolute path of the `node` binary and the script, resolved at
install time.

## Agent-driven install

README contains a prompt to paste into any coding agent:

> Set up https://github.com/tombanaszek1-sketch/agent-presence for me by following its INSTALL.md.

`INSTALL.md` is written for agents: check Node >= 20, run `npm i -g agent-presence`
(or install from the GitHub repo until the npm package exists), run
`agent-presence install`, run `agent-presence detect` and report the result to the user.

## Error handling summary

| Situation | Behaviour |
|---|---|
| Discord closed / restarted | silent retry each tick, one log line per state change |
| Process listing fails | log, treat as nothing detected |
| Invalid config | log, use defaults |
| Second daemon started | exits with a message (PID file) |
| Unknown OS | `install` fails with a clear message; `start` still works |

## Verification

Manual on Windows: `detect` with each installed tool open, `start` and check the Discord
profile, close Discord and reopen it, switch tools, `install` / `uninstall`.
macOS and Linux paths are implemented but untested by the maintainer; README says so and
asks for reports.

## Maintainer setup (manual)

1. Create 7 applications in the Discord Developer Portal, named exactly as shown
   ("Claude", "Claude Code", "ChatGPT", "Codex", "Cursor", "Antigravity", "Windsurf"),
   upload each logo as rich presence asset `logo`, copy the application IDs into
   `apps.json`.
2. `npm login` and `npm publish` once the tool works.
