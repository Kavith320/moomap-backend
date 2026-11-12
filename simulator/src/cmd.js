#!/usr/bin/env node
// Send a command to a running simulator (started with CONTROL_PORT set).
//   npm run cmd -- status
//   npm run cmd -- wander Sudu
// Authenticates with the local command key the simulator writes to simulator/.control-token.
const fs = require("fs");
const path = require("path");
require("./config"); // loads simulator/.env
const port = Number(process.env.CONTROL_PORT || 7070);
const command = process.argv.slice(2).join(" ") || "status";

let token = "";
try {
  token = fs.readFileSync(path.join(__dirname, "..", ".control-token"), "utf8").trim();
} catch {}

fetch(`http://127.0.0.1:${port}/`, { method: "POST", body: command, headers: { "X-Sim-Token": token } })
  .then(async (r) => {
    if (r.status === 401) throw Object.assign(new Error("auth"), { auth: true });
    process.stdout.write(await r.text());
  })
  .catch((e) => {
    console.error(
      e.auth
        ? "✖ The simulator rejected the command key. Run this as the same user as the simulator (it reads simulator/.control-token)."
        : `✖ No simulator listening on 127.0.0.1:${port}. Start it with CONTROL_PORT=${port}.`
    );
    process.exit(1);
  });
