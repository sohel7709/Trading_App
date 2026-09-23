# Permanent AI Instructions & Rules (Trading App)

## 🚨 MANDATORY GIT WORKFLOW & PUSH RULES (NEVER FORGET)

These rules are strictly binding across ALL sessions, tasks, and conversations for this repository:

### 1. Pushing Code ("push the code", "commit and push", etc.)
- **Rule 1 (Protected Main):** NEVER push directly to the `main` branch.
- **Rule 2 (Active Target):** All daily development, feature work, and fixes MUST target `develop` (or an active `feature/*` branch).
- **Rule 3 (Zero Secrets):** Always verify `git status` before commit to ensure NO `.env`, API keys, JWT secrets, passwords, or tokens are staged.
- **Rule 4 (Conventional Commits):** Format commit messages using conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`).
- **Rule 5 (Sync First):** Always sync before pushing: `git pull origin <branch> --rebase` then `git push origin <branch>`.
- **Rule 6 (Release Approval):** Only merge `develop` into `staging` when testing/QA deployment is requested. Only merge `staging` into `main` when the user explicitly requests production release.

---

### 2. Creating Branches ("create branch", "naya branch banao", etc.)
Whenever the user asks to create a new branch:
- **DO NOT create blindly.**
- **Step 1 - Context Analysis:** Review chat history, open documents, and recent changes to identify the exact task (new feature, bug fix, testing/QA, hotfix).
- **Step 2 - Ask Clarifying Questions:**
  1. Confirm the work category (`feature/*`, `bugfix/*`, `staging`, `hotfix/*`).
  2. Propose a descriptive, context-aware branch name (e.g. `feature/dhan-token-refresh`).
  3. Confirm the base branch (default: `develop`) and merge roadmap.
- **Step 3 - Safe Execution:** Ensure working tree is clean, pull latest base branch, and create/checkout the approved branch.

Refer to [`GIT_WORKFLOW.md`](file:///Users/sohelpathan/BuildSoft/Trading_App/GIT_WORKFLOW.md) for full architecture details.
