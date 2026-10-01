#!/usr/bin/env node
import { loadApps, loadConfig } from "../src/config.js";
import { runDaemon } from "../src/daemon.js";
import { listProcesses, matchApps, processNames } from "../src/detector.js";
import { selectApp } from "../src/selector.js";

const USAGE = `Usage: agent-presence <command>

Commands:
  install     Register autostart and start in the background
  uninstall   Remove autostart and stop the background process
  status      Show autostart, background process and current activity
  detect      Scan once and print the detected tools
  start       Run in the foreground (used by autostart)`;

const commands = { detect, start: runDaemon };

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
