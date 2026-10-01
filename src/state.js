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
