"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BatteryLow, Bell, Crosshair, PawPrint, RefreshCw, ShieldAlert, Wifi } from "lucide-react";
import LeafletMap from "@/components/portal/LeafletMap";
import { PageHeader, usePortal } from "@/components/portal/PortalShell";
import { COLORS, cattleStatus, hasLocation, timeAgo } from "@/lib/portal";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "outside", label: "Outside", test: (c) => c.fenceStatus === "outside" },
  { key: "offline", label: "Offline", test: (c) => c.device && !c.device.online },
  { key: "battery", label: "Low battery", test: (c) => c.device && c.device.lowBattery },
  { key: "nocollar", label: "No collar", test: (c) => !c.collarId },
];

export default function OverviewPage() {
  const { api, alertTick, user } = usePortal();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [fitKey, setFitKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await api("/api/me/overview");
    if (r.ok) {
      setData(r.data);
      setError("");
    } else if (!r.authFailed) {
      setError(r.error);
    }
  }, [api]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (alertTick) load();
  }, [alertTick, load]);

  // Deep link from an alert: /portal?cattle=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("cattle");
    if (id) setSelected(id);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cattle = data ? data.cattle : [];
  const counts = useMemo(() => {
    const out = {};
    for (const f of FILTERS) out[f.key] = f.test ? cattle.filter(f.test).length : cattle.length;
    return out;
  }, [cattle]);
  const activeFilter = FILTERS.find((f) => f.key === filter);
  const visible = activeFilter.test ? cattle.filter(activeFilter.test) : cattle;

  const s = data && data.summary;
  const firstName = user && user.firstName;

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : "Overview"}
        subtitle="Live position and status of your herd"
        actions={
          <button type="button" className="pt-btn" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "pt-spin" : ""} /> Refresh
          </button>
        }
      />

      {error && <div className="pt-error pt-section">{error}</div>}

      {!data && !error && (
        <div className="pt-loading">
          <span className="pt-spinner" />
        </div>
      )}

      {data && (
        <>
          <div className="pt-stats">
            <Stat icon={PawPrint} color={COLORS.primary} value={s.cattle} label="Cattle" href="/portal/cattle" />
            <Stat
              icon={ShieldAlert}
              color={s.outside ? COLORS.danger : COLORS.success}
              value={s.outside}
              label="Outside a fence"
              onClick={() => setFilter("outside")}
            />
            <Stat
              icon={Wifi}
              color={COLORS.success}
              value={`${s.online}/${s.withCollar}`}
              label="Collars online"
              onClick={() => setFilter("offline")}
            />
            <Stat
              icon={BatteryLow}
              color={s.lowBattery ? COLORS.warning : COLORS.muted}
              value={s.lowBattery}
              label="Low battery"
              onClick={() => setFilter("battery")}
            />
            <Stat
              icon={Bell}
              color={s.unreadAlerts ? COLORS.danger : COLORS.muted}
              value={s.unreadAlerts}
              label="Unread alerts"
              href="/portal/alerts"
            />
          </div>

          {cattle.length === 0 ? (
            <div className="pt-card pt-empty">
              <PawPrint size={44} />
              <h3>No cattle yet</h3>
              <p>Add your first animal and attach its collar to see it on the map.</p>
              <Link href="/portal/cattle" className="pt-btn pt-btn-primary">
                Add cattle
              </Link>
            </div>
          ) : (
            <div className="pt-overview">
              <div className="pt-map-wrap">
                <LeafletMap
                  cattle={cattle}
                  fences={data.geofences}
                  selectedCattleId={selected}
                  onSelectCattle={setSelected}
                  fitKey={fitKey}
                />
                <div className="pt-map-overlay">
                  <button
                    type="button"
                    className="pt-btn pt-btn-sm"
                    onClick={() => {
                      setSelected(null);
                      setFitKey((k) => k + 1);
                    }}
                  >
                    <Crosshair size={15} /> Show all
                  </button>
                </div>
              </div>

              <div className="pt-side-list">
                <div className="pt-seg">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={filter === f.key ? "active" : ""}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                      <span className="pt-seg-n">{counts[f.key]}</span>
                    </button>
                  ))}
                </div>
                <div className="pt-list">
                  {visible.length === 0 && <div className="pt-empty">Nothing here.</div>}
                  {visible.map((c) => {
                    const st = cattleStatus(c);
                    const located = hasLocation(c);
                    return (
                      <button
                        key={c.cattleId}
                        type="button"
                        className={`pt-cattle-row ${selected === c.cattleId ? "selected" : ""}`}
                        onClick={() => setSelected(c.cattleId)}
                        disabled={!located}
                        title={located ? "Show on map" : "No location yet"}
                      >
                        <span className="pt-status-dot" style={{ "--c": COLORS[st.key] }} />
                        <span className="pt-cattle-row-main">
                          <strong>{c.name || c.cattleId}</strong>
                          <span className="pt-sub">
                            {located ? `Seen ${timeAgo(c.device.lastSeen)}` : c.collarId ? "No location yet" : "No collar attached"}
                            {c.device && c.device.batteryPercent != null && ` · ${c.device.batteryPercent}%`}
                          </span>
                        </span>
                        <span className={`pt-chip ${st.key}`}>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({ icon: Icon, color, value, label, href, onClick }) {
  const inner = (
    <>
      <span className="pt-stat-icon" style={{ "--c": color }}>
        <Icon size={21} />
      </span>
      <span>
        <div className="pt-stat-value">{value}</div>
        <div className="pt-stat-label">{label}</div>
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="pt-card pt-stat">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className="pt-card pt-stat" onClick={onClick} style={{ font: "inherit", textAlign: "left", cursor: "pointer" }}>
      {inner}
    </button>
  );
}
