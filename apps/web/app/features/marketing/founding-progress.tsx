import { useGetPublicConfig } from "@loop/api-client";
import { Muted } from "./primitives";

export function FoundingProgress() {
  const { data } = useGetPublicConfig();
  const f = data?.data.founding;
  if (!f) return null;
  const pct = Math.min(100, (f.claimed / f.cap) * 100);
  return (
    <div className="mb-8">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={f.cap}
        aria-valuenow={f.claimed}
        className="mb-2 h-2 w-full overflow-hidden rounded bg-line"
      >
        <div className="h-full bg-lime" style={{ width: `${pct}%` }} />
      </div>
      <Muted className="text-sm">
        {f.claimed.toLocaleString("en-GB")} of {f.cap.toLocaleString("en-GB")} places claimed
      </Muted>
    </div>
  );
}
