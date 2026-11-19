import { PreferencesStep } from "../features/join/preferences-step";

export function meta() {
  return [{ title: "Your contract preferences — LOOP" }];
}

export default function JoinPreferences() {
  return <PreferencesStep />;
}
