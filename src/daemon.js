import { loadApps, loadConfig } from "./config.js";
import { listProcesses, matchApps, processNames } from "./detector.js";
import { log } from "./log.js";
import { Presence } from "./presence.js";
import { selectApp } from "./selector.js";
import { acquireLock, releaseLock, writeState } from "./state.js";

export async function runDaemon() {
  if (!acquireLock()) {
    console.error("agent-presence is already running.");
    process.exitCode = 1;
    return;
  }
  const apps = loadApps();
  const config = loadConfig(log);
  const names = processNames(apps);
  const presence = new Presence(log);
  let timer;

  const shutdown = async () => {
    clearTimeout(timer);
    await presence.clear();
    releaseLock();
    log("Stopped");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log(`Started (pid ${process.pid})`);
  const tick = async () => {
    let detected = [];
    try {
      detected = matchApps(await listProcesses(process.platform, names), apps);
    } catch (err) {
      log(`Process listing failed: ${err.message}`);
    }
    const app = selectApp(detected, apps, config);
    await presence.show(app);
    writeState(app?.name ?? null);
    timer = setTimeout(tick, config.pollSeconds * 1000);
  };
  await tick();
}
