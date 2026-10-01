# agent-presence

Show the AI coding tool you are working in as your Discord activity. Your friends see
"Claude Code", "Codex" or "Cursor" next to your name, with the tool's logo and how long
you have been at it.

It runs in the background, checks every 15 seconds which tools are open and talks only
to the Discord desktop app on your machine.

## Setup with your agent

Paste this into Claude Code, Codex, Cursor or any other coding agent:

```
Set up https://github.com/tombanaszek1-sketch/agent-presence for me by following its INSTALL.md.
```

The agent installs the CLI, turns on autostart and tells you what it detected.

## Manual setup

Requires Node.js 20 or newer and the Discord desktop app.

```
npm install -g agent-presence
agent-presence install
```

Until the package is on npm, install it from GitHub:

```
npm install -g github:tombanaszek1-sketch/agent-presence
agent-presence install
```

In Discord, "Share my activity" has to be on (User Settings -> Activity Privacy).

## Supported tools

| Tool | Detected via | Discord activity |
|---|---|---|
| Claude Code (CLI and the Code tab of the Claude app) | `claude` process outside the desktop app bundle | Vibe Coding: Claude Code |
| Codex (CLI and app) | `codex` process | Codex |
| Cursor | `Cursor` process | Cursor |
| Antigravity | `Antigravity` process | Antigravity |
| Windsurf | `Windsurf` process | Windsurf |
| Claude (desktop app) | `Claude` app process | Vibe Coding: Claude |

If several tools are open, the first one in this table wins. You can change that order in
the config.

Claude shows up as "Vibe Coding" because Discord rejects application names that contain
"Claude", and the application name is the activity title. The member list still says
"Claude Code" or "Claude", since agent-presence asks Discord to display the tool name
there. The profile card uses "Vibe Coding" as its heading.

## Commands

| Command | What it does |
|---|---|
| `agent-presence install` | Registers autostart and starts the background process |
| `agent-presence uninstall` | Removes autostart and stops the background process |
| `agent-presence status` | Autostart on or off, background process running or not, current activity |
| `agent-presence detect` | Scans once and prints the tools it finds |
| `agent-presence start` | Runs in the foreground (autostart uses this) |

## Config

Optional. Create `config.json` here:

- Windows: `%APPDATA%\agent-presence\config.json`
- macOS and Linux: `~/.config/agent-presence/config.json`

```json
{
  "disabled": ["claude"],
  "priority": ["cursor", "claude-code"],
  "pollSeconds": 15
}
```

- `disabled`: tool ids that are never shown
- `priority`: tool ids that come first, in this order; the rest keep their default order
- `pollSeconds`: how often to scan, at least 5

Tool ids: `claude-code`, `codex`, `cursor`, `antigravity`, `windsurf`, `claude`.
The log file `agent-presence.log` sits in the same folder.

## Platform status

Windows is tested. macOS and Linux are implemented, but the maintainer has not tested
them yet. If something is off, open an issue with the output of `agent-presence detect`.

## Adding a tool

Tools are listed in [`src/apps.json`](src/apps.json). Each entry has a Discord application
ID, a logo in `assets/logos/` and match rules per OS:

```json
{ "process": "cursor.exe" }
{ "path": "/Cursor\\.app/Contents/MacOS/[^/]+$" }
{ "process": "claude.exe", "notPath": "WindowsApps\\\\Claude_" }
{ "process": "node", "cmdline": "@anthropic-ai/claude-code" }
```

`process` is the exact executable name (case-insensitive). `path`, `notPath` and `cmdline`
are regular expressions. All fields in a rule have to match. Each tool needs its own Discord
application, because the application name becomes the activity title. Open an issue if you
want a tool added.

## Credits

Logos come from [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT). All product
names and logos belong to their owners. This project is not affiliated with Anthropic,
OpenAI, Anysphere, Google, Codeium or Discord.

## License

MIT
