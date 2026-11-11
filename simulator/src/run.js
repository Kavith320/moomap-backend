#!/usr/bin/env node
// Runs the simulated herd and its collar network.
//
//   npm start                         interactive (type `help`)
//   npm start -- --scenario=demo      scripted test, see SCENARIOS below
//   TIME_SCALE=20 npm start           cows move 20x faster than real time
const fs = require("fs");
const readline = require("readline");
const http = require("http");
const path = require("path");
const { toLatLon, toXY } = require("./geo");
const cfg = require("./config");
const { createRandom } = require("./random");
const { Cow, Herd } = require("./herd");
const { Network, radioSummary } = require("./network");
const { connectMqtt } = require("./mqttLink");
const { createApi } = require("./backendApi");

// at: seconds after start (real time). `cow` is an index into the slave list, so a
// scenario never moves the master (which would take the whole herd's uplink with it).
const SCENARIOS = {
  calm: [],
  breakout: [
    { at: 60, run: (s) => s.wander(s.slave(1)) },
    { at: 600, run: (s) => s.home(s.slave(1)) },
  ],
  battery: [{ at: 30, run: (s) => s.setBattery(s.slave(0), 18) }],
  gateway: [
    { at: 60, run: (s) => s.setMaster(false) },
    { at: 60 + Number(process.env.GATEWAY_DOWN_S || 3900), run: (s) => s.setMaster(true) },
  ],
  demo: [
    { at: 45, run: (s) => s.wander(s.slave(1)) },
    { at: 90, run: (s) => s.setBattery(s.slave(2), 18) },
    { at: 480, run: (s) => s.home(s.slave(1)) },
  ],
};

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

// Under pm2 a missing herd.json would mean an endless crash/restart loop, so wait for it instead.
async function loadState() {
  let warned = false;
  while (!fs.existsSync(cfg.stateFile)) {
    if (!process.stdin.isTTY) {
      if (!warned) console.error("✖ herd.json not found. Run `npm run setup`; waiting for it…");
      warned = true;
      await new Promise((r) => setTimeout(r, 10000));
    } else {
      console.error("✖ herd.json not found. Run `npm run setup` first.");
      process.exit(1);
    }
  }
  if (warned) console.log("✔ herd.json found, starting");
  return JSON.parse(fs.readFileSync(cfg.stateFile, "utf8"));
}

async function main() {
  const state = await loadState();
  const rnd = createRandom(cfg.seed + 1);
  const cows = state.cows.map((c) => new Cow({ ...c, x: c.home.x, y: c.home.y }, rnd));
  const herd = new Herd(cows, state.pasture);
  const events = []; // recent log lines for the control panel
  const log = (...a) => {
    console.log(`[${new Date().toLocaleTimeString()}]`, ...a);
    events.push({ at: Date.now(), text: a.join(" ") });
    if (events.length > 200) events.shift();
  };

  const radio = radioSummary(cfg);
  log(
    `Herd: ${cows.length} cattle, ${cows.filter((c) => c.role === "master").length} master | ` +
      `LoRa SF${cfg.lora.sf}/${cfg.lora.bwKhz}kHz ${cfg.lora.freqMhz}MHz, airtime ${radio.timeOnAirMs} ms, ` +
      `range ≈${radio.nominalRangeM} m, sensitivity ${radio.sensitivityDbm} dBm`
  );
  if (!radio.dutyCycleOk) {
    log(`⚠ SLAVE_INTERVAL_S=${cfg.timing.slaveIntervalS}s breaks the ${cfg.lora.dutyCycle * 100}% duty cycle (min ${radio.minIntervalS}s).`);
  }

  const link = connectMqtt(cfg, log);
  await link.ready.catch((e) => {
    log(`✖ ${e.message}`);
    process.exit(1);
  });

  const net = new Network({ herd, origin: state.origin, cfg, rnd, publish: link.publish, log });

  let herdDestination = null; // { lat, lon, how } while the herd is being taken somewhere

  // Control surface used by scenarios and the REPL
  const ctl = {
    slave: (i) => {
      const slaves = cows.filter((c) => c.role === "slave");
      return slaves[Math.min(i, slaves.length - 1)] || cows[0];
    },
    wander: (cow) => {
      cow.wander(state.pasture);
      log(`🐄 ${cow.name} (${cow.collarId}) is breaking out of the fence`);
    },
    home: (cow) => {
      cow.goHome(state.pasture);
      log(`🏠 ${cow.name} is heading back into the pasture`);
    },
    setBattery: (cow, pct) => {
      net.byId.get(cow.collarId).battery = pct;
      log(`🔋 ${cow.name}'s collar battery set to ${pct}%`);
    },
    setCollar: (cow, alive) => {
      net.byId.get(cow.collarId).alive = alive;
      log(`${alive ? "📶" : "📴"} ${cow.collarId} (${cow.name}) ${alive ? "back on" : "switched off"}`);
    },
    setMaster: (alive, id) => {
      for (const m of net.masters) if (!id || m.id === id) m.alive = alive;
      log(`${alive ? "📡" : "⛔"} master collar uplink ${alive ? "restored" : "down. Slaves have no relay"}`);
    },
  };

  // scenario timeline (can be (re)started at runtime from the panel or `scenario <name>`)
  const scenarioSpeed = Math.max(0.01, Number(process.env.SCENARIO_SPEED) || 1); // >1 runs the timeline faster
  let scenarioName = arg("scenario") || process.env.SCENARIO || "calm";
  if (!SCENARIOS[scenarioName]) {
    log(`✖ Unknown scenario "${scenarioName}". Options: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(1);
  }
  let startedAt = Date.now();
  let pending = [...SCENARIOS[scenarioName]];
  const startScenario = (name) => {
    scenarioName = name;
    startedAt = Date.now();
    pending = [...SCENARIOS[name]];
    log(`▶ Scenario: ${name}${pending.length ? ` (${pending.length} step${pending.length > 1 ? "s" : ""})` : ""}`);
  };
  startScenario(scenarioName);

  // main loop: 1 s real time
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      herd.step(1 * cfg.timing.timeScale);
      const elapsed = ((Date.now() - startedAt) / 1000) * scenarioSpeed;
      while (pending.length && pending[0].at <= elapsed) pending.shift().run(ctl);
      await net.tick();
    } finally {
      busy = false;
    }
  }, 1000);

  const statusText = () => {
    const rows = cows.map((c) => {
      const col = net.byId.get(c.collarId);
      const fd = c.fenceDistance(state.pasture);
      return [
        c.name,
        c.collarId,
        c.role,
        c.mode === "normal" ? c.state : c.mode,
        fd >= 0 ? `in ${Math.round(fd)}m` : `OUT ${Math.round(-fd)}m`,
        `${Math.round(col.battery)}%`,
        !col.alive ? "off" : col.role === "master" ? "uplink" : col.last ? (col.last.via ? `${col.last.rssi}dBm` : "lost") : "-",
        `${col.stats.delivered}/${col.stats.sent}`,
      ];
    });
    const head = ["cow", "collar", "role", "doing", "fence", "batt", "link", "delivered"];
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (r) => r.map((v, i) => v.padEnd(widths[i])).join("  ");
    const t = net.summary();
    return [
      line(head),
      widths.map((w) => "-".repeat(w)).join("  "),
      ...rows.map(line),
      `sent ${t.sent}, delivered ${t.delivered}, lost: weak ${t.lostWeak}, interference ${t.lostInterference}, no master ${t.lostNoMaster}`,
    ].join("\n");
  };

  const HELP = `commands:
  status                    table of every cow / collar
  wander <cow>              cow breaks out of the fence  (geofence_exit alert)
  home <cow|all>            walk back inside             (geofence_enter alert)
  battery <cow> <pct>       set collar battery           (low_battery alert at <=20%)
  off <cow> / on <cow>      switch a collar off / on     (offline alert after OFFLINE_AFTER_MINUTES)
  master down|up [id]       master uplink fails / returns: all slaves go silent
  speed <x>                 time scale for cow movement
  tx <cow|all>              transmit now instead of waiting for the interval
  move <cow> <lat> <lon>    drop a cow at a position
  herd <lat> <lon> [walk|teleport]  take the whole herd to a location ("home all" brings it back)
  scenario <name>           start a scenario (${Object.keys(SCENARIOS).join(", ")})
  <cow> = name, cattle ID or collar ID`;

  // One command handler for the interactive prompt and the control port. Returns text.
  const execute = (input) => {
    const [cmd, a, b] = String(input).trim().split(/\s+/);
    const find = (name) => herd.find(name || "");
    const missing = (name) => `No cow/collar "${name || ""}". Cows: ${cows.map((c) => c.name).join(", ")}`;
    let cow;
    switch ((cmd || "").toLowerCase()) {
      case "":
        return "";
      case "help":
        return HELP;
      case "status":
        return statusText();
      case "wander":
        if (!(cow = find(a))) return missing(a);
        ctl.wander(cow);
        return `${cow.name} is breaking out`;
      case "home":
        if (a === "all") {
          herdDestination = null;
          const out = cows.filter((c) => c.mode !== "normal");
          out.forEach((c) => ctl.home(c));
          return `${out.length} cow(s) heading home`;
        }
        if (!(cow = find(a))) return missing(a);
        ctl.home(cow);
        return `${cow.name} heading home`;
      case "battery": {
        if (!(cow = find(a))) return missing(a);
        const pct = Math.max(0, Math.min(100, Number(b) || 0));
        ctl.setBattery(cow, pct);
        return `${cow.name} battery ${pct}%`;
      }
      case "off":
      case "on":
        if (!(cow = find(a))) return missing(a);
        ctl.setCollar(cow, cmd.toLowerCase() === "on");
        return `${cow.collarId} ${cmd.toLowerCase()}`;
      case "master":
        ctl.setMaster(a !== "down", b);
        return `master ${a === "down" ? "down" : "up"}`;
      case "speed":
        cfg.timing.timeScale = Math.max(0.1, Math.min(200, Number(a) || 1));
        log(`⏩ cow movement ${cfg.timing.timeScale}x`);
        return `time scale ${cfg.timing.timeScale}x`;
      case "tx": {
        // transmit on the next tick instead of waiting for the interval
        const list = a === "all" ? net.collars : find(a) ? [net.byId.get(find(a).collarId)] : [];
        if (!list.length) return missing(a);
        list.forEach((c) => (c.nextTxAt = 0));
        return `${list.length} collar(s) transmit now`;
      }
      case "move": {
        // move <cow> <lat> <lon>
        if (!(cow = find(a))) return missing(a);
        const [, , lat, lon] = String(input).trim().split(/\s+/);
        if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return "usage: move <cow> <lat> <lon>";
        const p = toXY(state.origin, +lat, +lon);
        cow.teleport(p.x, p.y, state.pasture);
        log(`📍 ${cow.name} moved ${cow.insideFence(state.pasture) ? "inside" : "OUTSIDE"} the fence`);
        return `${cow.name} moved`;
      }
      case "herd": {
        // herd <lat> <lon> [walk|teleport]
        const [, lat, lon, how = "walk"] = String(input).trim().split(/\s+/);
        if (!Number.isFinite(+lat) || !Number.isFinite(+lon) || !["walk", "teleport"].includes(how)) {
          return "usage: herd <lat> <lon> [walk|teleport]";
        }
        const p = toXY(state.origin, +lat, +lon);
        herd.moveTo(p, how);
        herdDestination = { lat: +lat, lon: +lon, how };
        const inside = require("./geo").pointInPolygon(p, state.pasture);
        const dist = Math.round(Math.hypot(p.x - herd.cows[0].x, p.y - herd.cows[0].y));
        log(
          `🐮 Herd ${how === "teleport" ? "moved" : "walking"} to ${(+lat).toFixed(5)}, ${(+lon).toFixed(5)} ` +
            `(${inside ? "inside" : "OUTSIDE"} the fence${how === "walk" ? `, ~${dist} m` : ""})`
        );
        return `herd ${how === "teleport" ? "moved" : "on the way"} (${inside ? "inside" : "outside"} the fence)`;
      }
      case "scenario":
        if (!SCENARIOS[a]) return `scenarios: ${Object.keys(SCENARIOS).join(", ")}`;
        startScenario(a);
        return `scenario ${a} started`;
      default:
        return `Unknown command "${cmd}". Try: help`;
    }
  };

  // Current photos come from the backend (the farmer may change them in the portal);
  // herd.json only has what setup uploaded.
  const photos = new Map(state.cows.map((c) => [c.cattleId, { image: c.image || null, credit: c.imageCredit || null }]));
  const refreshPhotos = async () => {
    try {
      const api = createApi(cfg.backendUrl);
      const login = await api.post("/api/users/login", { mobile: cfg.user.mobile, password: cfg.user.password });
      if (!login.ok) return;
      api.setToken(login.data.token);
      const list = await api.get("/api/cattles");
      for (const c of list.data || []) {
        const id = c._id || c.cattleId;
        if (photos.has(id)) photos.set(id, { image: c.Image || null, credit: c.imageCredit || null });
      }
    } catch {}
  };
  let lastPhotoRefresh = Date.now();
  refreshPhotos();
  setInterval(refreshPhotos, 60 * 1000).unref();

  // JSON snapshot for the control panel
  const snapshot = () => {
    const ll = (p) => {
      const r = toLatLon(state.origin, p.x, p.y);
      return { lat: +r.lat.toFixed(6), lon: +r.lon.toFixed(6) };
    };
    return {
      now: Date.now(),
      scenario: scenarioName,
      scenarios: Object.keys(SCENARIOS),
      timeScale: cfg.timing.timeScale,
      intervals: { slave: cfg.timing.slaveIntervalS, master: cfg.timing.masterIntervalS },
      radio: { ...radioSummary(cfg), sf: cfg.lora.sf, bwKhz: cfg.lora.bwKhz, freqMhz: cfg.lora.freqMhz },
      mqtt: { url: cfg.mqtt.url, connected: link.client.connected },
      fenceName: cfg.herd.fenceName,
      herdDestination,
      pasture: state.pasture.map(ll),
      summary: net.summary(),
      cows: cows.map((c) => {
        const col = net.byId.get(c.collarId);
        return {
          ...(() => {
            const ph = photos.get(c.cattleId) || {};
            const img = ph.image;
            return {
              // local uploads go through the /media proxy; external URLs are used directly
              image: !img ? null : img.startsWith("/media/") ? `media/${img.slice("/media/".length)}` : img,
              imageCredit: ph.credit || null,
            };
          })(),
          name: c.name,
          cattleId: c.cattleId,
          collarId: c.collarId,
          role: c.role,
          ...ll(c.pos),
          activity: c.mode === "normal" ? c.state : c.mode,
          inside: c.insideFence(state.pasture),
          fenceDistanceM: Math.round(c.fenceDistance(state.pasture)),
          battery: Math.round(col.battery * 10) / 10,
          alive: col.alive,
          nextTxInS: Math.max(0, Math.round((col.nextTxAt - Date.now()) / 1000)),
          last: col.last,
          stats: col.stats,
        };
      }),
      events: events.slice(-60),
    };
  };

  // Control server (localhost only). Serves the control panel, a JSON API and the
  // plain-text command endpoint used by `npm run cmd`.
  //   GET  /            control panel (web UI)
  //   GET  /api/state   JSON snapshot
  //   POST /api/cmd     {"command":"wander Sudu"} -> {"output": "..."}
  //   POST /            plain-text command (npm run cmd)
  let control = null;
  const controlPort = Number(process.env.CONTROL_PORT || 0);
  const panelHtml = path.join(__dirname, "..", "public", "index.html");
  if (controlPort) {
    control = http
      .createServer((req, res) => {
        let body = "";
        req.on("data", (d) => {
          body += d;
          if (body.length > 10000) req.destroy();
        });
        req.on("end", () => {
          const send = (code, type, data) => {
            res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
            res.end(data);
          };
          const url = (req.url || "/").split("?")[0];
          try {
            if (req.method === "GET" && (url === "/" || url === "/index.html")) {
              return send(200, "text/html; charset=utf-8", fs.readFileSync(panelHtml));
            }
            if (req.method === "GET" && url.startsWith("/media/") && !url.includes("..")) {
              // photos live on the backend; proxy them so the panel only needs this one address
              return fetch(cfg.backendUrl + url)
                .then(async (r) => {
                  if (!r.ok) {
                    // photo was replaced or removed in the portal: refresh (at most every 5 s)
                    if (r.status === 404 && Date.now() - lastPhotoRefresh > 5000) {
                      lastPhotoRefresh = Date.now();
                      refreshPhotos();
                    }
                    return send(r.status, "text/plain", "not found");
                  }
                  res.writeHead(200, { "Content-Type": r.headers.get("content-type") || "image/jpeg", "Cache-Control": "max-age=86400" });
                  res.end(Buffer.from(await r.arrayBuffer()));
                })
                .catch(() => send(502, "text/plain", "backend unreachable"));
            }
            if (req.method === "GET" && url === "/api/state") {
              return send(200, "application/json", JSON.stringify(snapshot()));
            }
            if (req.method === "POST" && url === "/api/cmd") {
              const { command } = JSON.parse(body || "{}");
              return send(200, "application/json", JSON.stringify({ output: execute(command || "") }));
            }
            if (req.method === "POST" && url === "/") {
              return send(200, "text/plain; charset=utf-8", execute(body) + "\n");
            }
            if (req.method === "GET" && url === "/status") {
              return send(200, "text/plain; charset=utf-8", statusText() + "\n");
            }
            send(404, "text/plain", "not found");
          } catch (err) {
            send(400, "application/json", JSON.stringify({ error: err.message }));
          }
        });
      })
      .listen(controlPort, process.env.CONTROL_HOST || "127.0.0.1", () =>
        log(`Control panel on http://${process.env.CONTROL_HOST || "127.0.0.1"}:${controlPort}`)
      );
  }

  const shutdown = async () => {
    clearInterval(timer);
    log("Stopping…");
    console.log(statusText());
    if (control) control.close();
    await link.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (!process.stdin.isTTY) {
    // running under pm2 / nohup: periodic status in the log instead of a prompt
    setInterval(() => console.log(statusText()), 5 * 60 * 1000).unref();
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "sim> " });
  console.log(`Type "help" for commands, "quit" to stop.`);
  rl.prompt();
  rl.on("line", (line) => {
    if (/^(quit|exit)$/i.test(line.trim())) return rl.close();
    const out = execute(line);
    if (out) console.log(out);
    rl.prompt();
  });
  rl.on("close", shutdown);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
