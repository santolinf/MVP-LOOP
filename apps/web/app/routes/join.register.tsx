import { RegisterStep } from "../features/join/register-step";

export function meta() {
  return [{ title: "Create your account — LOOP" }];
}

export default function JoinRegister() {
  return <RegisterStep />;
}
