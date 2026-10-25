import { ProfileReview } from "../features/profile-review/profile-review";

export function meta() {
  return [{ title: "Review your profile — LOOP" }];
}

export default function JoinProfile() {
  return <ProfileReview />;
}
