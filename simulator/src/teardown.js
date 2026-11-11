#!/usr/bin/env node
// Removes the simulated farm: geofence, cattle and (unless --keep-user) the sim user.
// Collar devices stay registered: deleting devices needs an admin (Admin → Devices).
const fs = require("fs");
const cfg = require("./config");
const { createApi } = require("./backendApi");

async function main() {
  const keepUser = process.argv.includes("--keep-user");
  const api = createApi(cfg.backendUrl);
  const login = await api.post("/api/users/login", { mobile: cfg.user.mobile, password: cfg.user.password });
  if (!login.ok) throw new Error(`Sim user login failed (${login.error}). Nothing to remove?`);
  api.setToken(login.data.token);

  const prefix = `${cfg.herd.idPrefix}-`;
  const fences = (await api.get("/api/geofences")).data || [];
  for (const f of fences.filter((f) => f.name === cfg.herd.fenceName)) await api.del(`/api/geofences/${f._id}`);

  const cattle = (await api.get("/api/cattles")).data || [];
  const sim = cattle.filter((c) => String(c._id || c.cattleId).startsWith(prefix));
  for (const c of sim) await api.del(`/api/cattles/${encodeURIComponent(c._id || c.cattleId)}`);
  console.log(`✔ Removed ${sim.length} cattle and the "${cfg.herd.fenceName}" geofence`);

  if (!keepUser) {
    const r = await api.del("/api/users/me");
    console.log(r.ok ? `✔ Deleted sim user ${cfg.user.mobile}` : `✖ Could not delete user: ${r.error}`);
  }
  if (fs.existsSync(cfg.stateFile)) fs.unlinkSync(cfg.stateFile);
  console.log(`ℹ Collar devices (${prefix}M.., ${prefix}S..) remain; an admin can delete them under Devices.`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
