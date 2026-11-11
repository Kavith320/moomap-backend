"use client";
// Cattle photo with a hoof-print placeholder, and the credit for photos that need attribution.
import HoofPrint from "@/components/portal/HoofPrint";
import { mediaUrl } from "@/lib/portal";

export default function CattlePhoto({ cattle, variant = "cover", showCredit = true }) {
  const src = mediaUrl(cattle && cattle.Image);
  const alt = cattle ? `Photo of ${cattle.name || cattle.cattleId}` : "";

  if (variant === "avatar") {
    return (
      <span className="pt-avatar-photo">
        {src ? <img src={src} alt="" loading="lazy" /> : <HoofPrint size={18} />}
      </span>
    );
  }

  return (
    <div className="pt-photo">
      {src ? <img src={src} alt={alt} loading="lazy" /> : <HoofPrint size={40} />}
      {src && showCredit && cattle.imageCredit && (
        <span className="pt-photo-credit">
          {cattle.imageSourceUrl ? (
            <a href={cattle.imageSourceUrl} target="_blank" rel="noopener noreferrer">
              {cattle.imageCredit}
            </a>
          ) : (
            cattle.imageCredit
          )}
        </span>
      )}
    </div>
  );
}
