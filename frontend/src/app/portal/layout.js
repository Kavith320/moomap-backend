import PortalShell from "@/components/portal/PortalShell";
import "./portal.css";

// Next 13.5: viewport/themeColor live inside metadata (the separate `viewport` export is Next 14+).
export const metadata = {
  title: "MooMap",
  description: "Track your cattle, geofences and alerts.",
  viewport: { width: "device-width", initialScale: 1, viewportFit: "cover" },
  themeColor: "#2f2f2f",
};

export default function PortalLayout({ children }) {
  return <PortalShell>{children}</PortalShell>;
}
