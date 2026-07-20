"use client";

import { useEffect, useRef, type CSSProperties } from "react";

const PARTICLES = [
  [8, 14, 0], [18, 72, 3], [31, 28, 6], [43, 84, 2], [56, 18, 8],
  [67, 61, 4], [78, 34, 10], [89, 76, 1], [96, 17, 7], [51, 51, 5],
] as const;

export default function AmbientCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    let frame: number | null = null;
    let pointerX = 0;
    let pointerY = 0;
    const render = () => {
      frame = null;
      canvasRef.current?.style.setProperty("--pointer-x", `${pointerX}px`);
      canvasRef.current?.style.setProperty("--pointer-y", `${pointerY}px`);
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerX = (event.clientX / window.innerWidth - 0.5) * 20;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 20;
      frame ??= window.requestAnimationFrame(render);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={canvasRef} className="ambient-canvas" aria-hidden="true">
      <div className="ambient-grid" />
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />
      {PARTICLES.map(([left, top, delay], index) => (
        <span
          key={`${left}-${top}`}
          className="ambient-particle"
          style={{ "--particle-left": `${left}%`, "--particle-top": `${top}%`, "--particle-delay": `${delay}s`, "--particle-size": `${index % 3 === 0 ? 4 : 2}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}
