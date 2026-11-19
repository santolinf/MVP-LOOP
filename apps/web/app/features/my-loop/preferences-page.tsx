import { useState } from "react";
import { PreferencesEditor } from "../join/preferences-form";
import { MeGate, PANEL } from "./frame";

export function PreferencesPage() {
  const [saved, setSaved] = useState(false);
  return (
    <MeGate selected="preferences" title="Preferences" intro="What you are looking for. Saving preferences does not confirm your availability.">
      {() => (
        <div className={`${PANEL} max-w-[820px]`}>
          <PreferencesEditor backTo="/my-loop" submitLabel="Save preferences" onSaved={() => setSaved(true)} />
          {saved && (
            <p role="status" className="mt-3 text-xs text-lime">
              Saved.
            </p>
          )}
        </div>
      )}
    </MeGate>
  );
}
