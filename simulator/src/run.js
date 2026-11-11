#!/usr/bin/env node
// Runs the simulated herd and its collar network.
//
//   npm start                         interactive (type `help`)
//   npm start -- --scenario=demo      scripted test, see SCENARIOS below
//   TIME_SCALE=20 npm start           cows move 20x faster than real time
const fs = require("fs");
const readline = require("readline");
const http = require("http");
const cfg = require("./config");
const { createRandom } = require("./random");
const { Cow, Herd } = require("./herd");
const { Network, radioSummary } = require("./network");
const { connectMqtt } = require("./mqttLink");

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

function loadState() {
  if (!fs.existsSync(cfg.stateFile)) {
    console.error("✖ herd.json not found. Run `npm run setup` first.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(cfg.stateFile, "utf8"));
}

async function main() {
  const state = loadState();
  const rnd = createRandom(cfg.seed + 1);
  const cows = state.cows.map((c) => new Cow({ ...c, x: c.home.x, y: c.home.y }, rnd));
  const herd = new Herd(cows, state.pasture);
  const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

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

  // scenario timeline
  const scenarioName = arg("scenario") || process.env.SCENARIO || "calm";
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) {
    log(`✖ Unknown scenario "${scenarioName}". Options: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(1);
  }
  const startedAt = Date.now();
  const scenarioSpeed = Math.max(0.01, Number(process.env.SCENARIO_SPEED) || 1); // >1 runs the timeline faster
  const pending = [...scenario];
  log(`▶ Scenario: ${scenarioName}${pending.length ? ` (${pending.length} step${pending.length > 1 ? "s" : ""})` : ""}`);

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
        cfg.timing.timeScale = Math.max(0.1, Number(a) || 1);
        return `time scale ${cfg.timing.timeScale}x`;
      default:
        return `Unknown command "${cmd}". Try: help`;
    }
  };

  // Control port (localhost only) so a background run (pm2) can still be driven:
  //   npm run cmd -- wander Sudu
  let control = null;
  const controlPort = Number(process.env.CONTROL_PORT || 0);
  if (controlPort) {
    control = http
      .createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
          const out = req.method === "POST" ? execute(body) : statusText();
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(out + "\n");
        });
      })
      .listen(controlPort, "127.0.0.1", () => log(`Control port on 127.0.0.1:${controlPort}`));
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
