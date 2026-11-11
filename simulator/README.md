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

Messages use the format the backend already reads, on topic `cc/<collarId>/payload`.
Set `RELAY_TOPIC=master` to publish relayed slave frames on the master's topic instead.
Every message has `"sim": true`, so simulated data is easy to tell apart from real data.

## Use

```bash
cd simulator
npm install
cp .env.example .env        # set MQTT_PASSWORD (the "simulator" broker user)
npm run setup               # farmer + cattle + collars + geofence; writes herd.json
npm start                   # interactive; type "help"
npm start -- --scenario=demo
npm run teardown            # remove the sim farmer, cattle and geofence
```

`npm run setup` prints the portal login for the simulated farmer (default `0700000001` / `simfarmer123`).

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
