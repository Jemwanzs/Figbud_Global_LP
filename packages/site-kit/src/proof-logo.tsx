"use client";

import { useState } from "react";

/**
 * A Trusted By logo as uploaded (proportions and colours unaltered). If the
 * file can't load, the organisation's name shows instead of a broken image.
 */
export function ProofLogo({
  src,
  name,
  width,
  height,
}: {
  src: string;
  name: string;
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-center text-sm font-semibold text-slate-800">{name}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- media library files, served as uploaded
    <img
      src={src}
      alt={name}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="max-h-10 w-auto max-w-full object-contain sm:max-h-12"
    />
  );
}
