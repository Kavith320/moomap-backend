# 🐄 MooMap Admin Dashboard (Next.js Frontend)

This is the decoupled, standalone frontend application for the **MooMap Livestock Tracking System**, rebuilt using **Next.js (App Router)** and styled according to the official brand guidelines.

---

## 🎨 Visual Identity & Brand Theme

The interface strictly adopts the official MooMap UI color palette:
*   **Primary Orange (`#ff8c00`)**: Used for primary action buttons, highlights, active menu icons, and dashboard elements.
*   **Deep Charcoal (`#2F2F2F`)**: Used for main text, headings, and the sidebar background to provide a premium structural contrast.
*   **Orange Light (`#FFB14A`)**: Used for hover states and secondary active indicators.
*   **Orange Soft Background (`#FFF1DD`)**: Used for alert highlights and subtle card backgrounds.
*   **Orange Dark (`#D86F00`)**: Used for strong accents, progress indicators, and pressed states.
*   **Light Gray Background (`#F5F5F5`)**: Used as the main application page background.
*   **Border Gray (`#E2E2E2`)**: Used for tables, separators, and card boundaries.
*   **Brand Logo (`/logo.png`)**: Located in the `public/` directory and rendered as the unified vector asset in the sidebar and login header.

---

## 📂 Project Structure

```
frontend/
├── public/
│   ├── logo.png               # Official brand logo image asset
│   └── (next assets...)
│
├── src/
│   └── app/
│       ├── globals.css        # Branding variables, themes, and layouts
│       ├── layout.js          # Google Fonts Outfit loader and HTML skeleton
│       │
│       ├── login/
│       │   └── page.js        # React Admin login page component
│       │
│       └── page.js            # React Main Dashboard SPA component
│
├── package.json               # Development port configured to 3001
└── next.config.mjs
```

---

## ⚙️ App Pages & Logic

### 1. Admin Login (`/login`)
- **Location**: `src/app/login/page.js`
- **Functionality**:
  - Validates login credentials against the backend API `/api/users/login`.
  - Verifies that the user role is `admin` by executing a test call to the admin stats API. Standard users are denied access.
  - Stores the JWT token and user profile in `localStorage`.
  - Automatically redirects authenticated admins to the dashboard.

### 2. Main Dashboard Panel (`/`)
- **Location**: `src/app/page.js`
- **Sub-pages (SPA Tabs)**:
  - **Overview**: Renders aggregated count stats (total users, cattle, geofences, collars), average battery indicators, a line chart of ingested telemetry (last 7 days), a doughnut chart of cattle breeds, and a pie chart of collar types (uses **Chart.js**).
  - **Users Tab**: Lists all accounts in a paginated grid with full-text search. Admins can create new accounts, edit profiles, toggle roles (`user`/`admin`), and delete users.
  - **Cattle Tab**: Lists livestock registry records populated with owner names. Admins can create cattle, link collar hardware, edit details, and delete records.
  - **Collars Tab**: Lists registered tracking devices, notes, and connection statuses. Includes a telemetry injector to simulate live GPS/battery updates.
  - **Geofences Tab**: Lists all user-configured geofences, boundaries, and assigned cattle.
  - **Telemetry Tab**: Contains two sub-tabs: (1) **Telemetry History** (lists paginated historical logs with search filters and a raw JSON viewer), and (2) **Live MQTT Stream** (a real-time, terminal-themed scrolling log of all incoming MQTT traffic broadcast via a backend SSE connection).

---

## 🔌 API Integration Interface

The frontend makes requests to the following REST API endpoints on the backend (`http://localhost:3000`):

| Endpoint | Method | Role Required | Description |
| :--- | :---: | :---: | :--- |
| `/api/users/login` | `POST` | Public | Standard authentication |
| `/api/admin/stats` | `GET` | Admin | Aggregated counts, charts, and connection health |
| `/api/admin/users` | `GET` / `POST` | Admin | Search/create users list |
| `/api/admin/users/:id` | `PUT` / `DELETE` | Admin | Update/delete user and cascade cleanup |
| `/api/admin/cattles` | `GET` / `POST` | Admin | Search/create cattle records |
| `/api/admin/cattles/:id` | `PUT` / `DELETE` | Admin | Update/delete cattle record |
| `/api/admin/devices` | `GET` / `POST` | Admin | Search/register IoT collars |
| `/api/admin/devices/:id` | `PUT` / `DELETE` | Admin | Update notes / delete collar |
| `/api/admin/devices/:id/telemetry` | `POST` | Admin | Simulate MQTT telemetry package |
| `/api/admin/geofences` | `GET` | Admin | View geofences across all users |
| `/api/admin/telemetries` | `GET` | Admin | Log list of raw telemetry packets |

---

## 🚀 Running Locally

1. Install dependencies from the `frontend/` directory:
   ```bash
   npm install
   ```

2. Start the development server (configured to start on **port 3001**):
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to:
   [http://localhost:3001/login](http://localhost:3001/login)
