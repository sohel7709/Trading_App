# Git Workflow & Push Rules

Whenever the user instructs to push code, commit changes, or deploy:

1. **Active Development Target: NEVER push directly to `main`**.
   - All standard development, bug fixes, and feature additions MUST target the `develop` branch (or an active `feature/*` branch).
   - `main` is strictly reserved for production releases.
   - `staging` is strictly reserved for QA / pre-production validation.

2. **Pre-Push Security Protocol**:
   - ALWAYS verify that no `.env`, secret tokens, passwords, private keys, or credentials are staged.
   - Run `git status` and verify that only intended files are staged.

3. **Conventional Commits**:
   - Use standard prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`.
   - Keep messages clear, concise, and descriptive.

4. **Sync Before Push**:
   - Pull latest remote changes with rebase before pushing to avoid conflicts: `git pull origin develop --rebase`.
   - Push to `origin develop` (or current feature branch).

5. **Promotion Requests**:
   - Only promote `develop` to `staging` when user explicitly requests staging/testing deployment.
   - Only promote `staging` to `main` when user explicitly approves production release.
