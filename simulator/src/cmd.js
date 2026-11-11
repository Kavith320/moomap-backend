#!/usr/bin/env node
// Send a command to a running simulator (started with CONTROL_PORT set).
//   npm run cmd -- status
//   npm run cmd -- wander Sudu
require("./config"); // loads simulator/.env
const port = Number(process.env.CONTROL_PORT || 7070);
const command = process.argv.slice(2).join(" ") || "status";

fetch(`http://127.0.0.1:${port}/`, { method: "POST", body: command })
  .then((r) => r.text())
  .then((t) => process.stdout.write(t))
  .catch(() => {
    console.error(`✖ No simulator listening on 127.0.0.1:${port}. Start it with CONTROL_PORT=${port}.`);
    process.exit(1);
  });
