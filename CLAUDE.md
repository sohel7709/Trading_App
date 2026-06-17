# Zerodha Web — Claude Code Project

## Project Structure

- `frontend/` — Landing/marketing pages (React)
- `dashboard/` — Trading dashboard UI (React + components)
- `backend/` — Express.js API server (Node.js + MongoDB)
- `mobile/` — Mobile app

## Tech Stack

- **Frontend/Dashboard:** React, CSS modules
- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Package managers:** npm
- **Key features:** Live stock data, watchlist, holdings, positions, orders, P&L, fund management, live chat, price alerts, trade history

## gstack Skills

All gstack agents are available. Use `/browse` for all web browsing tasks.

### Available Slash Commands

**Discovery & Planning**
- `/office-hours` — Reframe product with six forcing questions
- `/autoplan` — Runs CEO → design → engineering review automatically
- `/plan-ceo-review` — Scope review (expand or reduce features)
- `/plan-eng-review` — Architecture and test planning
- `/plan-design-review` — Design dimension audit
- `/plan-devex-review` — Developer experience review
- `/spec` — Write a detailed spec for a feature

**Design**
- `/design-consultation` — Build complete design systems
- `/design-shotgun` — Generate 4-6 UI mockup variants
- `/design-html` — Convert mockups to production HTML
- `/design-review` — Live design audit with fixes

**Code Review & Investigation**
- `/review` — Staff engineer review; auto-fixes obvious issues
- `/codex` — Independent OpenAI review
- `/investigate` — Systematic root-cause debugging

**Testing & QA**
- `/qa` — Live browser testing with bug fixes and regression tests
- `/qa-only` — Bug reporting without code changes
- `/benchmark` — Performance baseline and comparison

**Deployment**
- `/ship` — Sync, test, audit coverage, push, open PR
- `/land-and-deploy` — Merge, CI wait, verify production
- `/canary` — Post-deploy monitoring

**Documentation**
- `/document-release` — Update docs to match shipped code
- `/document-generate` — Create missing docs (Diataxis framework)

**Security & Operations**
- `/cso` — OWASP Top 10 + STRIDE threat modeling
- `/retro` — Weekly retrospective with metrics
- `/learn` — Manage learned patterns across sessions

**Utilities**
- `/browse` — Real Chromium browser (use for ALL web browsing)
- `/careful` — Warn before destructive commands
- `/freeze` — Lock edits to one directory
- `/guard` — `/careful` + `/freeze` combined
- `/investigate` — Root-cause debugging
- `/make-pdf` — Generate PDF reports
- `/diagram` — Generate architecture/flow diagrams
- `/scrape` — Scrape web content

## Development

```bash
# Backend
cd backend && npm start

# Dashboard
cd dashboard && npm start

# Frontend
cd frontend && npm start
```

## Notes

- MongoDB connection required for backend
- Live stock data via marketDataService.js and liveDataService.js
- WebSocket used for real-time price updates and live chat

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
