# ADR 0005: Uploads quarantined; AI constrained

Status: Accepted (18 Oct 2026, plan §4.5, 4.6)

## Decision
CVs go quarantine, type/magic-byte check, ClamAV, then promote, in a private bucket with short-lived presigned URLs. Text extraction is bounded and runs in the worker. The LLM has fixed output schema, no tools or network, evidence excerpts must appear verbatim in the CV, and the contractor confirms before anything is stored.

## Why
A CV is attacker-controlled input to parsers and an LLM; the worst a malicious CV can do is wrong suggestions for its own author.

## Trade-offs / open items
LLM provider region and retention: Open Question 4.
