import type { AvailabilityColour } from "@loop/contracts";

const META: Record<AvailabilityColour, { label: string; icon: string; className: string }> = {
  LIME: { label: "Available now", icon: "✓", className: "bg-lime-100 text-lime-900" },
  ORANGE: { label: "Available soon", icon: "◔", className: "bg-orange-100 text-orange-900" },
  RED: { label: "Unavailable", icon: "✕", className: "bg-red-100 text-red-900" },
  BLUE: { label: "Permanent, open to contract", icon: "▣", className: "bg-blue-100 text-blue-900" },
  GREY: { label: "Unconfirmed", icon: "?", className: "bg-gray-100 text-gray-800" },
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
