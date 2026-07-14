# 🐄 MooMap IoT Backend API Documentation

This service acts primarily as an **IoT ingestion receiver** over **MQTT** and hosts a minimal **HTTP Server** for health checking.

---

## 1. HTTP API

### **GET `/health`**
Verifies that the backend server is running and connected to MongoDB and MQTT.

*   **URL:** `/health`
*   **Method:** `GET`
*   **Headers:** `Content-Type: application/json`
*   **Response (200 OK):**
    ```json
    {
      "status": "ok",
      "message": "MooMap IoT backend is running 🐄",
      "time": "2026-07-14T23:35:46.000Z"
    }
    ```

---

## 2. MQTT Broker Interface (Data Ingestion)

The service connects to the MQTT broker and subscribes to a telemetry topic to ingest messages sent by tracking collars/devices.

*   **Subscribed Topic:** `cc/+/payload` (configured via `MQTT_TOPIC` environment variable; the wildcard `+` represents the device ID).
*   **Protocol:** MQTT

### **Expected MQTT Payload JSON Format**
The backend accepts raw JSON, stringified JSON, or double-encoded JSON payloads. It parses the following fields:

```json
{
  "device_id": "7454927D7850",
  "type": "slave",
  "gps": {
    "lat": 6.9271,
    "lon": 79.8612,
    "valid": true
  },
  "battery": {
    "percent": 87,
    "voltage": 4.12
  }
}
```

#### **Field Details:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `device_id` / `chipId` / `deviceId` | String | *Optional.* Unique identifier of the tracking collar. If omitted, the backend extracts the device ID from the MQTT topic (e.g. `cc/7454927D7850/payload` -> `7454927D7850`). |
| `type` / `device_type` | String | *Optional.* The operational type of the device (e.g., `"master"`, `"slave"`, `"status"`). |
| `gps.lat` | Number | *Optional.* Latitude coordinate. |
| `gps.lon` | Number | *Optional.* Longitude coordinate. |
| `gps.valid` | Boolean | *Optional.* Indicates whether the GPS fix is valid. |
| `battery.percent` | Number | *Optional.* Battery level percentage (0 to 100). |
| `battery.voltage` | Number | *Optional.* Battery voltage level. |

---

## 3. Database Persistence Behavior

When an MQTT message is received and successfully parsed, the service triggers two operations in MongoDB:

### **A. Historical Telemetry Record (`Telemetry` Collection)**
Saves the parsed metrics and raw payload for historical analysis.
*   **Collection name:** `telemetries` (mapped from `Telemetry` model)
*   **Fields:**
    *   `deviceId` (String, indexed) - Unique ID of the device.
    *   `timestamp` (Date, indexed) - Timestamp when the data was saved.
    *   `topic` (String) - Original MQTT topic.
    *   `gpsLat` (Number, optional) - Latitude.
    *   `gpsLon` (Number, optional) - Longitude.
    *   `gpsValid` (Boolean, optional) - GPS status validity.
    *   `batteryPercent` (Number, optional) - Battery capacity.
    *   `batteryVoltage` (Number, optional) - Battery voltage.
    *   `raw` (Object) - The complete raw JSON payload exactly as received.

### **B. Device Snapshot Update (`Device` Collection)**
Updates the latest state snapshot of the device for efficient status checks.
*   **Collection name:** `devices` (mapped from `Device` model)
*   **Fields:**
    *   `_id` (String) - Unique device ID (Primary Key).
    *   `type` (String) - Latest device type (e.g., `"slave"`).
    *   `group` (String) - MQTT prefix group (e.g., `"cc"`).
    *   `lastSeen` (Date) - Most recent message timestamp.
    *   `lastLocation` (Object: `{ lat, lon, timestamp }`) - Last recorded valid location coordinates.
    *   `lastBatteryPercent` (Number) - Last battery percentage.
    *   `lastBatteryVoltage` (Number) - Last battery voltage.
    *   `meta` (Object) - The full last payload received.
    *   `notes` (String) - Optional administrator/user notes.
