import { Eyebrow } from "../marketing/primitives";

const TOTAL = 6;

/** Progress for the join journey: 1 CV, 2 profile, 3 account, 4 availability, 5 review and consent, 6 welcome. */
export function StepBar({ step }: { step: number }) {
  return (
    <>
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
