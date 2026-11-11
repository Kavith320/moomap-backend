# MooMap herd simulator

A separate program that fakes a farm so the whole MooMap system can be tested without
real cattle. It creates one farmer, a herd with collars and a geofence. Then it moves the
cows around and sends their collar data over MQTT, the same way real collars do.

```
 cow ─ slave collar ──LoRa──► master collar ──MQTT──► local Mosquitto ──► backend ──► portal / alerts
                                (uplink)               ▲
                                                       └── bridge ◄── external broker (real collars)
```

## What it simulates

| Part | Model |
| :--- | :--- |
| **Cows** | Graze, walk and rest. Stay near the herd and turn back at the fence. Scenarios can force a cow out or send it home. |
| **GPS** | ±3 m noise, and about 2% of fixes are invalid (`valid:false`, 0,0). |
| **Battery** | Drains a little on every transmission. Voltage follows the percentage (3.3–4.2 V). |
| **LoRa (slave → master)** | Log-distance path loss with body loss and shadowing. Each spreading factor has its own sensitivity and SNR limit, plus random interference loss. If no master hears a packet, it is lost. When several masters hear it, the strongest one relays it. Time on air and duty cycle are checked. |
| **Master collar** | Has the uplink. Publishes its own position as `type:"master"` and relays every slave frame it receives as `type:"slave"`, with `lora:{via,rssi,snr,sf,bw,freq,distance_m}`. |

**Photos:** setup gives every cow a random real photo of cattle in Sri Lanka from Wikimedia Commons
(Category: Cattle in Sri Lanka, 14 hand-picked photos in `src/photos.js`). The photographer and licence are stored and
shown with each photo, as the Creative Commons licences require. Pass `--no-photos` to skip this.

Messages use the format the backend already reads, on topic `cc/<collarId>/payload`.
Set `RELAY_TOPIC=master` to publish relayed slave frames on the master's topic instead.
Every message has `"sim": true`, so simulated data is easy to tell apart from real data.

## Use

```bash
cd simulator
npm install
cp .env.example .env        # set MQTT_PASSWORD (the "simulator" broker user)
npm run setup               # farmer + cattle + collars + geofence + photos; writes herd.json
npm run setup -- --fresh    # new layout (pasture around the farmer's home location if set in the portal)
npm run setup -- --photos   # pick new random photos for every cow
npm start                   # interactive; type "help"
npm start -- --scenario=demo
npm run teardown            # remove the sim farmer, cattle and geofence
```

`npm run setup` prints the portal login for the simulated farmer (default `0700000001` / `simfarmer123`).

### Control panel (web)

With `CONTROL_PORT` set, the simulator serves a control panel at `http://127.0.0.1:<CONTROL_PORT>/`:
- a live map of the pasture, every cow and the master collar, with LoRa links drawn from each slave to the master (coloured by signal; red dashed = packet lost)
- **drag a cow on the map** to move it, inside or outside the fence
- **🎯 Move herd**: click a spot on the map and the whole herd goes there. **Walk** drives them over (crossing the fence raises breakout alerts). **Teleport** puts them there at once. Outside the fence they graze around the 🚩 until **All home**; inside it they go back to normal grazing
- one card per cow: fence status, signal (RSSI/SNR/via), battery slider, delivered/sent, and buttons for Break out / Go home, Collar off/on and Send now
- toolbar: master uplink switch (gateway outage), speed (1×–60×), send all now, all home, run a scenario
- packet statistics and an event log

On the server it is published **only inside the tailnet** (never through Funnel):
`tailscale serve --bg --https=7443 http://127.0.0.1:7070` → `https://moomap-localserver.taile78ad3.ts.net:7443`.
Anyone who can open the panel can fake breakouts, so keep it off the public internet.

### Commands (interactive, or `npm run cmd -- <command>` while running in the background)

| Command | What you should see in the portal |
| :--- | :--- |
| `status` | Table of every cow: activity, fence distance, battery, LoRa signal, delivered/sent |
| `wander <cow>` | The cow walks out through the fence, then a **geofence_exit** alert |
| `home <cow\|all>` | It walks back, then a **geofence_enter** alert |
| `battery <cow> <pct>` | At 20% or below, a **low_battery** alert |
| `off <cow>` / `on <cow>` | The collar goes silent, then a **device_offline** alert after `OFFLINE_AFTER_MINUTES` (backend, default 60) |
| `master down` / `master up` | The uplink fails and every slave goes silent too, like a real gateway outage |
| `speed <x>` | Cow movement time scale |
| `tx <cow\|all>` | Transmit now instead of waiting for the interval |
| `move <cow> <lat> <lon>` | Drop a cow at a position (what dragging on the map does) |
| `herd <lat> <lon> [walk\|teleport]` | Take the whole herd to a location (`home all` brings it back) |
| `scenario <name>` | Start a scenario while running |

### Scenarios (`--scenario=` or `SCENARIO=`)

| Name | Timeline (seconds after start) |
| :--- | :--- |
| `calm` | Normal grazing (the default) |
| `breakout` | 60 s: a cow leaves the fence. 600 s: it is sent home |
| `battery` | 30 s: a collar drops to 18% |
| `gateway` | 60 s: the master goes down for `GATEWAY_DOWN_S` (3900 s) |
| `demo` | 45 s: a breakout. 90 s: low battery. 480 s: the cow returns |

Set `SCENARIO_SPEED=10` to run the timeline 10 times faster. Set `TIME_SCALE=20` to make the cows move faster.

### Running on the server (background)

```bash
cd ~/moomap-backend/simulator
pm2 start src/run.js --name moomap-simulator -- --scenario=calm
pm2 save
npm run cmd -- wander Sudu     # drive it (needs CONTROL_PORT in .env)
pm2 logs moomap-simulator
```

## Settings

Everything is in `.env` (see `.env.example`): herd size and number of masters, pasture
centre and size, reporting intervals, GPS noise, battery drain, and LoRa radio parameters
(frequency, SF, bandwidth, TX power, path-loss exponent, body loss, shadowing, random loss, duty cycle).

With the defaults (SF9 / 125 kHz / 14 dBm / 868 MHz), the time on air is about 185 ms, the range is about 1.3 km, and the 1% duty cycle needs at least 19 s between packets.
