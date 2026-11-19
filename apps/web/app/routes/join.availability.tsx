import { AvailabilityForm } from "../features/availability/availability-form";

export function meta() {
  return [{ title: "What's your current situation? — LOOP" }];
}

export default function JoinAvailability() {
  return <AvailabilityForm next="/join/preferences" join />;
}
