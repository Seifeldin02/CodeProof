"use client";

import { useCallback, type CSSProperties, type PointerEvent } from "react";

const PARTICLES = [
  [8, 14, 0], [18, 72, 3], [31, 28, 6], [43, 84, 2], [56, 18, 8],
  [67, 61, 4], [78, 34, 10], [89, 76, 1], [96, 17, 7], [51, 51, 5],
] as const;

export default function AmbientCanvas() {
  const move = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    event.currentTarget.style.setProperty("--pointer-x", `${x * 20}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${y * 20}px`);
  }, []);

  return (
    <div className="ambient-canvas" aria-hidden="true" onPointerMove={move}>
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
