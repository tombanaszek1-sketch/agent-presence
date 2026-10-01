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
