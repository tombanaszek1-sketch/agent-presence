# Installing agent-presence (instructions for coding agents)

agent-presence shows the AI coding tool the user is working in as their Discord activity.
Follow these steps in order and report the results to the user.

1. Run `node --version`. If Node.js is missing or older than 20, tell the user to install
   the LTS version from https://nodejs.org and stop here.
2. Install the CLI globally:
   ```
   npm install -g agent-presence
   ```
   If npm reports that the package does not exist, install it from GitHub instead:
   ```
   npm install -g github:tombanaszek1-sketch/agent-presence
   ```
3. Register autostart and start the background process:
   ```
   agent-presence install
   ```
4. Check the result and show both outputs to the user:
   ```
   agent-presence detect
   agent-presence status
   ```
5. Tell the user two things:
   - The Discord desktop app has to be running. The browser version of Discord cannot
     show activities from local programs.
   - "Share my activity" has to be on: Discord -> User Settings -> Activity Privacy.

## Uninstall

```
agent-presence uninstall
npm uninstall -g agent-presence
```
