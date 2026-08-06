# AGENTS.md — Project Constitution

> Read this file in full before every work session. It defines what we're building, the rules that cannot be broken, and how to work on this repo. If any instruction elsewhere conflicts with this file, this file wins.

---

## 1. What we're building

A **multi-tenant educational trading simulator** sold as annual licences to stock-market training institutes in India.

Students practise equity and NSE F&O trading with virtual money. Instructors run batches, assign scenarios, watch every student's live P&L, and generate progress reports. There is **no real money and no real order routing anywhere in this system.**

**Who uses it:**

| Role | What they do |
|---|---|
| Super Admin (us) | Provision institutes, manage licences, view platform health |
| Institute Admin | Manage branches, instructors, batches, billing, branding |
| Instructor | Create batches, enroll students, assign scenarios, monitor live, grade |
| Student | Trade in the simulator, journal trades, view own reports |

**What makes it sellable** is the instructor layer, not the trading screen. Free apps already do trading screens. Never deprioritise instructor features to polish student UI.

---

## 2. Build approach: new repo, port proven logic

There is an existing single-tenant prototype (Node/Express + Mongoose + Socket.IO, plus separate React marketing/dashboard apps and an Expo mobile app). It works, but every schema in it is single-tenant and it's on MongoDB.

**Decision: start a clean monorepo. Do not refactor the old one.**

Reason: multi-tenancy and the Postgres migration touch every single schema and query. Refactoring costs more than rebuilding with a clean model, and leaves tenancy bugs hiding in old code paths.

**Port from the old repo as reference, don't copy blindly:**

- Brokerage & charges calculation engine — proven, port the formulas, re-verify rates
- Order lifecycle state machine
- Corporate actions logic (dividends, splits)
- Tax P&L categorisation (STCG/LTCG/speculative)
- Expo mobile screen layouts and navigation structure
- Socket.IO event names and room patterns

Treat the old repo as documentation of business rules that already work. Read it, understand the rule, reimplement it cleanly in the new model.

---

## 3. Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (App Router), TypeScript, Tailwind |
| Backend API | Node + Express, TypeScript (separate service — Socket.IO needs a long-lived process) |
| Database | PostgreSQL |
| ORM | Prisma |
| Realtime | Socket.IO with Redis adapter |
| Jobs | BullMQ + Redis |
| Cache | Redis |
| Mobile | Expo / React Native, TypeScript |
| Payments | Razorpay |
| Storage | S3-compatible (R2 or S3) |
| Email | Transactional provider (Resend or SES) |
| Errors | Sentry |
| Charts | lightweight-charts |
| Tests | Vitest (unit/integration), Playwright (e2e) |

**Repo layout:**

```
/apps
  /web          Next.js — marketing + all authenticated web surfaces
  /api          Express + Socket.IO + BullMQ workers
  /mobile       Expo
/packages
  /db           Prisma schema, migrations, generated client, tenant guard
  /core         Domain logic: orders, margin, charges, P&L, replay clock
  /market-data  MarketDataSource interface + all vendor adapters
  /shared       Types, zod schemas, constants, enums
  /ui           Shared React components (web only)
```

Business logic lives in `/packages/core`. It must be pure and testable with no HTTP, no Prisma, no Socket.IO imports. Route handlers orchestrate; they do not calculate.

---

## 4. Hard rules — never violate

These are not preferences. Breaking any of these can end the business.

### 4.1 Tenant isolation

- Every tenant-scoped table has a non-null `tenantId`.
- **Never** call `prisma.<model>.findMany()` directly for tenant data. Always use the tenant-scoped client from `@repo/db` (`getTenantClient(tenantId)`).
- Postgres Row-Level Security is enabled on every tenant table as a second line of defence. The app is not permitted to be the only guard.
- Every new tenant-scoped model requires a matching isolation test proving Tenant A cannot read Tenant B's rows. A PR adding a tenant model without that test is incomplete.

### 4.2 Market data

- **Never** ship code that pulls data from a broker API (Dhan, Zerodha, Kotak, Fyers, Angel) and serves it to students. Broker APIs are order-execution tools; redistributing their data to third parties violates exchange data-vending policy.
- **Never** scrape TradingView, NSE website, or any site for prices. No HTML parsing of price data, ever.
- All live data comes through a licensed vendor adapter (TrueData, Global Datafeeds, Accelpix) behind the `MarketDataSource` interface.
- The system must run fully with zero live data — replay and EOD modes are first-class, not fallbacks.

### 4.3 No real money, no advice

- Wallets are simulated. No payment rail ever touches student funds. (Razorpay is only for institutes paying *us* for licences.)
- No buy/sell recommendations, tips, signals, or predictions anywhere in the product or its copy.
- Leaderboards and contests are **non-monetary only**. No cash, no prizes with cash value. Do not build a rewards system.
- Every page carries the disclaimer: educational simulator · not investment advice · simulated results do not represent actual trading.

### 4.4 No Zerodha resemblance

- No use of the names Zerodha, Kite, or any broker brand — not in code, comments, class names, routes, copy, or assets.
- Do not reproduce Kite's UI layout, colour palette, or the marketing site structure.
- If porting a component from the old repo, restyle it. Same functionality is fine; same appearance is not.

### 4.5 Personal data

- Do not collect: photos, ID documents, PAN, Aadhaar, bank details, date of birth.
- Collect only: name, email, phone (optional), institute/batch association.
- Every personal-data field must be covered by the export and delete flows (see SPEC §9).
- If a ticket seems to require collecting more than the above, stop and flag it instead of implementing.

---

## 5. Definition of Done

A ticket is done when **all** of these are true:

1. Acceptance criteria in the ticket are met.
2. TypeScript strict mode passes, no `any` without a comment explaining why.
3. Unit tests cover the business logic; integration tests cover the API route.
4. If it touches a tenant model: an isolation test exists and passes.
5. All inputs validated with zod at the boundary.
6. Errors handled — no unhandled promise rejections, no leaking internal errors to clients.
7. Auth + role check applied to every new endpoint (deny by default).
8. Audit log entry written for any state-changing admin or instructor action.
9. No secrets, keys, or tokens in code or committed config.
10. `pnpm lint && pnpm typecheck && pnpm test` passes clean.

---

## 6. Working conventions

- **One ticket per branch**, branch named `<TICKET-ID>-short-slug`.
- Conventional commits: `feat(core): add span margin approximation`.
- Migrations are additive and reversible. Never edit an applied migration.
- Seed data lives in `packages/db/seed/` and must produce two full institutes with overlapping batch names — this makes tenant bugs obvious immediately.
- Feature flags for anything that changes instructor-facing behaviour mid-term. A live classroom must never be surprised by a deploy.
- Time: store UTC, display IST. All market logic uses `Asia/Kolkata`. Never use the server's local timezone.
- Money: store paise as integers (`BigInt`). Never floats for currency. Quantities are integers.
- Prices: store as scaled integers with a per-instrument `priceScale` (decimal places). For INR instruments `priceScale = 2`, so the stored integer is paise. **Do not assume paise in shared code** — always divide by `10^priceScale`. This is what lets currency pairs quoted to 4 decimals work later without a migration. Convert at the display boundary only.

---

## 7. How to work through the backlog

`BACKLOG.md` contains phased tickets with IDs and dependencies. `SPEC.md` contains the domain model, API contracts, and algorithm definitions.

**Process for each ticket:**

1. Read the ticket and its `Depends on` chain. If a dependency isn't done, stop and say so.
2. Read the relevant SPEC section. The spec is authoritative for schema and contracts.
3. Restate what you're going to build in 3–5 lines and list the files you'll touch. **Wait for confirmation before writing code** on any ticket marked `[needs-review]`.
4. Implement. Tests alongside, not after.
5. Run the full check suite.
6. Report: what changed, what you couldn't do, what you assumed.

**When you're blocked or the spec is ambiguous:** stop and ask. Do not invent business rules — especially around margins, charges, expiry handling, or anything regulatory. A wrong margin formula that looks plausible is worse than an unfinished ticket.

**Never do these without explicit approval:**
- Add a dependency (licence must be MIT/Apache/BSD — no GPL/AGPL, this is proprietary software)
- Change the Prisma schema outside the ticket's stated scope
- Modify auth, tenancy, or RLS code
- Delete or rewrite a migration
- Change anything in §4

---

## 8. Priority order

If you have to choose what to do next and the backlog is ambiguous:

1. Anything blocking tenant isolation or auth correctness
2. Instructor-facing features (this is what we sell)
3. Simulation realism (this is what gets us kept)
4. Student UI polish
5. Everything else

Never trade correctness of the trading engine for speed. An institute's senior instructor will find a wrong margin calculation within a week, and that ends the relationship.
