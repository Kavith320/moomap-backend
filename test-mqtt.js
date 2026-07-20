// test-mqtt.js
require("dotenv").config();
const mqtt = require("mqtt");

const mqttUrl = process.env.MQTT_URL || "mqtt://localhost:1883";
const options = {
  clientId: "moomap-test-client-" + Math.random().toString(16).slice(2, 10),
  clean: true,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
};

console.log("🔌 Connecting to MQTT broker:", mqttUrl);
console.log("👤 Using Username:", options.username || "None");

const client = mqtt.connect(mqttUrl, options);

client.on("connect", () => {
  console.log("✔️ Successfully connected to MQTT Broker!");

  const topic = "cc/TEST_DEVICE_123/payload";
  const payload = JSON.stringify({
    type: "master",
    device_id: "TEST_DEVICE_123",
    gps: {
      valid: true,
      lat: 6.9271,
      lon: 79.8612,
    },
    battery: {
      percent: 99,
      voltage: 4.19,
    },
  });

  console.log(`📡 Subscribing to topic: ${topic}`);
  client.subscribe(topic, (err) => {
    if (err) {
      console.error("❌ Subscription failed:", err);
      process.exit(1);
    }
    console.log("✔️ Subscribed!");

    console.log(`📤 Publishing test payload to: ${topic}`);
    console.log("   Payload:", payload);
    client.publish(topic, payload);
  });
});

client.on("message", (topic, message) => {
  console.log("\n📩 Message Received!");
  console.log("👉 Topic:", topic);
  console.log("👉 Payload:", message.toString());
  
  console.log("\n🎉 Broker test succeeded! Closing connection...");
  client.end();
  process.exit(0);
});

client.on("error", (err) => {
  console.error("❌ MQTT Client Error:", err);
  process.exit(1);
});

// Timeout after 10 seconds if no message received
setTimeout(() => {
  console.log("⏱️ Test timed out after 10 seconds. Check if broker is running.");
  client.end();
  process.exit(1);
}, 10000);
