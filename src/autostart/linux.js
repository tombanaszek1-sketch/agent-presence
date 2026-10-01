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
