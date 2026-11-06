import { useNavigate } from "react-router";
import { SignInRequired } from "../auth/sign-in-required";
import { Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";
import { PreferencesEditor } from "./preferences-form";
import { StepBar } from "./step-bar";

/** Join step 5 (V33 "Preferences"). Every starred answer is required, and the server checks them again at GO LIVE. */
export function PreferencesStep() {
  const navigate = useNavigate();
  const { me, isPending, unauthenticated } = useMe();
  if (unauthenticated) return <SignInRequired message="Please sign in to set your preferences." />;
  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={5} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Your contract preferences</h1>
        <Muted className="mb-6">Tell agencies what you are looking for. Fields marked * are required.</Muted>
        {isPending || !me ? (
          <Muted>Loading…</Muted>
        ) : (
          <PreferencesEditor backTo="/join/availability" submitLabel="Continue →" onSaved={() => navigate("/join/review")} />
        )}
      </Card>
    </section>
  );
}
