import { AvailabilityForm } from "../features/availability/availability-form";
import { StepBar } from "../features/join/step-bar";

export function meta() {
  return [{ title: "Confirm your availability — LOOP" }];
}

export default function JoinAvailability() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-[26px] pt-[50px]">
        <StepBar step={4} />
      </div>
      <AvailabilityForm next="/join/review" />
    </>
  );
}
