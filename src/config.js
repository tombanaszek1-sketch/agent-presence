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
