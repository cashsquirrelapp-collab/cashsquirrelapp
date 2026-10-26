# กระรอกตุนเงิน (Krarok)

Before any change people can see, read [DESIGN.md](DESIGN.md): colours and their roles, type, the chat card anatomy,
layout rules and the owner's standing rules (phones unchanged unless asked, desktop parity, no overlapping text,
the mascot is never redrawn, formal Thai UI copy).

- Production deploys from `main`. Owner, 2026-10-27: deploy automatically once every check passes (lint, type-checks,
  unit and browser tests, text overlap, phones unchanged unless intended). Ask the owner first for anything that needs an
  owner-only step (SQL, Stripe, secrets) or changes payments or prices.
- Never put API keys, passwords or other secrets in the frontend, logs or this repository.
