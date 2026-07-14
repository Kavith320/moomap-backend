# 🐄 MooMap IoT Backend

Backend service for the MooMap livestock tracking system.  
This service receives MQTT messages from collars, stores raw telemetry per device, and exposes APIs for device metadata and history.

---

## 🚀 Features

- MQTT listener (`cc/<device_id>/payload`)
- Per-device MongoDB collections (`dev_<device_id>`)
- Raw telemetry stored exactly as received (no modification)
- Device metadata tracking (`devices` collection)
- MongoDB + Mongoose integration
- Express-based API server
- Environment-configurable (.env)
- PM2-ready for production

---

## 📂 Folder Structure

moomap-iot-backend/
│
├── src/
│ ├── config/
│ │ └── database.js # MongoDB connection
│ ├── models/
│ │ └── Device.js # Device metadata model
│ ├── mqtt/
│ │ └── mqttClient.js # MQTT subscriber + handler
│ ├── index.js # Express server + MQTT init
│
├── .gitignore
├── README.md
├── package.json
└── package-lock.json

## 📦 Required Packages

Installed automatically via `npm install`.

### Dependencies

express
mongoose
mqtt
dotenv
