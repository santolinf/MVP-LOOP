import { WelcomePage } from "../features/join/welcome-page";

export function meta() {
  return [{ title: "Welcome to LOOP" }];
}

export default function Welcome() {
  return <WelcomePage />;
}
