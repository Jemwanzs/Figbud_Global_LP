"use client";

import { m } from "motion/react";

import { VIEW, arc, continentPath, destinations, hub } from "./africa-geo";

export function AfricaMap({
  label,
  startingPoint,
  startingPointLabel,
}: {
  label: string;
  startingPoint: string;
  startingPointLabel: string;
}) {
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label={label}
        className="h-auto w-full"
      >
        <defs>
          <pattern id="africa-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="2.1" fill="var(--text-subtle)" fillOpacity="0.45" />
          </pattern>
          <radialGradient id="africa-hub-glow">
            <stop offset="0" stopColor="var(--fb-amber)" stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--fb-amber)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <path d={continentPath} fill="url(#africa-dots)" />
        <path
          d={continentPath}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {destinations.map((point, i) => (
          <g key={i}>
            <m.path
              d={arc(hub, point)}
              fill="none"
              stroke="var(--fb-amber)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeOpacity="0.7"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 1.4, delay: 0.2 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
            />
            <m.circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="var(--bg)"
              stroke="var(--fb-amber)"
              strokeWidth="2"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.4, delay: 1.1 + i * 0.09 }}
            />
          </g>
        ))}

        <circle cx={hub.x} cy={hub.y} r="60" fill="url(#africa-hub-glow)" />
        <circle
          cx={hub.x}
          cy={hub.y}
          r="16"
          fill="none"
          stroke="var(--fb-amber)"
          strokeOpacity="0.5"
          className="origin-center [transform-box:fill-box] motion-safe:animate-[fb-orbit-glow_3.2s_ease-in-out_infinite]"
        />
        <circle cx={hub.x} cy={hub.y} r="8" fill="var(--fb-amber)" />
      </svg>

      {/* Label sits to the left of the hub so it never overflows narrow screens. */}
      <div
        className="absolute -translate-y-1/2 pr-5 sm:pr-7"
        style={{ right: `${100 - (hub.x / VIEW.width) * 100}%`, top: `${(hub.y / VIEW.height) * 100}%` }}
      >
        <div className="fb-panel rounded-xl px-3 py-2 whitespace-nowrap">
          <p className="text-[0.65rem] tracking-[0.14em] text-accent uppercase">{startingPointLabel}</p>
          <p className="text-sm font-medium text-text">{startingPoint}</p>
        </div>
      </div>
    </div>
  );
}
