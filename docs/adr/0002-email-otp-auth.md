# ADR 0002: Passwordless email OTP, separate Admin realm

Status: Accepted (18 Oct 2026, plan §4.2)

## Decision
Contractors sign in with an email OTP. Admin uses a separate auth realm with a second factor. Mobile is a contact attribute only.

## Why
No passwords to leak or reset; SMS codes are exposed to SIM-swap and SMS pumping cost. An Admin compromise is the highest-impact event, so it must not share the contractor login path.

## Trade-offs / open items
Inbox compromise equals account compromise: sessions revocable, sign-ins audited, sensitive changes need a fresh OTP. Open Question 3: email/mobile uniqueness (schema unchanged until decided).
