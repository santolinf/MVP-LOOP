# Email: provider recipes

The app needs two things only ([ADR 0013](../design-and-planning/adr/0013-cloud-agnostic-email.md)): **SMTP submission** to send, and
(optionally) **delivery events** posted to `POST /webhooks/email` so bounces and complaints suppress addresses.
Production refuses to boot unless SMTP uses TLS and credentials.

| Variable | Notes |
| --- | --- |
| `EMAIL_FROM` | A sender on a domain you have verified with the provider. |
| `SMTP_HOST`, `SMTP_PORT` | Port 587 with `starttls`, or 465 with `tls`. |
| `SMTP_TLS` | `starttls` (default in production) or `tls`. `none` is local Mailpit only. |
| `SMTP_USER`, `SMTP_PASSWORD` | Provider SMTP credentials (store in your secret manager). |
| `EMAIL_WEBHOOK_SECRET` | Basic-auth password for the webhook, 16+ chars. Without it the endpoint refuses every call. |

For any provider, publish SPF, DKIM and DMARC for the sending domain, and keep `EMAIL_FROM` on it.

## Provider recipes

- **AWS SES (London, `eu-west-2`)**: verify the domain (Easy DKIM + custom MAIL FROM), request production access (out of
  sandbox), create SMTP credentials (`email-smtp.eu-west-2.amazonaws.com`, 587). Events: a configuration set with an
  event destination to SNS, then forward to the webhook. SNS posts its own format (and needs signature verification and
  a subscription confirmation), so it needs an adapter or a small forwarder (Lambda) that posts the neutral shape. Not
  built yet.
- **Google Cloud**: has no email service, and blocks outbound port 25 from Compute; use a third-party SMTP provider on 587.
- **SendGrid / Mailgun / Postmark (SMTP)**: use the provider's SMTP host and API-key credentials. Each has a
  webhook feature; point it at a forwarder or adapter that posts the neutral shape. Postmark's own format is already
  handled at `POST /webhooks/postmark` (`POSTMARK_WEBHOOK_SECRET`).
- **Self-hosted relay (Postfix etc.)**: possible, but deliverability and reputation become your problem.

UK/EU processing and the sub-processor register apply to whichever provider you choose (Open Question 4).

## The neutral webhook

```bash
curl -u webhook:$EMAIL_WEBHOOK_SECRET -H 'content-type: application/json' \
  -d '{"kind":"BOUNCED","hard":true,"eventId":"evt-1","email":"bounced@example.com"}' \
  http://localhost:3000/webhooks/email
```

Responds `{"status":"SUPPRESSED"|"LOGGED"|"DUPLICATE"|"IGNORED"}`. Use this to test suppression locally; Mailpit
never produces bounce events. `eventId` is the idempotency key; a retry with the same id returns `DUPLICATE`.
Fields: `kind` (`DELIVERED`|`BOUNCED`|`COMPLAINED`), `hard`, `eventId`, `providerMessageId`, `email`, `occurredAt`, `detail`.
