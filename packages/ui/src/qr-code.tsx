import { useMemo } from "react";
import { encodeQr } from "./qr-encode.js";

const QUIET_ZONE = 4; // modules of white border scanners need around the code

/** Renders text as a QR code. Always black on white with a quiet zone, so phones can scan it in dark mode too. */
export function QrCode({ value, label, size = 200 }: { value: string; label: string; size?: number }) {
  const { path, extent } = useMemo(() => {
    const grid = encodeQr(value);
    let d = "";
    grid.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }),
    );
    return { path: d, extent: grid.length + 2 * QUIET_ZONE };
  }, [value]);

  return (
    <svg className="qr" role="img" aria-label={label} viewBox={`0 0 ${extent} ${extent}`} width={size} height={size} shapeRendering="crispEdges">
      <rect width={extent} height={extent} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
