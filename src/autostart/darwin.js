import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const location = path.join(os.homedir(), "Library", "LaunchAgents", "dev.agent-presence.plist");

const escapeXml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function register(command) {
  const args = command.map((part) => `    <string>${escapeXml(part)}</string>`).join("\n");
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(
    location,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.agent-presence</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`,
  );
}

export function unregister() {
  fs.rmSync(location, { force: true });
}

export function isRegistered() {
  return fs.existsSync(location);
}
