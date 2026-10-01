import { Client } from "@xhayper/discord-rpc";

const IMAGE_BASE = "https://raw.githubusercontent.com/tombanaszek1-sketch/agent-presence/main/assets/logos/";
const CONNECT_TIMEOUT_MS = 10_000;
const STATUS_DISPLAY_DETAILS = 2;

export class Presence {
  #log;
  #client = null;
  #appId = null;
  #currentId = null;
  #shownId = null;
  #since = 0;
  #lastError = null;

  constructor(log) {
    this.#log = log;
  }

  async show(app) {
    if (!app) return this.clear();
    if (app.id !== this.#currentId) {
      this.#currentId = app.id;
      this.#since = Date.now();
    }
    if (this.#client && this.#appId === app.discordAppId && this.#shownId === app.id) return;
    try {
      if (!this.#client || this.#appId !== app.discordAppId) await this.#connect(app.discordAppId);
      await this.#client.user.setActivity({
        details: app.name,
        largeImageKey: `${IMAGE_BASE}${app.image}.png`,
        largeImageText: app.name,
        statusDisplayType: STATUS_DISPLAY_DETAILS,
        startTimestamp: this.#since,
      });
      this.#shownId = app.id;
      this.#lastError = null;
      this.#log(`Showing ${app.name}`);
    } catch (err) {
      const message = `Discord not reachable: ${err.message}`;
      if (message !== this.#lastError) this.#log(message);
      this.#lastError = message;
      await this.#disconnect();
    }
  }

  async clear() {
    this.#currentId = null;
    if (!this.#client) return;
    await this.#disconnect();
    this.#log("Cleared activity");
  }

  async #connect(appId) {
    await this.#disconnect();
    const client = new Client({ clientId: appId });
    client.on("disconnected", () => {
      if (this.#client !== client) return;
      this.#client = null;
      this.#appId = null;
      this.#shownId = null;
    });
    try {
      await withTimeout(client.login(), CONNECT_TIMEOUT_MS);
    } catch (err) {
      await client.destroy().catch(() => {});
      throw err;
    }
    this.#client = client;
    this.#appId = appId;
  }

  async #disconnect() {
    const client = this.#client;
    this.#client = null;
    this.#appId = null;
    this.#shownId = null;
    // Closing the IPC connection makes Discord drop the activity.
    if (client) await client.destroy().catch(() => {});
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("connection timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
