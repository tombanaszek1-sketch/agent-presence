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
