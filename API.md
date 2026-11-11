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

---

## 4. Geofencing & Alerts

All endpoints require `Authorization: Bearer <token>` and only ever return the caller's own data.

### How it works
1. A geofence is a polygon (`[{lat, lon}, ...]`, ≥ 3 points) plus the `cattleIds` it applies to. A fence with no `cattleIds` monitors nothing.
2. Each collar reading (MQTT or `POST /api/admin/devices/:id/telemetry`) is checked against the fences of the cattle wearing that collar.
3. A status change must hold for `GEOFENCE_CONFIRM_READINGS` (default 2) consecutive readings before an alert fires, so single-point GPS jitter is ignored. A first reading inside a fence is silent; a first confirmed reading outside raises an exit alert.
4. Readings with `gps.valid === false` or `0,0` coordinates are ignored for geofencing.
5. A collar can be linked to only one cattle (`409` otherwise).

### Alert types
| type | severity | when |
| :--- | :--- | :--- |
| `geofence_exit` | critical | cattle confirmed outside a fence |
| `geofence_enter` | info | cattle confirmed back inside |
| `low_battery` | warning | battery ≤ `LOW_BATTERY_PERCENT` (default 20). Re-arms after rising 5% above it |
| `device_offline` | warning | no data for `OFFLINE_AFTER_MINUTES` (default 60), checked every minute |
| `device_online` | info | first reading after an offline alert |

Alert object:
```json
{
  "alertId": "665f...", "userId": "12345", "cattleId": "C1", "cattleName": "Bessie",
  "deviceId": "DEV1", "type": "geofence_exit", "severity": "critical",
  "title": "Bessie left Pasture", "message": "Bessie was detected outside the geofence \"Pasture\".",
  "fenceId": "665e...", "fenceName": "Pasture", "location": { "lat": 6.95, "lon": 79.865 },
  "read": false, "createdAt": "2026-11-12T10:00:00.000Z"
}
```

### Geofence endpoints
| Method | Path | Notes |
| :--- | :--- | :--- |
| GET | `/api/geofences` | List my fences |
| GET | `/api/geofences/status` | Per fence: each assigned cattle's `status` (`inside`/`outside`/`unknown`), `lastLocation`, `insideCount`, `outsideCount` |
| GET | `/api/geofences/:fenceId` | One fence |
| POST | `/api/geofences` | `{ name, enabled, polygon, cattleIds }`. `400` for an invalid polygon or cattle you don't own |
| PUT | `/api/geofences/:fenceId` | Partial update. Changing `polygon` resets inside/outside status |
| DELETE | `/api/geofences/:fenceId` | |

### Alert endpoints
| Method | Path | Notes |
| :--- | :--- | :--- |
| GET | `/api/alerts` | Query: `unread=true`, `type=geofence_exit,low_battery`, `cattleId`, `deviceId`, `limit` (≤200, default 50), `before=<ISO>`. Returns `{ alerts, nextBefore }`. Pass `nextBefore` back as `before` for the next page |
| GET | `/api/alerts/unread-count` | `{ count }` for a badge |
| PATCH | `/api/alerts/:alertId/read` | Mark one read |
| POST | `/api/alerts/read-all` | `{ updated }` |
| DELETE | `/api/alerts/:alertId` | |
| GET | `/api/alerts/stream?token=<jwt>` | Server-Sent Events. Live `alert` events for the caller only |
| GET | `/api/admin/alerts` | Admin only. Same filters plus `userId` |

Live alerts in the browser:
```js
const es = new EventSource(`${API_URL}/api/alerts/stream?token=${token}`);
es.addEventListener("alert", (e) => showToast(JSON.parse(e.data)));
```

### Webhook (SMS / Telegram / WhatsApp / email bridge)
If `ALERT_WEBHOOK_URL` is set, every alert is POSTed there as JSON (5s timeout, failures are logged and never block ingestion). If `ALERT_WEBHOOK_SECRET` is set, it is sent in the `X-MooMap-Secret` header.

---

## 5. Farm home location & cattle photos

### Home location (user profile)
`PUT /api/users/me` accepts `homeLocation`:
```json
{ "homeLocation": { "lat": 7.2701, "lon": 80.6012, "name": "Main farm" } }
```
Send `"homeLocation": null` to clear it. `GET /api/users/me` returns it. The portal uses it as the start view for its maps. The simulator's `npm run setup -- --fresh` builds the simulated pasture around it.

### Cattle photos
| Method | Path | Notes |
| :--- | :--- | :--- |
| POST | `/api/cattles/:id/image` | `{ "image": "data:image/jpeg;base64,…", "credit"?: "...", "sourceUrl"?: "https://…" }`. JPEG/PNG/WebP up to 5 MB, type checked from the file bytes. Replaces and deletes the previous photo. Owner only (404 otherwise). |
| DELETE | `/api/cattles/:id/image` | Remove the photo |
| GET | `/media/cattle/<random>.jpg` | The stored file (public, unguessable name, cached 30 days) |

Cattle and `/api/me/overview` items include `Image` (a `/media/...` path), `imageCredit` and `imageSourceUrl`.
Files are stored in `uploads/` (or `MEDIA_DIR`), which is not in git, so back it up with the server.
