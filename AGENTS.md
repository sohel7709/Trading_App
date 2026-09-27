# Permanent AI Instructions & Rules (Trading App)

## 🚨 MANDATORY GIT WORKFLOW & PUSH RULES (NEVER FORGET)

These rules are strictly binding across ALL sessions, tasks, and conversations for this repository:

### 1. Pushing Code ("push code", "commit and push", etc. — FULLY AUTOMATIC)
- **Zero Manual PRs:** The user wants all PRs and merges completely automated. Whenever asked to push code:
  1. Commit and push cleanly to the active feature branch.
  2. Automatically merge the feature branch into `develop` and push to `origin develop`.
  3. Automatically merge `develop` into `staging` and push to `origin staging` (so Railway auto-deploys instantly).
  4. Return the user back to their active working branch so they can keep coding seamlessly.
- **Rule 1 (Protected Main):** NEVER auto-push directly to `main`. `main` is production release only upon explicit user request.
- **Rule 2 (Zero Secrets):** Always verify `git status` before commit to ensure NO `.env`, API keys, JWT secrets, passwords, or tokens are staged.
- **Rule 3 (Conventional Commits):** Format commit messages using conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`).
- **Rule 4 (Sync First):** Always sync before pushing: `git pull origin <branch> --rebase` then `git push origin <branch>`.

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
