import { useRef, useState } from "react";

interface Props {
  onChange: (x: number, y: number) => void;
}

/** Large, thumb-friendly virtual joystick with elastic knob. */
export function Joystick({ onChange }: Props) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const pointer = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width / 2 - 12;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / max, dy / max);
  };

  const end = () => {
    pointer.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={base}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setActive(true);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      className={`relative size-36 rounded-full border transition-opacity duration-200 sm:size-40 ${
        active ? "opacity-100" : "opacity-70"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--card) 82%, transparent), color-mix(in oklab, var(--muted) 60%, transparent))",
        borderColor: "var(--glass-border)",
        boxShadow: "var(--shadow-soft)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div className="pointer-events-none absolute inset-4 rounded-full border border-border/60" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/90 ring-4 ring-primary/20"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          transition: active ? "none" : "transform 0.25s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: "0 6px 18px -6px oklch(0.4 0.08 190 / 0.7)",
        }}
      />
    </div>
  );
}