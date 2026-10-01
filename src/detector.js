import { execFile, spawn } from "node:child_process";
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
  const stdout = await powershell(`${query} | Select-Object Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress`);
  if (!stdout.trim()) return [];
  const data = JSON.parse(stdout);
  return (Array.isArray(data) ? data : [data]).map((p) => ({
    name: p.Name ?? "",
    path: p.ExecutablePath ?? "",
    cmdline: p.CommandLine ?? "",
  }));
}

// Starting powershell.exe costs ~200 ms, the query itself ~40 ms. One long-lived shell
// that reads commands from stdin makes frequent polling cheap.
let shell = null;
const END_MARKER = "__agent_presence_end__";

function powershell(command) {
  if (!shell) shell = startShell();
  const current = shell;
  const result = current.queue.then(
    () =>
      new Promise((resolve, reject) => {
        current.pending = { resolve, reject, output: "" };
        keepAlive(current, true);
        current.child.stdin.write(`${command}; '${END_MARKER}'\n`);
      }),
  );
  result.finally(() => keepAlive(current, false)).catch(() => {});
  current.queue = result.catch(() => {});
  return result;
}

function startShell() {
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "-"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const state = { child, queue: Promise.resolve(), pending: null };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (!state.pending) return;
    state.pending.output += chunk;
    const end = state.pending.output.indexOf(END_MARKER);
    if (end === -1) return;
    const { resolve, output } = state.pending;
    state.pending = null;
    resolve(output.slice(0, end));
  });
  child.on("exit", () => {
    if (shell === state) shell = null;
    state.pending?.reject(new Error("PowerShell exited"));
    state.pending = null;
  });
  child.on("error", (err) => {
    if (shell === state) shell = null;
    state.pending?.reject(err);
    state.pending = null;
  });
  keepAlive(state, false);
  return state;
}

// An idle shell must not keep one-shot commands such as "detect" from exiting.
function keepAlive({ child }, on) {
  for (const handle of [child, child.stdout, child.stdin]) {
    if (on) handle.ref?.();
    else handle.unref?.();
  }
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
