import { Eyebrow } from "../marketing/primitives";

export const STEP_NAMES = ["CV upload", "Profile review", "Account", "Availability", "Preferences", "GO LIVE"] as const;
const TOTAL = STEP_NAMES.length;

/** Progress for the join journey, in the V33 order: 1 CV, 2 profile review, 3 account, 4 availability, 5 preferences, 6 GO LIVE. */
export function StepBar({ step }: { step: number }) {
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {STEP_NAMES.map((n, i) => (
          <span key={n}>
            {i > 0 && " · "}
            {i + 1 === step ? <strong className="text-fg">{n}</strong> : n}
          </span>
        ))}
      </p>
      <Eyebrow>
        Step {step} of {TOTAL}
      </Eyebrow>
      <div className="mb-[30px] mt-[25px] flex gap-[7px]" role="img" aria-label={`Step ${step} of ${TOTAL}`}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`h-[5px] flex-1 rounded-full ${i < step ? "bg-lime" : "bg-[#294356]"}`} />
        ))}
      </div>
    </>
  );
}
