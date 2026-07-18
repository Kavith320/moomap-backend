"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Chart from "chart.js/auto";
import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  Radio, 
  Map, 
  FileJson,
  Pencil,
  Trash2,
  Zap,
  LogOut,
  MapPin
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [adminUser, setAdminUser] = useState(null);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState("dashboard");

  // Health/Status States
  const [dbStatus, setDbStatus] = useState("Loading...");
  const [mqttStatus, setMqttStatus] = useState("Loading...");

  // Data States
  const [stats, setStats] = useState(null);
  const [usersData, setUsersData] = useState({ users: [], page: 1, totalPages: 1 });
  const [cattlesData, setCattlesData] = useState({ cattles: [], page: 1, totalPages: 1 });
  const [devicesData, setDevicesData] = useState({ devices: [], page: 1, totalPages: 1 });
  const [geofences, setGeofences] = useState([]);
  const [telemetriesData, setTelemetriesData] = useState({ telemetries: [], page: 1, totalPages: 1 });

  // Telemetry Sub-Tab States
  const [telemetrySubTab, setTelemetrySubTab] = useState("history"); // "history" or "live"
  const [liveMqttLogs, setLiveMqttLogs] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef(null);

  // Real-time Map States
  const [mapMarkers, setMapMarkers] = useState([]);
  const [filterRole, setFilterRole] = useState("all");
  const [filterCollar, setFilterCollar] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);

  // Search States
  const [userSearch, setUserSearch] = useState("");
  const [cattleSearch, setCattleSearch] = useState("");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [telemetrySearch, setTelemetrySearch] = useState("");

  // Modal States
  const [userModal, setUserModal] = useState({ active: false, mode: "create", data: null });
  const [cattleModal, setCattleModal] = useState({ active: false, mode: "create", data: null });
  const [deviceModal, setDeviceModal] = useState({ active: false, mode: "create", data: null });
  const [simulateModal, setSimulateModal] = useState({ active: false, deviceId: "" });
  const [jsonModal, setJsonModal] = useState({ active: false, data: null });

  // Form Field States
  const [userForm, setUserForm] = useState({
    firstName: "", lastName: "", mobile: "", nicNo: "", gender: "", role: "user", address: "", password: ""
  });
  const [cattleForm, setCattleForm] = useState({
    cattleId: "", name: "", breed: "", age: "", gender: "", weight: "", color: "", farmName: "", address: "", Image: "", userId: "", collarId: "", healthNotes: ""
  });
  const [deviceForm, setDeviceForm] = useState({
    deviceId: "", group: "cc", type: "slave", notes: ""
  });
  const [simulateForm, setSimulateForm] = useState({
    lat: 6.9271, lon: 79.8612, batteryPercent: 85, batteryVoltage: 4.1
  });

  // Chart Ref References
  const telemetryChartRef = useRef(null);
  const breedChartRef = useRef(null);
  const deviceTypeChartRef = useRef(null);
  
  const telemetryChartInstance = useRef(null);
  const breedChartInstance = useRef(null);
  const deviceTypeChartInstance = useRef(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  // Auth Guard & Initial Load
  useEffect(() => {
    const savedToken = localStorage.getItem("adminToken");
    const savedUser = localStorage.getItem("adminUser");

    if (!savedToken) {
      router.push("/login");
    } else {
      setToken(savedToken);
      if (savedUser) setAdminUser(JSON.parse(savedUser));
    }
  }, [router]);

  // Load health and tab contents when token is ready
  useEffect(() => {
    if (!token) return;
    loadHealth();
    loadTabContent(activeTab);
  }, [token, activeTab]);

  // Handle Chart updates when statistics load
  useEffect(() => {
    if (activeTab === "dashboard" && stats) {
      renderCharts();
    }
    // Cleanup charts on unmount/re-render
    return () => {
      destroyCharts();
    };
  }, [stats, activeTab]);

  // Handle SSE Real-time MQTT stream connection (handles both Telemetry Tab & Real-Time Map updates)
  useEffect(() => {
    const isLiveTelemetry = activeTab === "telemetries" && telemetrySubTab === "live";
    const isMapView = activeTab === "map";

    if (token && (isLiveTelemetry || isMapView)) {
      setIsStreaming(true);
      const url = `${API_URL}/api/admin/mqtt-stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const log = JSON.parse(event.data);
          
          // 1. Telemetry log stream
          if (isLiveTelemetry) {
            setLiveMqttLogs((prev) => [log, ...prev].slice(0, 100));
          }
          
          // 2. Map coordinates update
          if (log.parsed && log.parsed.gps && typeof log.parsed.gps.lat === "number") {
            const gps = log.parsed.gps;
            const battery = log.parsed.battery || {};
            
            setMapMarkers((prev) => {
              return prev.map(m => {
                if (m.collarId === log.deviceId) {
                  return {
                    ...m,
                    location: {
                      lat: gps.lat,
                      lon: gps.lon,
                      timestamp: new Date()
                    },
                    batteryPercent: typeof battery.percent === "number" ? battery.percent : m.batteryPercent,
                    batteryVoltage: typeof battery.voltage === "number" ? battery.voltage : m.batteryVoltage,
                    lastSeen: new Date()
                  };
                }
                return m;
              });
            });
          }
        } catch (e) {
          console.error("Error parsing incoming live MQTT data:", e);
        }
      };

      es.onerror = (err) => {
        console.error("SSE connection error:", err);
        setIsStreaming(false);
      };

      return () => {
        if (es) {
          es.close();
        }
        setIsStreaming(false);
      };
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsStreaming(false);
    }
  }, [token, activeTab, telemetrySubTab]);

  // Leaflet Map Initializer
  useEffect(() => {
    if (activeTab === "map" && typeof window !== "undefined" && window.L) {
      const L = window.L;

      if (!mapInstanceRef.current) {
        // Center on Sri Lanka [7.8731, 80.7718]
        const map = L.map("cattle-map").setView([7.8731, 80.7718], 8);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
        }).addTo(map);

        mapInstanceRef.current = map;
        markersGroupRef.current = L.layerGroup().addTo(map);
      }

      loadMapMarkers();

      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          markersGroupRef.current = null;
        }
      };
    }
  }, [activeTab]);

  // Leaflet Map Plotter & Filter Handler
  useEffect(() => {
    if (mapInstanceRef.current && markersGroupRef.current && typeof window !== "undefined" && window.L) {
      const L = window.L;
      const markersGroup = markersGroupRef.current;
      markersGroup.clearLayers();

      // Filter markers list
      const filtered = mapMarkers.filter(m => {
        if (filterRole !== "all" && m.type.toLowerCase() !== filterRole.toLowerCase()) {
          return false;
        }
        if (filterCollar && !m.collarId.toLowerCase().includes(filterCollar.toLowerCase())) {
          return false;
        }
        if (filterOwner) {
          const ownerMatch = m.owner && m.owner.name.toLowerCase().includes(filterOwner.toLowerCase());
          const userIdMatch = m.owner && m.owner.userId.toLowerCase().includes(filterOwner.toLowerCase());
          if (!ownerMatch && !userIdMatch) return false;
        }
        return true;
      });

      // Add markers to map layer
      filtered.forEach(m => {
        if (!m.location || typeof m.location.lat !== "number" || typeof m.location.lon !== "number") {
          return;
        }

        const markerColor = m.type.toLowerCase() === "master" ? "var(--secondary, #d86f00)" : "var(--primary, #ff8c00)";
        
        const markerIcon = L.divIcon({
          className: "custom-map-marker",
          html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.4); relative">
                   <div style="position: absolute; width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid ${markerColor}; top: -10px; left: -10px; animation: mapPulse 1.8s infinite ease-in-out; opacity: 0.7;"></div>
                 </div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        const popupContent = `
          <div style="font-family: 'Outfit', sans-serif; color: #2f2f2f; min-width: 180px;">
            <h4 style="margin: 0 0 6px 0; font-size: 0.95rem; font-weight: 700; color: #ff8c00;">🐄 ${m.name || 'Cattle'}</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
              <tr><td style="color: #6b6b6b; padding: 2px 0;">Breed:</td><td style="font-weight: 600;">${m.breed || 'Unknown'}</td></tr>
              <tr><td style="color: #6b6b6b; padding: 2px 0;">Collar ID:</td><td style="font-weight: 600; font-family: monospace;">${m.collarId}</td></tr>
              <tr><td style="color: #6b6b6b; padding: 2px 0;">Role:</td><td><span style="display: inline-block; padding: 1px 6px; border-radius: 4px; background-color: ${m.type.toLowerCase() === 'master' ? 'rgba(216,111,0,0.1)' : 'rgba(255,140,0,0.1)'}; color: ${m.type.toLowerCase() === 'master' ? '#d86f00' : '#ff8c00'}; font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">${m.type}</span></td></tr>
              <tr><td style="color: #6b6b6b; padding: 2px 0;">Owner:</td><td style="font-weight: 600;">${m.owner ? m.owner.name : 'Unassigned'}</td></tr>
              <tr><td style="color: #6b6b6b; padding: 2px 0;">Battery:</td><td style="font-weight: 600; color: ${m.batteryPercent < 20 ? '#e53935' : '#2ecc71'};">${m.batteryPercent !== null ? `${m.batteryPercent}%` : 'N/A'}</td></tr>
              <tr><td style="color: #6b6b6b; padding: 2px 0;">Last Seen:</td><td style="font-size: 0.75rem; color: #6b6b6b;">${m.lastSeen ? new Date(m.lastSeen).toLocaleTimeString() : 'N/A'}</td></tr>
            </table>
          </div>
        `;

        L.marker([m.location.lat, m.location.lon], { icon: markerIcon })
          .bindPopup(popupContent)
          .addTo(markersGroup);
      });
    }
  }, [mapMarkers, filterRole, filterCollar, filterOwner]);

  const destroyCharts = () => {
    if (telemetryChartInstance.current) {
      telemetryChartInstance.current.destroy();
      telemetryChartInstance.current = null;
    }
    if (breedChartInstance.current) {
      breedChartInstance.current.destroy();
      breedChartInstance.current = null;
    }
    if (deviceTypeChartInstance.current) {
      deviceTypeChartInstance.current.destroy();
      deviceTypeChartInstance.current = null;
    }
  };

  const renderCharts = () => {
    destroyCharts();

    // 1. Telemetry Chart
    if (telemetryChartRef.current && stats.recentTelemetryStats) {
      const labels = stats.recentTelemetryStats.length > 0 ? stats.recentTelemetryStats.map(s => s._id) : ["No data"];
      const values = stats.recentTelemetryStats.length > 0 ? stats.recentTelemetryStats.map(s => s.count) : [0];
      
      telemetryChartInstance.current = new Chart(telemetryChartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Ingested Telemetries',
            data: values,
            borderColor: '#00d2ff',
            backgroundColor: 'rgba(0, 210, 255, 0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8c9ba5' } },
            y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8c9ba5', precision: 0 } }
          }
        }
      });
    }

    // 2. Breed Chart
    if (breedChartRef.current && stats.breedBreakdown) {
      const labels = stats.breedBreakdown.length > 0 ? stats.breedBreakdown.map(s => s._id || "Unknown") : ["No data"];
      const values = stats.breedBreakdown.length > 0 ? stats.breedBreakdown.map(s => s.count) : [0];

      breedChartInstance.current = new Chart(breedChartRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ['#00d2ff', '#6c5ce7', '#00e676', '#ff9100', '#ff1744', '#f1c40f'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#8c9ba5', font: { family: 'Outfit' } } }
          }
        }
      });
    }

    // 3. Collar Type Chart
    if (deviceTypeChartRef.current && stats.deviceTypeBreakdown) {
      const labels = stats.deviceTypeBreakdown.length > 0 ? stats.deviceTypeBreakdown.map(s => s._id || "Unknown") : ["No data"];
      const values = stats.deviceTypeBreakdown.length > 0 ? stats.deviceTypeBreakdown.map(s => s.count) : [0];

      deviceTypeChartInstance.current = new Chart(deviceTypeChartRef.current, {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ['#00e676', '#ff9100', '#6c5ce7', '#00d2ff'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#8c9ba5', font: { family: 'Outfit' } } }
          }
        }
      });
    }
  };

  // Helper for requests
  const apiFetch = async (path, options = {}) => {
    const savedToken = token || localStorage.getItem("adminToken");
    const headers = {
      "Authorization": `Bearer ${savedToken}`,
      "Content-Type": "application/json",
      ...options.headers
    };

    try {
      const res = await fetch(`${API_URL}${path}`, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");
        router.push("/login");
        return null;
      }
      return res;
    } catch (e) {
      console.error("API error:", e);
      return null;
    }
  };

  const loadHealth = async () => {
    const res = await apiFetch("/api/admin/stats");
    if (!res) return;
    const data = await res.json();
    setDbStatus(data.health.database);
    setMqttStatus(data.health.mqtt);
  };

  const loadTabContent = (tabId) => {
    switch (tabId) {
      case "dashboard":
        loadDashboardStats();
        break;
      case "map":
        loadMapMarkers();
        break;
      case "users":
        loadUsers(1, userSearch);
        break;
      case "cattles":
        loadCattles(1, cattleSearch);
        break;
      case "devices":
        loadDevices(1, deviceSearch);
        break;
      case "geofences":
        loadGeofences();
        break;
      case "telemetries":
        loadTelemetries(1, telemetrySearch);
        break;
    }
  };

  const loadDashboardStats = async () => {
    const res = await apiFetch("/api/admin/stats");
    if (!res) return;
    const data = await res.json();
    setStats(data);
  };

  // ==================== MAP MARKERS API ====================
  const loadMapMarkers = async () => {
    const res = await apiFetch("/api/admin/map-markers");
    if (!res) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      setMapMarkers(data);
    } else {
      console.error("Map markers API did not return an array:", data);
      setMapMarkers([]);
    }
  };

  const locateOnMap = (lat, lon) => {
    if (mapInstanceRef.current && typeof lat === "number" && typeof lon === "number") {
      mapInstanceRef.current.setView([lat, lon], 14, { animate: true });
    }
  };

  // ==================== USERS API ====================
  const loadUsers = async (page = 1, search = "") => {
    const res = await apiFetch(`/api/admin/users?page=${page}&limit=8&search=${encodeURIComponent(search)}`);
    if (!res) return;
    const data = await res.json();
    setUsersData({
      users: data.users,
      page: data.page,
      totalPages: data.totalPages
    });
  };

  // ==================== CATTLE API ====================
  const loadCattles = async (page = 1, search = "") => {
    const res = await apiFetch(`/api/admin/cattles?page=${page}&limit=8&search=${encodeURIComponent(search)}`);
    if (!res) return;
    const data = await res.json();
    setCattlesData({
      cattles: data.cattles,
      page: data.page,
      totalPages: data.totalPages
    });
  };

  // ==================== DEVICES API ====================
  const loadDevices = async (page = 1, search = "") => {
    const res = await apiFetch(`/api/admin/devices?page=${page}&limit=8&search=${encodeURIComponent(search)}`);
    if (!res) return;
    const data = await res.json();
    setDevicesData({
      devices: data.devices,
      page: data.page,
      totalPages: data.totalPages
    });
  };

  // ==================== GEOFENCES API ====================
  const loadGeofences = async () => {
    const res = await apiFetch("/api/admin/geofences");
    if (!res) return;
    const data = await res.json();
    setGeofences(data);
  };

  // ==================== TELEMETRIES API ====================
  const loadTelemetries = async (page = 1, deviceId = "") => {
    const res = await apiFetch(`/api/admin/telemetries?page=${page}&limit=10&deviceId=${encodeURIComponent(deviceId)}`);
    if (!res) return;
    const data = await res.json();
    setTelemetriesData({
      telemetries: data.telemetries,
      page: data.page,
      totalPages: data.totalPages
    });
  };

  // ==================== LOGOUT ====================
  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    router.push("/login");
  };

  // ==================== ACTIONS / OPERATIONS ====================

  // Users CRUD
  const openUserModal = (user = null) => {
    if (user) {
      setUserForm({
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
        nicNo: user.nicNo || "",
        gender: user.gender || "",
        role: user.role || "user",
        address: user.address || "",
        password: ""
      });
      setUserModal({ active: true, mode: "edit", data: user });
    } else {
      setUserForm({
        firstName: "", lastName: "", mobile: "", nicNo: "", gender: "", role: "user", address: "", password: ""
      });
      setUserModal({ active: true, mode: "create", data: null });
    }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    const isEdit = userModal.mode === "edit";
    const userId = isEdit ? (userModal.data.userId || userModal.data._id) : "";
    
    const payload = { ...userForm };
    if (isEdit && !payload.password) {
      delete payload.password; // Don't overwrite password if left blank on edit
    }

    const path = isEdit ? `/api/admin/users/${userId}` : "/api/admin/users";
    const method = isEdit ? "PUT" : "POST";

    const res = await apiFetch(path, { method, body: JSON.stringify(payload) });
    if (res && res.ok) {
      alert(`User ${isEdit ? 'updated' : 'created'} successfully!`);
      setUserModal({ active: false, mode: "create", data: null });
      loadUsers(usersData.page, userSearch);
    } else if (res) {
      const err = await res.json();
      alert(`Error: ${err.error || err.message}`);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm("Are you sure you want to delete this user permanently? This will delete their cattle and geofences as well.")) return;
    const res = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (res && res.ok) {
      alert("User deleted successfully!");
      loadUsers(1, userSearch);
    }
  };

  // Cattle CRUD
  const openCattleModal = (cattle = null) => {
    if (cattle) {
      setCattleForm({
        cattleId: cattle.cattleId || cattle._id,
        name: cattle.name || "",
        breed: cattle.breed || "",
        age: cattle.age !== undefined ? cattle.age : "",
        gender: cattle.gender || "",
        weight: cattle.weight !== undefined ? cattle.weight : "",
        color: cattle.color || "",
        farmName: cattle.farmName || "",
        address: cattle.address || "",
        Image: cattle.Image || "",
        userId: cattle.userId,
        collarId: cattle.collarId || "",
        healthNotes: cattle.healthNotes || ""
      });
      setCattleModal({ active: true, mode: "edit", data: cattle });
    } else {
      setCattleForm({
        cattleId: "", name: "", breed: "", age: "", gender: "", weight: "", color: "", farmName: "", address: "", Image: "", userId: "", collarId: "", healthNotes: ""
      });
      setCattleModal({ active: true, mode: "create", data: null });
    }
  };

  const handleCattleSubmit = async (e) => {
    e.preventDefault();
    const isEdit = cattleModal.mode === "edit";
    const cattleId = cattleForm.cattleId;

    const path = isEdit ? `/api/admin/cattles/${cattleId}` : "/api/admin/cattles";
    const method = isEdit ? "PUT" : "POST";

    const res = await apiFetch(path, { method, body: JSON.stringify(cattleForm) });
    if (res && res.ok) {
      alert(`Cattle record ${isEdit ? 'updated' : 'created'} successfully!`);
      setCattleModal({ active: false, mode: "create", data: null });
      loadCattles(cattlesData.page, cattleSearch);
    } else if (res) {
      const err = await res.json();
      alert(`Error: ${err.message || err.error}`);
    }
  };

  const handleDeleteCattle = async (cattleId) => {
    if (!confirm("Are you sure you want to delete this cattle record?")) return;
    const res = await apiFetch(`/api/admin/cattles/${cattleId}`, { method: "DELETE" });
    if (res && res.ok) {
      alert("Cattle deleted successfully!");
      loadCattles(1, cattleSearch);
    }
  };

  // Device CRUD
  const openDeviceModal = (device = null) => {
    if (device) {
      setDeviceForm({
        deviceId: device._id,
        group: device.group || "",
        type: device.type || "",
        notes: device.notes || ""
      });
      setDeviceModal({ active: true, mode: "edit", data: device });
    } else {
      setDeviceForm({
        deviceId: "", group: "cc", type: "slave", notes: ""
      });
      setDeviceModal({ active: true, mode: "create", data: null });
    }
  };

  const handleDeviceSubmit = async (e) => {
    e.preventDefault();
    const isEdit = deviceModal.mode === "edit";
    const deviceId = deviceForm.deviceId;

    const path = isEdit ? `/api/admin/devices/${deviceId}` : "/api/admin/devices";
    const method = isEdit ? "PUT" : "POST";

    const res = await apiFetch(path, { method, body: JSON.stringify(deviceForm) });
    if (res && res.ok) {
      alert(`Collar ${isEdit ? 'updated' : 'registered'} successfully!`);
      setDeviceModal({ active: false, mode: "create", data: null });
      loadDevices(devicesData.page, deviceSearch);
    } else if (res) {
      const err = await res.json();
      alert(`Error: ${err.error || err.message}`);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    if (!confirm("Are you sure you want to delete this collar registration? This will disassociate it from any cattle.")) return;
    const res = await apiFetch(`/api/admin/devices/${deviceId}`, { method: "DELETE" });
    if (res && res.ok) {
      alert("Collar registration deleted successfully!");
      loadDevices(1, deviceSearch);
    }
  };

  // Telemetry Simulation
  const handleSimulateSubmit = async (e) => {
    e.preventDefault();
    const deviceId = simulateModal.deviceId;

    const res = await apiFetch(`/api/admin/devices/${deviceId}/telemetry`, {
      method: "POST",
      body: JSON.stringify(simulateForm)
    });
    if (res && res.ok) {
      alert("Simulated telemetry packet injected and saved successfully!");
      setSimulateModal({ active: false, deviceId: "" });
      loadDevices(devicesData.page, deviceSearch);
    } else if (res) {
      const err = await res.json();
      alert(`Simulation failed: ${err.error || err.message}`);
    }
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon" style={{ width: "32px", height: "32px" }}>
            <img src="/logo.png" alt="MooMap Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span className="brand-text">MooMap Admin</span>
        </div>

        <nav className="sidebar-menu">
          <button onClick={() => setActiveTab("dashboard")} className={`menu-item ${activeTab === "dashboard" ? "active" : ""}`}>
            <LayoutDashboard size={18} className="menu-icon" /> Overview
          </button>
          <button onClick={() => setActiveTab("map")} className={`menu-item ${activeTab === "map" ? "active" : ""}`}>
            <MapPin size={18} className="menu-icon" /> Map View
          </button>
          <button onClick={() => setActiveTab("users")} className={`menu-item ${activeTab === "users" ? "active" : ""}`}>
            <Users size={18} className="menu-icon" /> Users
          </button>
          <button onClick={() => setActiveTab("cattles")} className={`menu-item ${activeTab === "cattles" ? "active" : ""}`}>
            <ClipboardList size={18} className="menu-icon" /> Cattle
          </button>
          <button onClick={() => setActiveTab("devices")} className={`menu-item ${activeTab === "devices" ? "active" : ""}`}>
            <Radio size={18} className="menu-icon" /> Collars / Devices
          </button>
          <button onClick={() => setActiveTab("geofences")} className={`menu-item ${activeTab === "geofences" ? "active" : ""}`}>
            <Map size={18} className="menu-icon" /> Geofences
          </button>
          <button onClick={() => setActiveTab("telemetries")} className={`menu-item ${activeTab === "telemetries" ? "active" : ""}`}>
            <FileJson size={18} className="menu-icon" /> Telemetry Logs
          </button>
        </nav>

        <div className="sidebar-footer">
          {adminUser && (
            <div className="admin-profile">
              <div className="admin-avatar">{adminUser.firstName[0]}</div>
              <div className="admin-details">
                <span className="admin-name">{adminUser.firstName} {adminUser.lastName}</span>
                <span className="admin-role">System Administrator</span>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className="btn btn-outline btn-sm btn-logout">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="content-header">
          <h1>
            {activeTab === "dashboard" && "Dashboard Overview"}
            {activeTab === "map" && "Real-Time Livestock Tracking Map"}
            {activeTab === "users" && "User Accounts"}
            {activeTab === "cattles" && "Cattle Registry"}
            {activeTab === "devices" && "IoT Tracking Collars"}
            {activeTab === "geofences" && "System Geofences"}
            {activeTab === "telemetries" && "Telemetry Records Log"}
          </h1>
          <div className="header-actions">
            <div className="system-status">
              <span className={`status-badge ${dbStatus === "connected" ? "online" : "offline"}`}>
                <span className="status-dot"></span> DB: {dbStatus.toUpperCase()}
              </span>
              <span className={`status-badge ${mqttStatus === "connected" ? "online" : "offline"}`}>
                <span className="status-dot"></span> MQTT: {mqttStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        <div className="content-body">
          {/* ==================== 1. DASHBOARD TAB ==================== */}
          {activeTab === "dashboard" && stats && (
            <div className="tab-panel">
              <div className="stats-grid">
                <div className="stats-card">
                  <div className="stats-icon" style={{ color: "var(--primary)" }}><Users size={28} /></div>
                  <div className="stats-info">
                    <h3>Total Users</h3>
                    <p className="stats-value">{stats.counts.users}</p>
                  </div>
                </div>
                <div className="stats-card">
                  <div className="stats-icon" style={{ color: "var(--primary)" }}><ClipboardList size={28} /></div>
                  <div className="stats-info">
                    <h3>Total Cattle</h3>
                    <p className="stats-value">{stats.counts.cattles}</p>
                  </div>
                </div>
                <div className="stats-card">
                  <div className="stats-icon" style={{ color: "var(--primary)" }}><Radio size={28} /></div>
                  <div className="stats-info">
                    <h3>Registered Collars</h3>
                    <p className="stats-value">{stats.counts.devices}</p>
                  </div>
                </div>
                <div className="stats-card">
                  <div className="stats-icon" style={{ color: "var(--primary)" }}><Map size={28} /></div>
                  <div className="stats-info">
                    <h3>Active Geofences</h3>
                    <p className="stats-value">{stats.counts.geofences}</p>
                  </div>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="card chart-card flex-2">
                  <div className="card-header">
                    <h2>Ingested Telemetry (Last 7 Days)</h2>
                  </div>
                  <div className="card-body">
                    <canvas ref={telemetryChartRef}></canvas>
                  </div>
                </div>

                <div className="card stats-detail-card flex-1">
                  <div className="card-header">
                    <h2>Collar Battery Overview</h2>
                  </div>
                  <div className="card-body battery-overview">
                    <div className="battery-circle-container">
                      <div className="battery-avg-circle">
                        <span className="avg-val">{stats.collars.avgBattery}%</span>
                        <span className="avg-label">Avg Battery</span>
                      </div>
                    </div>
                    <div className="battery-stat-rows">
                      <div className="battery-row">
                        <span className="label">Total Devices:</span>
                        <span className="value">{stats.collars.total}</span>
                      </div>
                      <div className="battery-row warning">
                        <span className="label">Low Battery (&lt;20%):</span>
                        <span className="value">{stats.collars.lowBattery}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="card flex-1">
                  <div className="card-header">
                    <h2>Cattle Breed Distribution</h2>
                  </div>
                  <div className="card-body">
                    <div className="chart-container-small">
                      <canvas ref={breedChartRef}></canvas>
                    </div>
                  </div>
                </div>

                <div className="card flex-1">
                  <div className="card-header">
                    <h2>Collar Types Breakdown</h2>
                  </div>
                  <div className="card-body">
                    <div className="chart-container-small">
                      <canvas ref={deviceTypeChartRef}></canvas>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== MAP TAB ==================== */}
          {activeTab === "map" && (
            <div className="tab-panel">
              <div className="map-view-container">
                <div className="map-pane">
                  {/* Filters Overlay */}
                  <div className="map-filter-bar">
                    <div className="map-filter-group">
                      <label>Collar Role</label>
                      <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                        <option value="all">All Devices</option>
                        <option value="master">Master</option>
                        <option value="slave">Slave</option>
                      </select>
                    </div>
                    <div className="map-filter-group">
                      <label>Filter Collar ID</label>
                      <input 
                        type="text" 
                        placeholder="Search Collar..." 
                        value={filterCollar} 
                        onChange={(e) => setFilterCollar(e.target.value)} 
                      />
                    </div>
                    <div className="map-filter-group">
                      <label>Filter Owner / User ID</label>
                      <input 
                        type="text" 
                        placeholder="Search User..." 
                        value={filterOwner} 
                        onChange={(e) => setFilterOwner(e.target.value)} 
                      />
                    </div>
                    <button onClick={loadMapMarkers} className="btn btn-secondary btn-sm" style={{ marginTop: "18px" }}>Refresh Map</button>
                  </div>
                  
                  {/* Target container for Leaflet map */}
                  <div id="cattle-map"></div>
                </div>

                {/* Sidebar overlay list showing registered cattle */}
                <div className="map-sidebar">
                  <div className="card-header" style={{ borderBottom: "1px solid var(--border-color)", padding: "16px 20px" }}>
                    <h2>Cattle Locator Registry</h2>
                  </div>
                  <div className="map-sidebar-list">
                    {mapMarkers.length === 0 ? (
                      <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "20px" }}>No cattle markers available.</div>
                    ) : (
                      mapMarkers.map(m => (
                        <div 
                          key={m.cattleId} 
                          className="map-sidebar-item"
                          onClick={() => m.location && locateOnMap(m.location.lat, m.location.lon)}
                          style={{ opacity: m.location ? 1 : 0.6 }}
                        >
                          <div className="map-sidebar-info">
                            <h4>🐄 {m.name}</h4>
                            <p>Collar: {m.collarId}</p>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Owner: {m.owner ? m.owner.name : 'Unassigned'}</span>
                          </div>
                          {m.location ? (
                            <span className="badge badge-active" style={{ fontSize: "0.65rem" }}>Live</span>
                          ) : (
                            <span className="badge badge-disabled" style={{ fontSize: "0.65rem" }}>Offline</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 2. USERS TAB ==================== */}
          {activeTab === "users" && (
            <div className="tab-panel">
              <div className="action-bar">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search users by name, mobile, nic..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadUsers(1, userSearch)}
                  />
                  <button onClick={() => loadUsers(1, userSearch)} className="btn btn-secondary">Search</button>
                </div>
                <button onClick={() => openUserModal()} className="btn btn-primary">+ Add New User</button>
              </div>

              <div className="card table-card">
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>NIC Number</th>
                        <th>Address</th>
                        <th>Role</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.users.length === 0 ? (
                        <tr><td colSpan="8" style={{ textAlign: "center", color: "var(--text-muted)" }}>No users found.</td></tr>
                      ) : (
                        usersData.users.map(u => (
                          <tr key={u._id}>
                            <td><strong>{u.userId || u._id}</strong></td>
                            <td>{u.firstName} {u.lastName}</td>
                            <td>{u.mobile}</td>
                            <td>{u.nicNo || "-"}</td>
                            <td>{u.address || "-"}</td>
                            <td><span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>{u.role}</span></td>
                            <td>{new Date(u.createdAt).toLocaleString()}</td>
                            <td>
                              <button onClick={() => openUserModal(u)} className="btn-action edit" title="Edit User"><Pencil size={15} /></button>
                              <button onClick={() => handleDeleteUser(u.userId || u._id)} className="btn-action delete" title="Delete User"><Trash2 size={15} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <button disabled={usersData.page === 1} onClick={() => loadUsers(usersData.page - 1, userSearch)} className="pagination-btn">&laquo;</button>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0 10px", color: "var(--text-muted)" }}>Page {usersData.page} of {usersData.totalPages}</span>
                  <button disabled={usersData.page === usersData.totalPages} onClick={() => loadUsers(usersData.page + 1, userSearch)} className="pagination-btn">&raquo;</button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 3. CATTLE TAB ==================== */}
          {activeTab === "cattles" && (
            <div className="tab-panel">
              <div className="action-bar">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search cattle by name, breed, ID..."
                    value={cattleSearch}
                    onChange={(e) => setCattleSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadCattles(1, cattleSearch)}
                  />
                  <button onClick={() => loadCattles(1, cattleSearch)} className="btn btn-secondary">Search</button>
                </div>
                <button onClick={() => openCattleModal()} className="btn btn-primary">+ Add New Cattle</button>
              </div>

              <div className="card table-card">
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Cattle ID</th>
                        <th>Name</th>
                        <th>Breed</th>
                        <th>Age</th>
                        <th>Gender</th>
                        <th>Weight (kg)</th>
                        <th>Farm</th>
                        <th>Collar ID</th>
                        <th>Owner (User)</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cattlesData.cattles.length === 0 ? (
                        <tr><td colSpan="10" style={{ textAlign: "center", color: "var(--text-muted)" }}>No cattle records found.</td></tr>
                      ) : (
                        cattlesData.cattles.map(c => (
                          <tr key={c._id}>
                            <td><strong>{c.cattleId || c._id}</strong></td>
                            <td>{c.name || "-"}</td>
                            <td>{c.breed || "-"}</td>
                            <td>{c.age !== undefined ? c.age : "-"}</td>
                            <td>{c.gender || "-"}</td>
                            <td>{c.weight !== undefined ? c.weight : "-"}</td>
                            <td>{c.farmName || "-"}</td>
                            <td><span style={{ fontFamily: "monospace" }}>{c.collarId || "-"}</span></td>
                            <td>{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : `ID: ${c.userId}`}</td>
                            <td>
                              <button onClick={() => openCattleModal(c)} className="btn-action edit" title="Edit Cattle"><Pencil size={15} /></button>
                              <button onClick={() => handleDeleteCattle(c.cattleId || c._id)} className="btn-action delete" title="Delete Cattle"><Trash2 size={15} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <button disabled={cattlesData.page === 1} onClick={() => loadCattles(cattlesData.page - 1, cattleSearch)} className="pagination-btn">&laquo;</button>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0 10px", color: "var(--text-muted)" }}>Page {cattlesData.page} of {cattlesData.totalPages}</span>
                  <button disabled={cattlesData.page === cattlesData.totalPages} onClick={() => loadCattles(cattlesData.page + 1, cattleSearch)} className="pagination-btn">&raquo;</button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 4. DEVICES TAB ==================== */}
          {activeTab === "devices" && (
            <div className="tab-panel">
              <div className="action-bar">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search collars by device ID..."
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadDevices(1, deviceSearch)}
                  />
                  <button onClick={() => loadDevices(1, deviceSearch)} className="btn btn-secondary">Search</button>
                </div>
                <button onClick={() => openDeviceModal()} className="btn btn-primary">+ Register New Collar</button>
              </div>

              <div className="card table-card">
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Device ID</th>
                        <th>Group</th>
                        <th>Type</th>
                        <th>Last Battery</th>
                        <th>Last Voltage</th>
                        <th>Last Location (Lat, Lon)</th>
                        <th>Last Seen</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devicesData.devices.length === 0 ? (
                        <tr><td colSpan="9" style={{ textAlign: "center", color: "var(--text-muted)" }}>No collar devices registered.</td></tr>
                      ) : (
                        devicesData.devices.map(d => {
                          const batVal = d.lastBatteryPercent !== undefined ? `${d.lastBatteryPercent}%` : '-';
                          const voltVal = d.lastBatteryVoltage !== undefined ? `${d.lastBatteryVoltage}V` : '-';
                          const locVal = d.lastLocation && d.lastLocation.lat !== undefined ? `${d.lastLocation.lat.toFixed(4)}, ${d.lastLocation.lon.toFixed(4)}` : '-';

                          return (
                            <tr key={d._id}>
                              <td><strong style={{ fontFamily: "monospace" }}>{d._id}</strong></td>
                              <td>{d.group || "-"}</td>
                              <td>{d.type || "-"}</td>
                              <td>{batVal}</td>
                              <td>{voltVal}</td>
                              <td>{locVal}</td>
                              <td>{d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '-'}</td>
                              <td style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }} title={d.notes}>{d.notes || "-"}</td>
                              <td>
                                <button onClick={() => openDeviceModal(d)} className="btn-action edit" title="Edit Collar"><Pencil size={15} /></button>
                                <button onClick={() => setSimulateModal({ active: true, deviceId: d._id })} className="btn-action simulate" title="Simulate Telemetry"><Zap size={15} /></button>
                                <button onClick={() => handleDeleteDevice(d._id)} className="btn-action delete" title="Delete Collar"><Trash2 size={15} /></button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <button disabled={devicesData.page === 1} onClick={() => loadDevices(devicesData.page - 1, deviceSearch)} className="pagination-btn">&laquo;</button>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0 10px", color: "var(--text-muted)" }}>Page {devicesData.page} of {devicesData.totalPages}</span>
                  <button disabled={devicesData.page === devicesData.totalPages} onClick={() => loadDevices(devicesData.page + 1, deviceSearch)} className="pagination-btn">&raquo;</button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 5. GEOFENCES TAB ==================== */}
          {activeTab === "geofences" && (
            <div className="tab-panel">
              <div className="card table-card">
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Fence Name</th>
                        <th>Owner (User)</th>
                        <th>Status</th>
                        <th>Boundary Coordinates</th>
                        <th>Assigned Cattle</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geofences.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: "center", color: "var(--text-muted)" }}>No geofences found.</td></tr>
                      ) : (
                        geofences.map(g => (
                          <tr key={g._id}>
                            <td><strong>{g.name || "Geofence"}</strong></td>
                            <td>{g.owner ? `${g.owner.firstName} ${g.owner.lastName}` : `ID: ${g.userId}`}</td>
                            <td>
                              <span className={`badge ${g.enabled ? 'badge-active' : 'badge-disabled'}`}>
                                {g.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </td>
                            <td title={JSON.stringify(g.polygon)}>{g.polygon ? `${g.polygon.length} points` : '0 points'}</td>
                            <td>{g.cattleIds ? g.cattleIds.join(", ") : "-"}</td>
                            <td>{new Date(g.updatedAt || g.createdAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 6. TELEMETRY TAB ==================== */}
          {activeTab === "telemetries" && (
            <div className="tab-panel">
              {/* Telemetry Sub-Navigation Tabs */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>
                <button 
                  onClick={() => setTelemetrySubTab("history")} 
                  className={`btn ${telemetrySubTab === "history" ? "btn-primary" : "btn-secondary"} btn-sm`}
                >
                  📜 Telemetry History
                </button>
                <button 
                  onClick={() => setTelemetrySubTab("live")} 
                  className={`btn ${telemetrySubTab === "live" ? "btn-primary" : "btn-secondary"} btn-sm`}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span className={`status-dot ${isStreaming ? "online" : "offline"}`} style={{ width: "8px", height: "8px", backgroundColor: isStreaming ? "var(--success)" : "var(--text-muted)", borderRadius: "50%", boxShadow: isStreaming ? "0 0 8px var(--success)" : "none" }}></span>
                  📡 Live MQTT Stream
                </button>
              </div>

              {telemetrySubTab === "history" ? (
                <>
                  <div className="action-bar">
                    <div className="search-box">
                      <input
                        type="text"
                        placeholder="Filter logs by Device ID..."
                        value={telemetrySearch}
                        onChange={(e) => setTelemetrySearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadTelemetries(1, telemetrySearch)}
                      />
                      <button onClick={() => loadTelemetries(1, telemetrySearch)} className="btn btn-secondary">Filter</button>
                    </div>
                  </div>

                  <div className="card table-card">
                    <div className="table-responsive">
                      <table>
                        <thead>
                          <tr>
                            <th>Device ID</th>
                            <th>Timestamp</th>
                            <th>MQTT Topic</th>
                            <th>GPS Coordinates</th>
                            <th>GPS Valid</th>
                            <th>Battery</th>
                            <th>Raw JSON</th>
                          </tr>
                        </thead>
                        <tbody>
                          {telemetriesData.telemetries.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: "center", color: "var(--text-muted)" }}>No telemetry records logged.</td></tr>
                          ) : (
                            telemetriesData.telemetries.map(log => (
                              <tr key={log._id}>
                                <td><strong style={{ fontFamily: "monospace" }}>{log.deviceId}</strong></td>
                                <td>{new Date(log.timestamp).toLocaleString()}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{log.topic}</td>
                                <td>{log.gpsLat !== undefined ? `${log.gpsLat.toFixed(5)}, ${log.gpsLon.toFixed(5)}` : '-'}</td>
                                <td>{log.gpsValid !== undefined ? (log.gpsValid ? '✅ Yes' : '❌ No') : '-'}</td>
                                <td>{log.batteryPercent !== undefined ? `${log.batteryPercent}% (${log.batteryVoltage || 0}V)` : '-'}</td>
                                <td>
                                  <button onClick={() => setJsonModal({ active: true, data: log.raw })} className="btn btn-outline btn-sm">View Raw</button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="pagination">
                      <button disabled={telemetriesData.page === 1} onClick={() => loadTelemetries(telemetriesData.page - 1, telemetrySearch)} className="pagination-btn">&laquo;</button>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "0 10px", color: "var(--text-muted)" }}>Page {telemetriesData.page} of {telemetriesData.totalPages}</span>
                      <button disabled={telemetriesData.page === telemetriesData.totalPages} onClick={() => loadTelemetries(telemetriesData.page + 1, telemetrySearch)} className="pagination-btn">&raquo;</button>
                    </div>
                  </div>
                </>
              ) : (
                /* LIVE MQTT LOGS TERMINAL STYLE */
                <div className="card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 280px)" }}>
                  <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(0,0,0,0.01)" }}>
                    <h2>Live Broker Activity (cc/+/payload)</h2>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {isStreaming ? "🟢 Connected to feed" : "🔴 Disconnected"}
                      </span>
                      <button onClick={() => setLiveMqttLogs([])} className="btn btn-secondary btn-sm">Clear Terminal</button>
                    </div>
                  </div>
                  <div className="card-body" style={{ flexGrow: 1, backgroundColor: "#1e1e1e", color: "#f8f8f2", fontFamily: "Courier New, Courier, monospace", padding: "20px", overflowY: "auto", fontSize: "0.9rem", display: "flex", flexDirection: "column-reverse", gap: "12px", borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px" }}>
                    {liveMqttLogs.length === 0 ? (
                      <div style={{ color: "#a0a0a0", textAlign: "center", marginTop: "40px" }}>
                        ⚡ Waiting for live MQTT packets... (Simulate telemetry in the Collars tab to trigger events immediately)
                      </div>
                    ) : (
                      liveMqttLogs.map((log, idx) => (
                        <div key={idx} style={{ borderBottom: "1px solid #333", paddingBottom: "10px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#66d9ef", fontSize: "0.8rem", marginBottom: "4px" }}>
                            <span>TIMESTAMP: {new Date(log.timestamp).toLocaleTimeString()} | DEVICE: <strong style={{ color: "#a6e22e" }}>{log.deviceId}</strong></span>
                            <span style={{ color: "#f92672" }}>TOPIC: {log.topic}</span>
                          </div>
                          <div style={{ color: "#fd971f", marginBottom: "4px" }}>
                            PAYLOAD: {log.payloadStr}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#888" }}>
                            DATABASE: Saved as telemetry history doc successfully.
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ==================== USER MODAL ==================== */}
      {userModal.active && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{userModal.mode === "edit" ? `Edit User ID: ${userModal.data.userId}` : "Add New User"}</h2>
              <span onClick={() => setUserModal({ active: false })} className="close-modal">&times;</span>
            </div>
            <form onSubmit={handleUserSubmit}>
              <div className="modal-grid">
                <div className="input-group">
                  <label>First Name *</label>
                  <input type="text" value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} required />
                </div>
                <div className="input-group">
                  <label>Last Name *</label>
                  <input type="text" value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} required />
                </div>
                <div className="input-group">
                  <label>Mobile Number *</label>
                  <input type="tel" value={userForm.mobile} onChange={(e) => setUserForm({ ...userForm, mobile: e.target.value })} required />
                </div>
                <div className="input-group">
                  <label>NIC Number</label>
                  <input type="text" value={userForm.nicNo} onChange={(e) => setUserForm({ ...userForm, nicNo: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Gender</label>
                  <select value={userForm.gender} onChange={(e) => setUserForm({ ...userForm, gender: e.target.value })}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Role *</label>
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} required>
                    <option value="user">User (Standard)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </div>
                <div className="input-group full-width">
                  <label>Address</label>
                  <input type="text" value={userForm.address} onChange={(e) => setUserForm({ ...userForm, address: e.target.value })} />
                </div>
                <div className="input-group full-width">
                  <label>{userModal.mode === "edit" ? "New Password (Leave blank to keep)" : "Password *"}</label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    required={userModal.mode !== "edit"}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setUserModal({ active: false })} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CATTLE MODAL ==================== */}
      {cattleModal.active && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{cattleModal.mode === "edit" ? `Edit Cattle ID: ${cattleModal.data.cattleId}` : "Add New Cattle"}</h2>
              <span onClick={() => setCattleModal({ active: false })} className="close-modal">&times;</span>
            </div>
            <form onSubmit={handleCattleSubmit}>
              <div className="modal-grid">
                <div className="input-group">
                  <label>Cattle ID *</label>
                  <input
                    type="text"
                    value={cattleForm.cattleId}
                    onChange={(e) => setCattleForm({ ...cattleForm, cattleId: e.target.value })}
                    disabled={cattleModal.mode === "edit"}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Name</label>
                  <input type="text" value={cattleForm.name} onChange={(e) => setCattleForm({ ...cattleForm, name: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Breed</label>
                  <input type="text" value={cattleForm.breed} onChange={(e) => setCattleForm({ ...cattleForm, breed: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Age (Years)</label>
                  <input type="number" min="0" step="0.1" value={cattleForm.age} onChange={(e) => setCattleForm({ ...cattleForm, age: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Gender</label>
                  <select value={cattleForm.gender} onChange={(e) => setCattleForm({ ...cattleForm, gender: e.target.value })}>
                    <option value="">Select</option>
                    <option value="Heifer">Heifer</option>
                    <option value="Bull">Bull</option>
                    <option value="Steer">Steer</option>
                    <option value="Cow">Cow</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Weight (kg)</label>
                  <input type="number" min="0" value={cattleForm.weight} onChange={(e) => setCattleForm({ ...cattleForm, weight: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Color</label>
                  <input type="text" value={cattleForm.color} onChange={(e) => setCattleForm({ ...cattleForm, color: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Farm Name</label>
                  <input type="text" value={cattleForm.farmName} onChange={(e) => setCattleForm({ ...cattleForm, farmName: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Address</label>
                  <input type="text" value={cattleForm.address} onChange={(e) => setCattleForm({ ...cattleForm, address: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Image URL</label>
                  <input type="text" value={cattleForm.Image} onChange={(e) => setCattleForm({ ...cattleForm, Image: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Owner (User ID) *</label>
                  <input type="text" value={cattleForm.userId} onChange={(e) => setCattleForm({ ...cattleForm, userId: e.target.value })} required />
                </div>
                <div className="input-group">
                  <label>Collar ID</label>
                  <input type="text" value={cattleForm.collarId} onChange={(e) => setCattleForm({ ...cattleForm, collarId: e.target.value })} />
                </div>
                <div className="input-group full-width">
                  <label>Health Notes</label>
                  <textarea rows="2" value={cattleForm.healthNotes} onChange={(e) => setCattleForm({ ...cattleForm, healthNotes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setCattleModal({ active: false })} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Cattle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== DEVICE MODAL ==================== */}
      {deviceModal.active && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{deviceModal.mode === "edit" ? `Edit Collar: ${deviceModal.data._id}` : "Register New Collar"}</h2>
              <span onClick={() => setDeviceModal({ active: false })} className="close-modal">&times;</span>
            </div>
            <form onSubmit={handleDeviceSubmit}>
              <div className="modal-grid">
                <div className="input-group">
                  <label>Device ID *</label>
                  <input
                    type="text"
                    value={deviceForm.deviceId}
                    onChange={(e) => setDeviceForm({ ...deviceForm, deviceId: e.target.value })}
                    disabled={deviceModal.mode === "edit"}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>MQTT Group</label>
                  <input type="text" value={deviceForm.group} onChange={(e) => setDeviceForm({ ...deviceForm, group: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Type</label>
                  <input type="text" value={deviceForm.type} onChange={(e) => setDeviceForm({ ...deviceForm, type: e.target.value })} />
                </div>
                <div className="input-group full-width">
                  <label>Notes</label>
                  <input type="text" value={deviceForm.notes} onChange={(e) => setDeviceForm({ ...deviceForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setDeviceModal({ active: false })} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Collar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== TELEMETRY SIMULATE MODAL ==================== */}
      {simulateModal.active && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Simulate Telemetry - {simulateModal.deviceId}</h2>
              <span onClick={() => setSimulateModal({ active: false, deviceId: "" })} className="close-modal">&times;</span>
            </div>
            <form onSubmit={handleSimulateSubmit}>
              <div className="modal-grid">
                <div className="input-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={simulateForm.lat}
                    onChange={(e) => setSimulateForm({ ...simulateForm, lat: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="input-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={simulateForm.lon}
                    onChange={(e) => setSimulateForm({ ...simulateForm, lon: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="input-group">
                  <label>Battery Percent (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={simulateForm.batteryPercent}
                    onChange={(e) => setSimulateForm({ ...simulateForm, batteryPercent: parseInt(e.target.value) })}
                  />
                </div>
                <div className="input-group">
                  <label>Battery Voltage (V)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={simulateForm.batteryVoltage}
                    onChange={(e) => setSimulateForm({ ...simulateForm, batteryVoltage: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setSimulateModal({ active: false, deviceId: "" })} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Inject Telemetry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== JSON RAW VIEW MODAL ==================== */}
      {jsonModal.active && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Raw Telemetry Payload</h2>
              <span onClick={() => setJsonModal({ active: false, data: null })} className="close-modal">&times;</span>
            </div>
            <div className="modal-body">
              <pre>
                <code>{JSON.stringify(jsonModal.data, null, 2)}</code>
              </pre>
            </div>
            <div className="modal-footer">
              <button onClick={() => setJsonModal({ active: false, data: null })} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
