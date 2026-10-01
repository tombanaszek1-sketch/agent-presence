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
