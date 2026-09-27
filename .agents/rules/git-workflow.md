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

## 2. When User Says "Push the Code" (Fully Automated Pipeline)

The user wants all PRs and merges completely automated. Whenever asked to push code:

1. **Pre-Push Security Protocol**:
   - ALWAYS verify that no `.env`, secret tokens, passwords, private keys, or credentials are staged.
   - Run `git status` and verify that only intended files are staged.

2. **Commit with Conventional Prefix**:
   - Use standard prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`.

3. **Automated Multi-Branch Sync (Zero Manual PRs)**:
   - **Step A:** Push to the active feature branch (`git pull origin <branch> --rebase && git push origin <branch>`).
   - **Step B:** Switch to `develop`, pull latest, merge the feature branch cleanly, and push to `origin develop`.
   - **Step C:** Switch to `staging`, pull latest, merge `develop`, and push to `origin staging` (triggering Railway cloud deployment automatically).
   - **Step D:** Switch back to the active working branch so the user can continue development without interruption.

4. **Production Protection**:
   - `main` remains protected for official production release. Only merge `staging` into `main` when the user explicitly requests production release.
