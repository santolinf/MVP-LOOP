import { CvStep } from "../features/join/cv-step";

export function meta() {
  return [{ title: "Upload your CV — LOOP" }];
}

export default function JoinCv() {
  return <CvStep />;
}
