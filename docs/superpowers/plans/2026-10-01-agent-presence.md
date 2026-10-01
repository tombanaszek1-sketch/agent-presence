# agent-presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A background CLI that detects which AI coding tool is running and shows it as the user's Discord activity.

**Architecture:** A poll loop lists processes every 15 s, matches them against a JSON registry, picks one tool by priority and sets a Discord Rich Presence activity through the local IPC pipe, using one Discord application per tool (Claude tools share "Vibe Coding"). Autostart is registered per OS by the CLI.

**Tech Stack:** Node.js >= 20 (ESM, no build step), `@xhayper/discord-rpc` ^1.5.1.

**Spec:** `docs/superpowers/specs/2026-09-30-agent-presence-design.md`

## Global Constraints

- Node >= 20, ESM (`"type": "module"`), no build step, single runtime dependency `@xhayper/discord-rpc`.
- All repo content in English. No emojis anywhere.
- No test files (repo owner's rule); every task is verified by running the CLI on Windows.
- Supported platforms: `win32`, `darwin`, `linux`.
- Discord application IDs: Vibe Coding `1555288438880862248` (Claude, Claude Code), Codex `1554939231288299530`, Cursor `1554939288314183732`, Antigravity `1518643441880269031`, Windsurf `1554939359164239982`.
- Logo URL: `https://raw.githubusercontent.com/tombanaszek1-sketch/agent-presence/main/assets/logos/<image>.png`.
- Commits without any Claude attribution lines.

## Process facts (verified on Windows 2026-10-01)

- Claude desktop app: `claude.exe` under `C:\Program Files\WindowsApps\Claude_...\app\` (MSIX) or `%LOCALAPPDATA%\AnthropicClaude\` (Squirrel install).
- Claude Code: also `claude.exe`, under `%APPDATA%\Claude\claude-code\<ver>\` (spawned by the desktop Code tab) or `~\.local\bin\` (standalone CLI). Older npm installs run as `node.exe` with `@anthropic-ai/claude-code` in the command line.
- Codex ships a background `codex-windows-sandbox-service.exe`; it must not count. Match `codex.exe` exactly.
- macOS: `ps -o comm=` returns the full executable path. Electron forks may name their main binary `Electron`, so macOS rules match on the `.app/Contents/MacOS/` path instead of the process name.
- Linux: `ps -o comm=` is truncated to 15 characters; all registry names are shorter.

## File Structure

```
package.json
bin/agent-presence.js        CLI dispatch: start | detect | install | uninstall | status
src/apps.json                tool registry (priority = array order)
src/config.js                paths, user config, registry loading
src/log.js                   capped file logger
src/detector.js              listProcesses, matchApps, processNames
src/selector.js              selectApp
src/presence.js              Presence class (Discord connection + activity)
src/state.js                 daemon.json: single-instance lock + current tool
src/daemon.js                runDaemon poll loop
src/autostart/index.js       autostart(platform), launchCommand()
src/autostart/win32.js       Startup folder .vbs
src/autostart/darwin.js      LaunchAgent plist
src/autostart/linux.js       XDG autostart .desktop
README.md, INSTALL.md, LICENSE
```

---

### Task 1: Scaffold, registry, config, log

**Files:**
- Create: `package.json`, `src/apps.json`, `src/config.js`, `src/log.js`

**Interfaces:**
- Produces: `configDir: string`, `files: { config, log, state }`, `loadConfig(log?): { disabled: string[], priority: string[], pollSeconds: number }`, `loadApps(): App[]`, `log(message: string): void`.
- `App = { id, name, discordAppId, image, match: { win32?: Rule[], darwin?: Rule[], linux?: Rule[] } }`, `Rule = { process?, path?, notPath?, cmdline? }` (strings; `process` exact case-insensitive basename, others case-insensitive regex).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "agent-presence",
  "version": "0.1.0",
  "description": "Show the AI coding agent you are working in as your Discord activity: Claude Code, Codex, Cursor, Antigravity, Windsurf.",
  "type": "module",
  "bin": { "agent-presence": "bin/agent-presence.js" },
  "files": ["bin", "src"],
  "engines": { "node": ">=20" },
  "dependencies": { "@xhayper/discord-rpc": "^1.5.1" },
  "keywords": ["discord", "rich-presence", "claude-code", "codex", "cursor", "antigravity", "windsurf", "ai", "agent"],
  "repository": { "type": "git", "url": "git+https://github.com/tombanaszek1-sketch/agent-presence.git" },
  "license": "MIT"
}
```

Run: `npm install` (creates `package-lock.json`, commit it).

- [ ] **Step 2: Write `src/apps.json`**

```json
[
  {
    "id": "claude-code",
    "name": "Claude Code",
    "discordAppId": "1555288438880862248",
    "image": "claude-code",
    "match": {
      "win32": [
        { "process": "claude.exe", "notPath": "WindowsApps\\\\Claude_|AnthropicClaude" },
        { "process": "node.exe", "cmdline": "@anthropic-ai[\\\\/]claude-code" }
      ],
      "darwin": [
        { "process": "claude", "notPath": "\\.app/Contents/MacOS/" },
        { "process": "node", "cmdline": "@anthropic-ai/claude-code" }
      ],
      "linux": [
        { "process": "claude" },
        { "process": "node", "cmdline": "@anthropic-ai/claude-code" }
      ]
    }
  },
  {
    "id": "codex",
    "name": "Codex",
    "discordAppId": "1554939231288299530",
    "image": "codex",
    "match": {
      "win32": [{ "process": "codex.exe" }],
      "darwin": [{ "process": "codex" }],
      "linux": [{ "process": "codex" }]
    }
  },
  {
    "id": "cursor",
    "name": "Cursor",
    "discordAppId": "1554939288314183732",
    "image": "cursor",
    "match": {
      "win32": [{ "process": "cursor.exe" }],
      "darwin": [{ "path": "/Cursor\\.app/Contents/MacOS/[^/]+$" }],
      "linux": [{ "process": "cursor" }]
    }
  },
  {
    "id": "antigravity",
    "name": "Antigravity",
    "discordAppId": "1518643441880269031",
    "image": "antigravity",
    "match": {
      "win32": [{ "process": "antigravity.exe" }],
      "darwin": [{ "path": "/Antigravity\\.app/Contents/MacOS/[^/]+$" }],
      "linux": [{ "process": "antigravity" }]
    }
  },
  {
    "id": "windsurf",
    "name": "Windsurf",
    "discordAppId": "1554939359164239982",
    "image": "windsurf",
    "match": {
      "win32": [{ "process": "windsurf.exe" }],
      "darwin": [{ "path": "/Windsurf\\.app/Contents/MacOS/[^/]+$" }],
      "linux": [{ "process": "windsurf" }]
    }
  },
  {
    "id": "claude",
    "name": "Claude",
    "discordAppId": "1555288438880862248",
    "image": "claude",
    "match": {
      "win32": [{ "process": "claude.exe", "path": "WindowsApps\\\\Claude_|AnthropicClaude" }],
      "darwin": [{ "path": "/Claude\\.app/Contents/MacOS/[^/]+$" }]
    }
  }
]
```

- [ ] **Step 3: Write `src/config.js`**

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const configDir =
  process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "agent-presence")
    : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "agent-presence");

export const files = {
  config: path.join(configDir, "config.json"),
  log: path.join(configDir, "agent-presence.log"),
  state: path.join(configDir, "daemon.json"),
};

export function loadConfig(log) {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(files.config, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") log?.(`Invalid config, using defaults: ${err.message}`);
  }
  return {
    disabled: Array.isArray(user.disabled) ? user.disabled : [],
    priority: Array.isArray(user.priority) ? user.priority : [],
    pollSeconds: Number.isFinite(user.pollSeconds) && user.pollSeconds >= 5 ? user.pollSeconds : 15,
  };
}

export function loadApps() {
  return JSON.parse(fs.readFileSync(new URL("./apps.json", import.meta.url), "utf8"));
}
```

- [ ] **Step 4: Write `src/log.js`**

```js
import fs from "node:fs";
import { configDir, files } from "./config.js";

const MAX_BYTES = 1024 * 1024;

export function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.mkdirSync(configDir, { recursive: true });
    if ((fs.statSync(files.log, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) fs.truncateSync(files.log, 0);
    fs.appendFileSync(files.log, line);
  } catch {
    // Logging must never take the daemon down.
  }
  if (process.stdout.isTTY) process.stdout.write(line);
}
```

- [ ] **Step 5: Verify**

Run: `node -e "import('./src/config.js').then(m => console.log(m.loadApps().map(a => a.id), m.loadConfig()))"`
Expected: `[ 'claude-code', 'codex', 'cursor', 'antigravity', 'windsurf', 'claude' ] { disabled: [], priority: [], pollSeconds: 15 }`

- [ ] **Step 6: Commit** `git add -A && git commit -m "Add package scaffold, tool registry, config and logger"`

---

### Task 2: Detector + selector + `detect` command

**Files:**
- Create: `src/detector.js`, `src/selector.js`, `bin/agent-presence.js`

**Interfaces:**
- Consumes: `loadApps`, `loadConfig` (Task 1).
- Produces: `listProcesses(platform?, names?): Promise<{ name, path, cmdline }[]>`, `matchApps(processes, apps, platform?): string[]` (ids in registry order), `processNames(apps, platform?): string[]`, `selectApp(detectedIds, apps, config): App | null`.

- [ ] **Step 1: Write `src/detector.js`**

```js
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

export function processNames(apps, platform = process.platform) {
  const names = apps.flatMap((app) => (app.match[platform] ?? []).map((rule) => rule.process).filter(Boolean));
  return [...new Set(names)];
}

export async function listProcesses(platform = process.platform, names = []) {
  return platform === "win32" ? listWindows(names) : listUnix(platform);
}

async function listWindows(names) {
  // Filtering in WQL keeps the CIM query fast and the JSON small.
  const filter = names.map((name) => `Name='${name.replace(/'/g, "")}'`).join(" OR ");
  const query = filter ? `Get-CimInstance Win32_Process -Filter "${filter}"` : "Get-CimInstance Win32_Process";
  const script = `${query} | Select-Object Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    maxBuffer: MAX_BUFFER,
  });
  if (!stdout.trim()) return [];
  const data = JSON.parse(stdout);
  return (Array.isArray(data) ? data : [data]).map((p) => ({
    name: p.Name ?? "",
    path: p.ExecutablePath ?? "",
    cmdline: p.CommandLine ?? "",
  }));
}

async function listUnix(platform) {
  const [comms, args] = await Promise.all([
    run("ps", ["-axo", "pid=,comm="], { maxBuffer: MAX_BUFFER }),
    run("ps", ["-axo", "pid=,args="], { maxBuffer: MAX_BUFFER }),
  ]);
  const argsByPid = parsePs(args.stdout);
  return [...parsePs(comms.stdout)].map(([pid, comm]) => {
    const cmdline = argsByPid.get(pid) ?? "";
    // macOS comm is the full executable path; Linux comm is just the (truncated) name.
    const exePath = platform === "darwin" ? comm : cmdline.split(" ")[0];
    return { name: path.posix.basename(comm), path: exePath, cmdline };
  });
}

function parsePs(output) {
  const byPid = new Map();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    const space = trimmed.indexOf(" ");
    if (space > 0) byPid.set(trimmed.slice(0, space), trimmed.slice(space + 1).trim());
  }
  return byPid;
}

export function matchApps(processes, apps, platform = process.platform) {
  return apps
    .filter((app) => (app.match[platform] ?? []).some((rule) => processes.some((p) => ruleMatches(rule, p))))
    .map((app) => app.id);
}

function ruleMatches(rule, p) {
  if (rule.process && p.name.toLowerCase() !== rule.process.toLowerCase()) return false;
  if (rule.path && !new RegExp(rule.path, "i").test(p.path)) return false;
  if (rule.notPath && new RegExp(rule.notPath, "i").test(p.path)) return false;
  if (rule.cmdline && !new RegExp(rule.cmdline, "i").test(p.cmdline)) return false;
  return true;
}
```

- [ ] **Step 2: Write `src/selector.js`**

```js
export function selectApp(detectedIds, apps, config) {
  const order = [...config.priority, ...apps.map((app) => app.id).filter((id) => !config.priority.includes(id))];
  const id = order.find((candidate) => detectedIds.includes(candidate) && !config.disabled.includes(candidate));
  return apps.find((app) => app.id === id) ?? null;
}
```

- [ ] **Step 3: Write `bin/agent-presence.js` with `detect` and usage**

```js
#!/usr/bin/env node
import { loadApps, loadConfig } from "../src/config.js";
import { listProcesses, matchApps, processNames } from "../src/detector.js";
import { selectApp } from "../src/selector.js";

const USAGE = `Usage: agent-presence <command>

Commands:
  install     Register autostart and start in the background
  uninstall   Remove autostart and stop the background process
  status      Show autostart, background process and current activity
  detect      Scan once and print the detected tools
  start       Run in the foreground (used by autostart)`;

const commands = { detect };

const [command] = process.argv.slice(2);
const handler = commands[command];
if (!handler) {
  console.log(USAGE);
  process.exitCode = command ? 1 : 0;
} else {
  await handler();
}

async function detect() {
  const apps = loadApps();
  const ids = matchApps(await listProcesses(process.platform, processNames(apps)), apps);
  if (ids.length === 0) {
    console.log("No supported tool is running.");
    return;
  }
  for (const id of ids) console.log(`  ${apps.find((app) => app.id === id).name}`);
  console.log(`Shown on Discord: ${selectApp(ids, apps, loadConfig()).name}`);
}
```

- [ ] **Step 4: Verify on Windows**

Run: `node bin/agent-presence.js detect`
Expected (Claude desktop open with a Code tab session): lists `Claude Code` and `Claude`, then `Shown on Discord: Claude Code`. Run `node bin/agent-presence.js` → usage, exit 0; `node bin/agent-presence.js nope` → usage, exit 1.

- [ ] **Step 5: Commit** `git add -A && git commit -m "Add process detection, selection and detect command"`

---

### Task 3: Presence, state lock, daemon, `start` command

**Files:**
- Create: `src/presence.js`, `src/state.js`, `src/daemon.js`
- Modify: `bin/agent-presence.js` (add `start`)

**Interfaces:**
- Consumes: Task 1 + 2 exports.
- Produces: `class Presence { constructor(log); show(app: App | null): Promise<void>; clear(): Promise<void> }`, `readState(): { pid, current } | null`, `isRunning(state): boolean`, `acquireLock(): boolean`, `writeState(current: string | null): void`, `releaseLock(): void`, `runDaemon(): Promise<void>`.

- [ ] **Step 1: Write `src/presence.js`**

```js
import { Client } from "@xhayper/discord-rpc";

const IMAGE_BASE = "https://raw.githubusercontent.com/tombanaszek1-sketch/agent-presence/main/assets/logos/";
const CONNECT_TIMEOUT_MS = 10_000;
const STATUS_DISPLAY_DETAILS = 2;

export class Presence {
  #log;
  #client = null;
  #appId = null;
  #currentId = null;
  #shownId = null;
  #since = 0;
  #lastError = null;

  constructor(log) {
    this.#log = log;
  }

  async show(app) {
    if (!app) return this.clear();
    if (app.id !== this.#currentId) {
      this.#currentId = app.id;
      this.#since = Date.now();
    }
    if (this.#client && this.#appId === app.discordAppId && this.#shownId === app.id) return;
    try {
      if (!this.#client || this.#appId !== app.discordAppId) await this.#connect(app.discordAppId);
      await this.#client.user.setActivity({
        details: app.name,
        largeImageKey: `${IMAGE_BASE}${app.image}.png`,
        largeImageText: app.name,
        statusDisplayType: STATUS_DISPLAY_DETAILS,
        startTimestamp: this.#since,
      });
      this.#shownId = app.id;
      this.#lastError = null;
      this.#log(`Showing ${app.name}`);
    } catch (err) {
      const message = `Discord not reachable: ${err.message}`;
      if (message !== this.#lastError) this.#log(message);
      this.#lastError = message;
      await this.#disconnect();
    }
  }

  async clear() {
    this.#currentId = null;
    if (!this.#client) return;
    await this.#disconnect();
    this.#log("Cleared activity");
  }

  async #connect(appId) {
    await this.#disconnect();
    const client = new Client({ clientId: appId });
    client.on("disconnected", () => {
      if (this.#client !== client) return;
      this.#client = null;
      this.#appId = null;
      this.#shownId = null;
    });
    try {
      await withTimeout(client.login(), CONNECT_TIMEOUT_MS);
    } catch (err) {
      await client.destroy().catch(() => {});
      throw err;
    }
    this.#client = client;
    this.#appId = appId;
  }

  async #disconnect() {
    const client = this.#client;
    this.#client = null;
    this.#appId = null;
    this.#shownId = null;
    // Closing the IPC connection makes Discord drop the activity.
    if (client) await client.destroy().catch(() => {});
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("connection timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

- [ ] **Step 2: Write `src/state.js`**

```js
import fs from "node:fs";
import { configDir, files } from "./config.js";

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(files.state, "utf8"));
  } catch {
    return null;
  }
}

export function isRunning(state) {
  if (!state?.pid) return false;
  try {
    process.kill(state.pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

export function acquireLock() {
  const state = readState();
  if (state && state.pid !== process.pid && isRunning(state)) return false;
  writeState(null);
  return true;
}

export function writeState(current) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(files.state, JSON.stringify({ pid: process.pid, current }));
}

export function releaseLock() {
  if (readState()?.pid === process.pid) fs.rmSync(files.state, { force: true });
}
```

- [ ] **Step 3: Write `src/daemon.js`**

```js
import { loadApps, loadConfig } from "./config.js";
import { listProcesses, matchApps, processNames } from "./detector.js";
import { log } from "./log.js";
import { Presence } from "./presence.js";
import { selectApp } from "./selector.js";
import { acquireLock, releaseLock, writeState } from "./state.js";

export async function runDaemon() {
  if (!acquireLock()) {
    console.error("agent-presence is already running.");
    process.exitCode = 1;
    return;
  }
  const apps = loadApps();
  const config = loadConfig(log);
  const names = processNames(apps);
  const presence = new Presence(log);
  let timer;

  const shutdown = async () => {
    clearTimeout(timer);
    await presence.clear();
    releaseLock();
    log("Stopped");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log(`Started (pid ${process.pid})`);
  const tick = async () => {
    let detected = [];
    try {
      detected = matchApps(await listProcesses(process.platform, names), apps);
    } catch (err) {
      log(`Process listing failed: ${err.message}`);
    }
    const app = selectApp(detected, apps, config);
    await presence.show(app);
    writeState(app?.name ?? null);
    timer = setTimeout(tick, config.pollSeconds * 1000);
  };
  await tick();
}
```

- [ ] **Step 4: Add `start` to `bin/agent-presence.js`**

Add import `import { runDaemon } from "../src/daemon.js";` and change the map to `const commands = { detect, start: runDaemon };`.

- [ ] **Step 5: Verify on Windows**

1. `node bin/agent-presence.js start` in a terminal: log line `Showing Claude Code` within a few seconds. Ask the user to confirm the Discord profile shows "Vibe Coding" with "Claude Code", the logo and a timer.
2. Second terminal: `node bin/agent-presence.js start` → `agent-presence is already running.`, exit 1.
3. Ctrl+C in the first terminal → `Cleared activity`, `Stopped`, activity gone in Discord, `daemon.json` removed.
4. Close Discord, start the daemon → one `Discord not reachable` line, no crash; reopen Discord → `Showing Claude Code` within one poll.

If the logo does not render from the URL, fall back to uploading the logos as art assets named by `image` and pass the bare key (drop `IMAGE_BASE`); record that in the spec.

- [ ] **Step 6: Commit** `git add -A && git commit -m "Add Discord presence daemon and start command"`

---

### Task 4: Autostart + `install`, `uninstall`, `status`

**Files:**
- Create: `src/autostart/index.js`, `src/autostart/win32.js`, `src/autostart/darwin.js`, `src/autostart/linux.js`
- Modify: `bin/agent-presence.js`

**Interfaces:**
- Consumes: `readState`, `isRunning`, `files` (Task 1, 3).
- Produces: `autostart(platform?): { register(cmd: string[]), unregister(), isRegistered(): boolean, location: string }`, `launchCommand(): [nodePath, scriptPath, "start"]`.

- [ ] **Step 1: Write `src/autostart/index.js`**

```js
import { fileURLToPath } from "node:url";
import * as darwin from "./darwin.js";
import * as linux from "./linux.js";
import * as win32 from "./win32.js";

const implementations = { win32, darwin, linux };

export function autostart(platform = process.platform) {
  const implementation = implementations[platform];
  if (!implementation) {
    throw new Error(`Autostart is not supported on ${platform}. Run "agent-presence start" from your own startup script.`);
  }
  return implementation;
}

export function launchCommand() {
  return [process.execPath, fileURLToPath(new URL("../../bin/agent-presence.js", import.meta.url)), "start"];
}
```

- [ ] **Step 2: Write `src/autostart/win32.js`**

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
export const location = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "agent-presence.vbs");

export function register(command) {
  // A VBScript launcher starts node without a console window. "" escapes a quote in VBScript.
  const line = command.map((part) => (part.includes(" ") || part.includes("\\") ? `""${part}""` : part)).join(" ");
  fs.writeFileSync(location, `CreateObject("WScript.Shell").Run "${line}", 0, False\r\n`);
}

export function unregister() {
  fs.rmSync(location, { force: true });
}

export function isRegistered() {
  return fs.existsSync(location);
}
```

- [ ] **Step 3: Write `src/autostart/darwin.js`**

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const location = path.join(os.homedir(), "Library", "LaunchAgents", "dev.agent-presence.plist");

const escapeXml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function register(command) {
  const args = command.map((part) => `    <string>${escapeXml(part)}</string>`).join("\n");
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(
    location,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.agent-presence</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`,
  );
}

export function unregister() {
  fs.rmSync(location, { force: true });
}

export function isRegistered() {
  return fs.existsSync(location);
}
```

- [ ] **Step 4: Write `src/autostart/linux.js`**

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
export const location = path.join(configHome, "autostart", "agent-presence.desktop");

export function register(command) {
  const exec = command.map((part) => `"${part.replace(/(["`$\\])/g, "\\$1")}"`).join(" ");
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(
    location,
    `[Desktop Entry]
Type=Application
Name=agent-presence
Comment=Show your AI coding agent as Discord activity
Exec=${exec}
NoDisplay=true
X-GNOME-Autostart-enabled=true
`,
  );
}

export function unregister() {
  fs.rmSync(location, { force: true });
}

export function isRegistered() {
  return fs.existsSync(location);
}
```

- [ ] **Step 5: Add commands to `bin/agent-presence.js`**

Imports: `import { spawn } from "node:child_process";`, `import fs from "node:fs";`, `import { autostart, launchCommand } from "../src/autostart/index.js";`, `import { files } from "../src/config.js";` (merge with the existing config import), `import { isRunning, readState } from "../src/state.js";`.
Map: `const commands = { install, uninstall, status, detect, start: runDaemon };`

```js
async function install() {
  const target = autostart();
  const [node, ...args] = launchCommand();
  target.register([node, ...args]);
  console.log(`Autostart registered: ${target.location}`);
  if (isRunning(readState())) {
    console.log("Already running.");
    return;
  }
  spawn(node, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  console.log("Started in the background. Run \"agent-presence status\" to check.");
}

async function uninstall() {
  autostart().unregister();
  console.log("Autostart removed.");
  const state = readState();
  if (isRunning(state)) {
    process.kill(state.pid);
    console.log(`Stopped background process ${state.pid}.`);
  }
  fs.rmSync(files.state, { force: true });
}

async function status() {
  let registered = "not supported on this OS";
  try {
    registered = autostart().isRegistered() ? "yes" : "no";
  } catch {}
  const state = readState();
  const running = isRunning(state);
  console.log(`Autostart:  ${registered}`);
  console.log(`Running:    ${running ? `yes (pid ${state.pid})` : "no"}`);
  console.log(`Showing:    ${running ? (state.current ?? "nothing") : "-"}`);
  console.log(`Log file:   ${files.log}`);
}
```

- [ ] **Step 6: Verify on Windows**

1. `node bin/agent-presence.js install` → prints the Startup `.vbs` path and "Started in the background". Read the `.vbs` and check the quoting.
2. `node bin/agent-presence.js status` → `Autostart: yes`, `Running: yes (pid N)`, `Showing: Claude Code`.
3. Run the `.vbs` once by hand while stopped (`wscript <path>`) → no console window, `status` shows running.
4. `node bin/agent-presence.js uninstall` → autostart removed, process stopped, Discord activity gone; `status` → `Autostart: no`, `Running: no`.

- [ ] **Step 7: Commit** `git add -A && git commit -m "Add autostart and install, uninstall, status commands"`

---

### Task 5: README, INSTALL.md, LICENSE, global install check

**Files:**
- Create: `README.md`, `INSTALL.md`, `LICENSE` (MIT, holder "tombanaszek1-sketch", year 2026)

- [ ] **Step 1: Write `INSTALL.md`** (written for coding agents)

Content: purpose in one line; steps an agent runs, in order:
1. Check `node --version` is >= 20; if not, tell the user to install Node.js LTS from nodejs.org and stop.
2. `npm install -g agent-presence`; if the package is not on npm yet, `npm install -g github:tombanaszek1-sketch/agent-presence`.
3. `agent-presence install`.
4. `agent-presence detect` and `agent-presence status`; report both outputs to the user.
5. Tell the user: Discord desktop must be running and "Share my activity" must be on (User Settings -> Activity Privacy).
Uninstall: `agent-presence uninstall` then `npm uninstall -g agent-presence`.

- [ ] **Step 2: Write `README.md`**

Sections: title + one-line pitch; "What it looks like" (Discord member list shows the tool name; profile card shows the app, tool name, logo, elapsed time; Claude tools appear under "Vibe Coding" because Discord rejects application names containing "Claude"); "Setup with your agent" with the copy-paste prompt `Set up https://github.com/tombanaszek1-sketch/agent-presence for me by following its INSTALL.md.`; "Manual setup" (the npm + install commands); supported tools table (tool, detected how, Discord activity name); commands table; config file location and example JSON; "Platform status" (Windows tested, macOS/Linux implemented but untested, reports welcome); "Adding a tool" (registry entry format, a Discord application per tool is needed); credits (logos from lobe-icons, MIT; trademarks belong to their owners); license.
Run the humanizer pass over the prose before committing.

- [ ] **Step 3: Verify global install from the local folder**

Run: `npm install -g .` then `agent-presence status` and `agent-presence detect` from another directory; then `npm pack --dry-run` and check the file list contains only `bin/`, `src/`, `package.json`, `README.md`, `LICENSE`. Finally `npm uninstall -g agent-presence`.

- [ ] **Step 4: Commit and push** `git add -A && git commit -m "Add README, agent install guide and license" && git push`
