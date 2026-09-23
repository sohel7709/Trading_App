# Git Workflow & Branching Strategy

Yeh repository 3-tier industry-standard branching model follow karti hai: **Production**, **Testing (Staging)**, aur **Development**.

---

## 📌 Branch Structure

| Branch | Environment | Purpose |
|---|---|---|
| **`main`** | **Production** | 100% stable, live production code. Isme direct commit nahi karte. |
| **`staging`** | **Testing / QA** | Pre-production testing environment. Release se pehle final QA ke liye. |
| **`develop`** | **Development** | Daily development integration branch. Saare features yaha merge hote hain. |
| **`feature/*`** | **Local Dev** | Naye feature ya bug fix ke liye branch (develop se banti hai). |
| **`hotfix/*`** | **Urgent Prod Fix** | Production me aane wale urgent bugs ke liye (main se banti hai). |

---

## 🚀 Daily Development Workflow

### Step 1: Naya Kaam Start Karna (New Feature)
Hamesha `develop` branch se start karein:
```bash
# 1. Develop branch par switch karein aur latest pull lein
git checkout develop
git pull origin develop

# 2. Nayi feature branch banayein
git checkout -b feature/order-execution-fix
# (Example names: feature/dark-mode, feature/auth-jwt, bugfix/chart-glitch)
```

### Step 2: Code Changes & Commit
Apna code likhein aur commit karein:
```bash
git add .
git commit -m "feat: implement instant order execution logic"
```

### Step 3: Feature ko Develop me Merge karna
Kaam complete hone ke baad feature ko `develop` me merge karke push karein:
```bash
git checkout develop
git pull origin develop
git merge feature/order-execution-fix
git push origin develop

# (Optional: Feature branch delete kar sakte hain)
git branch -d feature/order-execution-fix
```

---

## 🧪 Testing Phase (Develop ➡️ Staging)
Jab features develop me ready ho jayein aur testing / QA ke liye bhejni ho:
```bash
git checkout staging
git pull origin staging
git merge develop
git push origin staging
```
*Ab staging branch par test karein.*

---

## 🚢 Production Release (Staging ➡️ Main)
Testing successful hone ke baad production par release karein:
```bash
git checkout main
git pull origin main
git merge staging
git push origin main
```

---

## 🚨 Urgent Production Hotfix (Hotfix ➡️ Main + Develop)
Agar production me koi critical issue aaye jise turant fix karna ho:
```bash
# 1. Main se hotfix branch banayein
git checkout main
git checkout -b hotfix/critical-api-fix

# 2. Fix karein aur commit karein
git commit -am "fix: resolve critical payment webhook timeout"

# 3. Main me merge karein
git checkout main
git merge hotfix/critical-api-fix
git push origin main

# 4. Same fix develop me bhi le aayein taaki code sync rahe
git checkout develop
git merge hotfix/critical-api-fix
git push origin develop

git branch -d hotfix/critical-api-fix
```
