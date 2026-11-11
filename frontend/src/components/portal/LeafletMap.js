"use client";
// Leaflet map for the user portal. Leaflet itself is loaded globally in app/layout.js (window.L).
import { useEffect, useRef, useState } from "react";
import { COLORS, cattleStatus, escapeHtml, hasLocation, timeAgo } from "@/lib/portal";

const DEFAULT_CENTER = [7.8731, 80.7718]; // Sri Lanka
const DEFAULT_ZOOM = 8;

function waitForLeaflet(cb) {
  if (typeof window === "undefined") return () => {};
  if (window.L) {
    cb(window.L);
    return () => {};
  }
  const id = setInterval(() => {
    if (window.L) {
      clearInterval(id);
      cb(window.L);
    }
  }, 100);
  return () => clearInterval(id);
}

function popupHtml(item) {
  const st = cattleStatus(item);
  const d = item.device;
  const fences = (item.fences || [])
    .map((f) => `${escapeHtml(f.name || "Fence")}: <b>${escapeHtml(f.status)}</b>`)
    .join("<br/>");
  return `
    <div class="pt-popup">
      <div class="pt-popup-title">${escapeHtml(item.name || item.cattleId)}</div>
      <div class="pt-popup-status" style="color:${COLORS[st.key]}">● ${escapeHtml(st.label)}</div>
      <table>
        <tr><td>ID</td><td>${escapeHtml(item.cattleId)}</td></tr>
        <tr><td>Collar</td><td>${escapeHtml(item.collarId || "—")}</td></tr>
        <tr><td>Battery</td><td>${d && d.batteryPercent != null ? `${d.batteryPercent}%` : "—"}</td></tr>
        <tr><td>Last seen</td><td>${escapeHtml(timeAgo(d && d.lastSeen))}</td></tr>
      </table>
      ${fences ? `<div class="pt-popup-fences">${fences}</div>` : ""}
    </div>`;
}

/**
 * Props:
 *  cattle            overview items (markers for those with a location)
 *  fences            [{ _id, name, enabled, polygon }]
 *  highlightFenceId  draw this fence emphasised
 *  draft             [{lat, lon}] polygon being drawn, or null when not drawing
 *  onMapClick        ({lat, lon}) => void
 *  selectedCattleId  fly to + open popup for this cattle
 *  onSelectCattle    (cattleId) => void
 *  fitKey            change this value to re-fit the view to all content
 */
export default function LeafletMap({
  cattle = [],
  fences = [],
  highlightFenceId = null,
  draft = null,
  onMapClick,
  selectedCattleId = null,
  onSelectCattle,
  fitKey = 0,
  className = "",
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const markersRef = useRef(new Map());
  const fittedKeyRef = useRef(null);
  const [ready, setReady] = useState(false);

  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const selectRef = useRef(onSelectCattle);
  selectRef.current = onSelectCattle;

  // Create / destroy the map
  useEffect(() => {
    let ro;
    const stop = waitForLeaflet((L) => {
      if (!elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      layersRef.current = {
        fences: L.layerGroup().addTo(map),
        markers: L.layerGroup().addTo(map),
        draft: L.layerGroup().addTo(map),
      };
      map.on("click", (e) => {
        if (clickRef.current) clickRef.current({ lat: e.latlng.lat, lon: e.latlng.lng });
      });
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(elRef.current);
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      stop();
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = null;
        markersRef.current = new Map();
        fittedKeyRef.current = null;
      }
      setReady(false);
    };
  }, []);

  // Fences + cattle markers, and fit-to-content
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    const map = mapRef.current;
    const { fences: fenceLayer, markers: markerLayer } = layersRef.current;
    fenceLayer.clearLayers();
    markerLayer.clearLayers();
    markersRef.current = new Map();
    const bounds = [];

    for (const f of fences) {
      if (!Array.isArray(f.polygon) || f.polygon.length < 3) continue;
      const latlngs = f.polygon.map((p) => [p.lat, p.lon]);
      const enabled = f.enabled !== false;
      const hl = highlightFenceId && String(f._id) === String(highlightFenceId);
      L.polygon(latlngs, {
        color: enabled ? COLORS.primary : COLORS.muted,
        weight: hl ? 4 : 2,
        dashArray: enabled ? null : "6 6",
        fillOpacity: hl ? 0.22 : 0.08,
        interactive: !clickRef.current, // let clicks through while drawing
      })
        .bindTooltip(escapeHtml(f.name || "Fence") + (enabled ? "" : " (off)"), { sticky: true })
        .addTo(fenceLayer);
      bounds.push(...latlngs);
    }

    for (const item of cattle) {
      if (!hasLocation(item)) continue;
      const st = cattleStatus(item);
      const { lat, lon } = item.device.lastLocation;
      const icon = L.divIcon({
        className: "pt-marker-wrap",
        html: `<div class="pt-marker ${st.key === "danger" ? "pulse" : ""}" style="--c:${COLORS[st.key]}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -8],
      });
      const marker = L.marker([lat, lon], { icon, title: item.name || item.cattleId })
        .bindPopup(popupHtml(item))
        .on("click", () => selectRef.current && selectRef.current(item.cattleId))
        .addTo(markerLayer);
      markersRef.current.set(item.cattleId, marker);
      bounds.push([lat, lon]);
    }

    if (fittedKeyRef.current !== fitKey && bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      fittedKeyRef.current = fitKey;
    }
  }, [ready, cattle, fences, highlightFenceId, fitKey]);

  // Polygon being drawn
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    const layer = layersRef.current.draft;
    layer.clearLayers();
    elRef.current.classList.toggle("pt-map-drawing", Array.isArray(draft));
    if (!Array.isArray(draft) || draft.length === 0) return;

    const latlngs = draft.map((p) => [p.lat, p.lon]);
    const style = { color: COLORS.danger, weight: 3, dashArray: "6 4", interactive: false };
    if (latlngs.length >= 3) {
      L.polygon(latlngs, { ...style, fillOpacity: 0.15 }).addTo(layer);
    } else {
      L.polyline(latlngs, style).addTo(layer);
    }
    latlngs.forEach((ll, i) =>
      L.circleMarker(ll, {
        radius: i === 0 ? 7 : 5,
        color: "#fff",
        weight: 2,
        fillColor: COLORS.danger,
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer)
    );
  }, [ready, draft]);

  // Fly to selected cattle
  useEffect(() => {
    if (!ready || !selectedCattleId) return;
    const marker = markersRef.current.get(selectedCattleId);
    if (!marker) return;
    const map = mapRef.current;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 });
    marker.openPopup();
  }, [ready, selectedCattleId, cattle]);

  return <div ref={elRef} className={`pt-map ${className}`} />;
}
