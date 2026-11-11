"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

// Bottom sheet on phones, centred dialog on larger screens.
export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="pt-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pt-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="pt-modal-head">
          <h2>{title}</h2>
          <button type="button" className="pt-icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="pt-modal-body">{children}</div>
        {footer && <div className="pt-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
