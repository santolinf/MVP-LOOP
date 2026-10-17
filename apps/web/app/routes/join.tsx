import { EligibilityGate } from "../features/join/eligibility-gate";

export function meta() {
  return [{ title: "Join LOOP" }];
}

export default function Join() {
  return <EligibilityGate />;
}
