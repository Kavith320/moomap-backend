// MQTT uplink shared by all master collars.
const mqtt = require("mqtt");

function connectMqtt(cfg, log = console.log) {
  const client = mqtt.connect(cfg.mqtt.url, {
    username: cfg.mqtt.username || undefined,
    password: cfg.mqtt.password || undefined,
    clientId: `moomap-sim-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  });

  let warned = false;
  client.on("connect", () => {
    warned = false;
    log(`✔ MQTT connected: ${cfg.mqtt.url}`);
  });
  client.on("error", (err) => {
    if (!warned) {
      log(`✖ MQTT error: ${err.message}`);
      if (/not authori[sz]ed|bad user ?name or password/i.test(err.message)) {
        log(
          `  → The broker rejected user "${cfg.mqtt.username || "(none)"}"` +
            `${cfg.mqtt.password ? "" : " with an EMPTY password"}. Check MQTT_USERNAME / MQTT_PASSWORD in simulator/.env.`
        );
      }
    }
    warned = true;
  });
  client.on("offline", () => log("… MQTT offline, retrying"));

  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`MQTT connect timeout (${cfg.mqtt.url})`)), 15000);
    client.once("connect", () => {
      clearTimeout(t);
      resolve();
    });
  });

  // returns true when the broker acknowledged (QoS 1)
  function publish(deviceId, payload) {
    if (!client.connected) return Promise.resolve(false);
    const topic = `${cfg.mqtt.topicPrefix}/${deviceId}/payload`;
    return new Promise((resolve) => {
      client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => resolve(!err));
    });
  }

  return { client, ready, publish, close: () => new Promise((r) => client.end(false, {}, r)) };
}

module.exports = { connectMqtt };
