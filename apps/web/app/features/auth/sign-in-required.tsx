import { Link, useLocation } from "react-router";
import { BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { signInPathFor } from "./return-target";

/** Shown by any signed-in-only screen when there is no session; sign-in resumes at the same route when it is allow-listed. */
export function SignInRequired({ message }: { message: string }) {
  const { pathname } = useLocation();
  return (
    <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
      <Card>
        <h1 className={PAGE_H1}>Sign in required</h1>
        <Muted className="mb-6">{message}</Muted>
        <Link to={signInPathFor(pathname)} className={BTN_SOLID}>
          Sign in
        </Link>
      </Card>
    </section>
  );
}
