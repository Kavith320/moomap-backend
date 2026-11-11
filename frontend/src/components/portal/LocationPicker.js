"use client";
// Small map for choosing one point: click to place, drag the pin to adjust.
// Leaflet is loaded globally in app/layout.js (window.L).
import { useEffect, useRef } from "react";

const DEFAULT_VIEW = { center: [7.8731, 80.7718], zoom: 8 }; // Sri Lanka

export default function LocationPicker({ value, onChange, hint = "Tap the map or drag the pin to set the location" }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // create once
  useEffect(() => {
    let timer;
    const init = () => {
      const L = window.L;
      if (!L) {
        timer = setTimeout(init, 100);
        return;
      }
      if (!elRef.current || mapRef.current) return;
      const map = L.map(elRef.current).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (e) => changeRef.current(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      sync(true);
    };
    init();
    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // place / move the pin when the value changes
  const sync = (initial = false) => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;
    const ok = value && Number.isFinite(value.lat) && Number.isFinite(value.lon);
    if (!ok) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    const ll = [value.lat, value.lon];
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, {
        draggable: true,
        icon: L.divIcon({ className: "pt-home-wrap", html: '<div class="pt-home">🏠</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
      })
        .on("dragend", (e) => {
          const p = e.target.getLatLng();
          changeRef.current(p.lat, p.lng);
        })
        .addTo(map);
      map.setView(ll, initial ? 16 : Math.max(map.getZoom(), 15));
    } else {
      markerRef.current.setLatLng(ll);
      if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll);
    }
  };

  useEffect(() => {
    sync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value && value.lat, value && value.lon]);

  return (
    <div className="pt-picker">
      <div ref={elRef} />
      <span className="pt-picker-hint">{hint}</span>
    </div>
  );
}
