import type { AvailabilityColour } from "@loop/contracts";

const META: Record<AvailabilityColour, { label: string; icon: string; className: string }> = {
  LIME: { label: "Available Now", icon: "✓", className: "bg-panel-2 text-lime" },
  ORANGE: { label: "Available soon", icon: "◔", className: "bg-panel-2 text-orange" },
  RED: { label: "Unavailable", icon: "✕", className: "bg-panel-2 text-red" },
  BLUE: { label: "Permanently Employed", icon: "▣", className: "bg-panel-2 text-blue" },
  GREY: { label: "Unconfirmed", icon: "?", className: "bg-panel-2 text-grey" },
};

/** Colour is always rendered with label + icon; the colour value comes from the API. */
export function AvailabilityBadge({ colour }: { colour: AvailabilityColour }) {
  const m = META[colour];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${m.className}`}>
      <span aria-hidden="true">{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}
