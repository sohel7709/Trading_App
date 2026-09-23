# Git Workflow & Strict Push Protocol

Yeh repository 3-tier industry-standard branching model follow karti hai: **Production (`main`)**, **Testing / QA (`staging`)**, aur **Development (`develop`)**.

---

## 📌 Branch Structure

| Branch | Environment | Purpose | Access Rule |
|---|---|---|---|
| **`main`** | **Production** | 100% stable, live production code. | 🔒 **PROTECTED**: Direct commit/push STRICTLY FORBIDDEN. Only merges from `staging` or `hotfix`. |
| **`staging`** | **Testing / QA** | Pre-production testing environment for QA. | 🟡 **CONTROLLED**: Only merged from `develop` when features are ready for testing. |
| **`develop`** | **Development** | Active daily development integration branch. | 🟢 **ACTIVE**: All feature branches and daily work merge here. |
| **`feature/*`** | **Local Dev** | Naye features ya enhancements ke liye branch. | 🛠️ Branch out from `develop`, merge back into `develop`. |
| **`hotfix/*`** | **Urgent Prod Fix** | Production critical bugs ke liye. | 🚨 Branch out from `main`, merge into `main` AND `develop`. |

---

## 🛡️ STRICT RULES FOR PUSHING CODE (Mandatory Rules)

Whenever code is committed or pushed (by developer or AI assistant), the following **Strict Rules MUST be strictly enforced**:

### 1. 🚫 Rule 1: NEVER Push Directly to `main`
- Production branch (`main`) par direct push ya direct commit karna sakht mana hai.
- Development work hamesha `develop` ya `feature/*` branch par hi push hoga.
- `main` par code sirf tab jayega jab `staging` par test complete ho aur user production release approve kare.

### 2. 🔐 Rule 2: Zero Secrets & Sensitive Files
- Kisi bhi commit se pehle confirm karein ki koi secret leak na ho:
  - ❌ `.env`, `.env.local`, `.env.production`
  - ❌ API Keys, JWT Secrets, Dhan Tokens, Kotak passwords, Mongo connection strings
  - ❌ Private keys, certs, credentials
- Hamesha `.env.example` update karein agar naya config add ho.

### 3. 🧹 Rule 3: Clean Staging & Sanity Checks
- Blindly `git add .` nahi karna hai agar unwanted scratch files ya test logs maujood hon.
- Commit se pehle code sanity check karein:
  - Koi syntax error ya broken imports na hon.
  - Koi merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) na bache hon.
  - Temporary console/debug clutter saaf ho.

### 4. 📝 Rule 4: Conventional Commit Messages Mandatory
Har commit message clean aur standardized format me hona chahiye:
- `feat: <description>` — Naya feature ya functionality
- `fix: <description>` — Bug fix
- `chore: <description>` — Build, dependencies, config changes
- `docs: <description>` — Documentation updates
- `refactor: <description>` — Code cleanup bina logic/feature change kiye
- `style: <description>` — UI/styling formatting

### 5. 🔄 Rule 5: Sync Before Push (Pull First)
- Remote push karne se pehle hamesha remote changes pull karein (`git pull origin <branch>`) taaki reject ya unnecessary merge conflicts na aayein.
- Normal workflow me `main` ya `staging` par `--force` push kabhi nahi karna.

---

## 🤖 AI Agent Push Protocol (Whenever user says "push the code")

Jab bhi user kahe: *"push the code"*, *"commit and push"*, ya code save/upload karne ko bole:

1. **Verify Current Branch**:
   ```bash
   git branch --show-current
   ```
   *Agar galti se `main` par ho, to turant `develop` branch par switch karein.*

2. **Inspect & Clean Status**:
   ```bash
   git status
   ```
   *Verify karein ki koi sensitive `.env` file stage na ho.*

3. **Stage Specific Files**:
   ```bash
   git add <modified-files>
   ```

4. **Conventional Commit**:
   ```bash
   git commit -m "<type>: <concise description of changes>"
   ```

5. **Sync & Push to Current Dev Branch**:
   ```bash
   git pull origin develop --rebase
   git push origin develop
   ```

6. **Status Report**:
   User ko commit hash, target branch (`develop`), aur pushed files ki clear summary provide karein.

---

## 🚀 Daily Development Commands Cheatsheet

### 1. Daily Feature Workflow
```bash
# A. Develop ko latest pull karein
git checkout develop
git pull origin develop

# B. Feature branch banayein
git checkout -b feature/order-execution-fix

# C. Code karein aur commit karein
git add .
git commit -m "feat(order): optimize instant order matching"

# D. Develop me merge karke push karein
git checkout develop
git pull origin develop
git merge feature/order-execution-fix
git push origin develop

# E. Local feature branch delete karein
git branch -d feature/order-execution-fix
```

### 2. Testing / QA Deployment (`develop` ➡️ `staging`)
```bash
git checkout staging
git pull origin staging
git merge develop
git push origin staging
```

### 3. Production Release (`staging` ➡️ `main`)
```bash
git checkout main
git pull origin main
git merge staging
git push origin main
```

### 4. Critical Hotfix on Production (`hotfix` ➡️ `main` + `develop`)
```bash
# Main se hotfix banayein
git checkout main
git checkout -b hotfix/payment-timeout

# Fix & commit
git commit -am "fix(payment): resolve webhook timeout retry"

# Merge to main & push
git checkout main
git merge hotfix/payment-timeout
git push origin main

# Merge to develop & push taaki dev bhi updated rahe
git checkout develop
git merge hotfix/payment-timeout
git push origin develop

git branch -d hotfix/payment-timeout
```
