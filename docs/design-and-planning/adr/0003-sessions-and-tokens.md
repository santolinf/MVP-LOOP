# ADR 0003: Cookie sessions now, app tokens deferred

Status: Accepted (18 Oct 2026, plan §4.3)

## Decision
Web and Admin use httpOnly Secure SameSite=Lax cookies plus CSRF. Short JWT and rotating hashed refresh tokens are deferred with the Contractor App. Tokens, OTPs and one-touch links are stored as SHA-256 hashes. Authorisation is by ownership in the service layer (contractorId from the session).

## Why
JavaScript cannot read the cookie so XSS cannot steal the session; hashed secrets mean a database leak yields no usable credentials; session-derived IDs prevent IDOR.

## Trade-offs / open items
App auth is revisited when the app is planned.
