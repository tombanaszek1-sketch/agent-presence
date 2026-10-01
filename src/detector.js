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
