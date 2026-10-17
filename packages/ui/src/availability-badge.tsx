import type { AvailabilityColour } from "@loop/contracts";

const META: Record<AvailabilityColour, { label: string; icon: string; className: string }> = {
  LIME: { label: "Available now", icon: "✓", className: "bg-panel-2 text-lime" },
  ORANGE: { label: "Available soon", icon: "◔", className: "bg-panel-2 text-orange" },
  RED: { label: "Unavailable", icon: "✕", className: "bg-panel-2 text-red" },
  BLUE: { label: "Permanent, open to contract", icon: "▣", className: "bg-panel-2 text-blue" },
  GREY: { label: "Unconfirmed", icon: "?", className: "bg-panel-2 text-grey" },
};

/** Colour is always rendered with label + icon; the colour value comes from the API. */
export function AvailabilityBadge({ colour }: { colour: AvailabilityColour }) {
  const m = META[colour];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm ${m.className}`}>
      <span aria-hidden="true">{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}
