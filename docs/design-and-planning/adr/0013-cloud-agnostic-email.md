# ADR 0013: Cloud-agnostic email sending and delivery events

Status: Accepted (2026-10-30). Same approach as ADR 0012. Open Question 4 (which provider) stays open: this makes the choice swappable.

## Decision

The app depends on two **interfaces**, not on a provider or cloud.

### 1. Sending: SMTP submission

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS` (`none` | `starttls` | `tls`), `EMAIL_FROM`. Any provider that offers SMTP submission works (AWS SES SMTP, SendGrid, Mailgun, Postmark SMTP, a self-hosted relay), and so does Mailpit locally. Sending uses nodemailer for MIME, header-injection protection, STARTTLS and AUTH.

In production, SMTP must use TLS (`starttls` by default, port 587; or `tls`, 465) and credentials; the app refuses to boot with `SMTP_TLS=none` or without `SMTP_USER`/`SMTP_PASSWORD`. Dev defaults to `none` for Mailpit.

The Postmark HTTP API sender stays as an optional, provider-specific alternative (`POSTMARK_SERVER_TOKEN`); it is used first when set. `EmailSender` is the only seam the rest of the app sees (sign-in codes, reminders, campaigns, staff auth), and `createEmailSenderFromEnv` is the one place env becomes a sender.

### 2. Delivery events: a neutral webhook contract

Bounces and complaints feed suppression and the delivery log through one provider-neutral event (`EmailEvent`):

`POST /webhooks/email` with HTTP Basic auth (password = `EMAIL_WEBHOOK_SECRET`) and body
`{"kind":"DELIVERED"|"BOUNCED"|"COMPLAINED","hard":bool,"eventId":"...","providerMessageId?":"...","email?":"...","occurredAt?":"ISO","detail?":"..."}`.

`eventId` is the idempotency key (retries repeat it). A complaint is always treated as hard. `providerMessageId` links the event to our `Message` when the provider echoes the id we were given on send (SMTP sends return the RFC 5322 Message-ID). Hard bounces and complaints suppress the address whether or not it matches a `Message` (sign-in codes use the same provider).

`POST /webhooks/postmark` is the built-in Postmark adapter onto the same handling. A provider whose events are not in this shape (SES via SNS, SendGrid, Mailgun) gets a small adapter or a thin forwarder that posts the neutral shape; the delivery and suppression logic does not change.

## Why

- No cloud offers one email service we could rely on across providers: Google Cloud has none (and blocks outbound port 25), AWS has SES. SMTP is the lowest common denominator every provider supports.
- The previous hand-rolled SMTP client had no STARTTLS or AUTH, so it could only ever talk to Mailpit; "SMTP" was not really a portable path.
- Webhook handling was Postmark-shaped; normalising it removes the lock-in without changing suppression behaviour.

## Interim provider: Postmark, final choice before go-live

Until the provider is chosen (Open Question 4), development, test and staging use **Postmark**, because its send path and bounce webhook (`POST /webhooks/postmark`) are already built and tested. This is an interim choice, not the decision.

**Go-live gate: the provider must be decided, contracted and reviewed before any real contractor is invited.** Concretely:

- Confirm where the provider processes data (UK/EU required; I believe Postmark processes in the US, to be verified with them) and sign its data-processing terms, or switch provider.
- Add the provider to the sub-processor register.
- Verify STARTTLS/AUTH (if sending over SMTP) and the bounce/complaint flow against the real provider, in a non-production environment.
- If the provider is not Postmark, build its webhook adapter (see below) before go-live.

**Guardrails until then:**

- Use test data and your own addresses only. Postmark receives real email addresses and sign-in codes, which is personal data, so no real contractors until the gate above is passed.
- Postmark accounts are typically limited until the provider reviews them; request approval early if staging needs to email arbitrary addresses.
- Do not depend on Postmark-specific fields outside the Postmark adapter, so switching stays cheap.

**Switching later:** change environment settings (SMTP host, credentials, `EMAIL_WEBHOOK_SECRET`), plus one small adapter that posts the neutral event shape if the new provider's webhooks differ. Postmark also offers SMTP, so staying with it over the portable SMTP path is possible with no code change.

## Trade-offs / open items

- SMTP gives no event feed of its own: bounce and complaint handling depends on the chosen provider's webhooks, and needs an adapter unless the provider can post the neutral shape.
- A new runtime dependency: `nodemailer` (no transitive dependencies).
- **Not built:** an SES/SNS adapter (needs SNS signature verification and subscription confirmation), and a webhook adapter per SMTP provider. Add the one for the chosen provider. **TODO(spec): provider choice and UK/EU processing review (OQ4).**
- Provider webhooks that cannot send HTTP Basic auth need a forwarder; the secret must never be passed in the query string.
- STARTTLS and AUTH are covered by option-mapping unit tests only; the integration test against Mailpit (no TLS, no auth) covers MIME and delivery. Verify against the real provider before go-live.
