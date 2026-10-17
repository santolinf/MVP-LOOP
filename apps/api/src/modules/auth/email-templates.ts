export interface OtpEmailInput {
  kind: "REGISTER" | "SIGN_IN";
  code: string;
  ttlMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Registration and sign-in code emails (CH-03). Plain, no links: the code is typed back into LOOP. */
export function renderOtpEmail({ kind, code, ttlMinutes }: OtpEmailInput): RenderedEmail {
  const intro =
    kind === "REGISTER"
      ? "Welcome to LOOP. Use this code to finish creating your contractor account:"
      : "Use this code to sign in to LOOP:";
  const outro = `The code expires in ${ttlMinutes} minutes and can be used once. If you did not ask for it, you can ignore this email.`;
  return {
    subject: kind === "REGISTER" ? `Your LOOP registration code: ${code}` : `Your LOOP sign-in code: ${code}`,
    text: `${intro}\n\n${code}\n\n${outro}\n`,
    html: `<p>${intro}</p><p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p><p>${outro}</p>`,
  };
}
