# Git Workflow & Agent Operating Rules

## 1. When User Says "Create Branch" (Interactive Rule)

Whenever the user asks to create a new branch (e.g., "create branch", "naya branch banao", "branch create karo"):

1. **Context & History Analysis**:
   - Inspect active files, recent commits, and chat history to identify what is currently being worked on (e.g. new feature, bug fix, testing/QA, refactoring, urgent hotfix).
   - Check current branch using `git branch --show-current`.

2. **Formulate Proposed Strategy**:
   - Determine the correct base branch:
     - Features / Fixes / Enhancements ➡️ branch off **`develop`** (and will merge back into `develop`).
     - Testing / QA verification ➡️ work with **`staging`** (merge `develop` into `staging`).
     - Urgent production bug fix ➡️ branch off **`main`** (and will merge into both `main` and `develop`).
   - Formulate 2-3 tailored branch name suggestions based on the specific feature or bug (e.g., `feature/option-chain-live-feed`, `fix/socket-reconnection`).

3. **Ask the User Interactive Clarifying Questions**:
   - Ask what type of work this is (New Feature, Bug Fix, Testing/QA, Hotfix).
   - Present recommended branch name based on the context and ask for approval or custom name.
   - Clarify the merge roadmap (e.g., "Will branch off `develop` and eventually merge back into `develop`").

4. **Safe Branch Creation**:
   - Ensure the working tree is clean or stashed before switching.
   - Pull the latest changes from the base branch (`git checkout <base> && git pull origin <base>`).
   - Create and switch to the new branch: `git checkout -b <branch-name>`.
   - Inform the user of the new active branch, base branch, and eventual merge target.

---

## 2. When User Says "Push the Code" (Push Protocol)

1. **Active Development Target: NEVER push directly to `main`**.
   - Standard development work MUST target **`develop`** or an active `feature/*` branch.
   - `main` is strictly reserved for production releases.
   - `staging` is strictly reserved for QA / pre-production validation.

2. **Pre-Push Security Protocol**:
   - ALWAYS verify that no `.env`, secret tokens, passwords, private keys, or credentials are staged.
   - Run `git status` and verify that only intended files are staged.

3. **Conventional Commits**:
   - Use standard prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`.
   - Keep messages clear, concise, and descriptive in English.

4. **Sync Before Push**:
   - Pull latest remote changes with rebase before pushing to avoid conflicts: `git pull origin <branch> --rebase`.
   - Push to `origin <branch>`.

5. **Promotion Requests**:
   - Only promote `develop` to `staging` when user explicitly requests staging/testing deployment.
   - Only promote `staging` to `main` when user explicitly approves production release.
