// Cloven-hoof print icon (cattle), drawn to match lucide-react icons:
// 24x24 grid, stroke = currentColor, round caps/joins. Accepts the same basic props
// as a lucide icon (size, strokeWidth, color, className, style, aria-*).
export default function HoofPrint({ size = 24, strokeWidth = 2, color = "currentColor", ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    >
      {/* two pointed toes of the split hoof; the gap widens toward the front */}
      <path d="M10.2 3C7.3 5 5.3 9 5.3 12.8c0 3 1.5 4.8 3.5 4.8 1.3 0 2-1 2-2.6 0-5-.1-9-.6-12z" />
      <path d="M13.8 3c2.9 2 4.9 6 4.9 9.8 0 3-1.5 4.8-3.5 4.8-1.3 0-2-1-2-2.6 0-5 .1-9 .6-12z" />
      {/* dewclaws */}
      <circle cx="7.8" cy="21.2" r="1.1" fill={color} stroke="none" />
      <circle cx="16.2" cy="21.2" r="1.1" fill={color} stroke="none" />
    </svg>
  );
}
