# Test results · 2026-09-06

Environment: Node 24.19.0 runtime, Python 3.12.13, PGlite 0.5.8 (PostgreSQL WASM), Vitest/jsdom. No real credentials or investment data used.

| Check | Result |
|---|---|
| `python -m pytest -q` | 31 passed |
| `npm test` | 12 passed, 3 files |
| `npm run test:db` | 8 passed (all integration scenarios) |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `ruff check jobs` | passed |
| `mypy jobs` | passed, 9 source files |
| `npm run build` | passed; chunk size warning retained |
| `scripts/check-build.mjs` | passed, no synthetic fixture/server key/private payload in bundle |
| `python hello.py` | passed |
| original hello/workflow diff | unchanged |
| cloud browser | overview/Amazon DOM and screenshot inspected; later interaction run timed out |
| fixed viewport Playwright suites | written for 1440×900 and 1920×1080; not run here |
| live Google/Supabase/Storage integration | not run, credentials absent |
| GitHub-hosted CI | not run, local branch not pushed |
| 3-viewer/90-day production performance | not measured |

Test IDs covered: T01–T12, T19–T25 (relevant M0–M2 paths), T27, T30. T13–T18 and T26/T29 require later modules or live operations. No historical ranks, fees or revenue estimates were invented.

PGlite tests validate actual PostgreSQL constraints, functions and policies against an isolated `auth.users`/`auth.uid()` test harness. They do not test Google identity verification, Supabase gateway configuration or hosted Storage. Web connected-state tests mock the API and keep synthetic payloads in test code only.

Original specification Markdown hard-break spaces and CSV CRLF line endings are preserved intentionally. Other authored files pass git diff whitespace checks. CI targets Node 22; its remote run remains pending.
