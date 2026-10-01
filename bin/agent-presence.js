#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import { autostart, launchCommand } from "../src/autostart/index.js";
import { files, loadApps, loadConfig } from "../src/config.js";
import { runDaemon } from "../src/daemon.js";
import { listProcesses, matchApps, processNames } from "../src/detector.js";
import { selectApp } from "../src/selector.js";
import { isRunning, readState } from "../src/state.js";

const USAGE = `Usage: agent-presence <command>

Commands:
  install     Register autostart and start in the background
  uninstall   Remove autostart and stop the background process
  status      Show autostart, background process and current activity
  detect      Scan once and print the detected tools
  start       Run in the foreground (used by autostart)`;

const commands = { install, uninstall, status, detect, start: runDaemon };

const [command] = process.argv.slice(2);
const handler = commands[command];
if (!handler) {
  console.log(USAGE);
  process.exitCode = command ? 1 : 0;
} else {
  await handler();
}

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
  console.log('Started in the background. Run "agent-presence status" to check.');
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
