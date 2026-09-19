# Cloud-Score Classroom Ledger

<p align="center">
  <b>English Documentation</b> | <a href="README.md">简体中文文档</a>
</p>

<p align="center">
  <a href="https://github.com/mayunqing1230/Cloud-Score"><img src="https://img.shields.io/badge/GitHub-mayunqing1230%2FCloud--Score-blue?logo=github" alt="GitHub Repo"></a>
  <img src="https://img.shields.io/badge/Version-v1.8.0-brightgreen.svg" alt="Version: v1.8.0">
  <img src="https://img.shields.io/badge/Architecture-Serverless%20%7C%204--Files-orange.svg" alt="Serverless">
  <img src="https://img.shields.io/badge/Tests-40%2F40%20Pass-success.svg" alt="Tests">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
</p>

<p align="center">
  A lightweight, enterprise-secure, zero-framework, 4-core-file serverless classroom score management and student evaluation platform built on <b>Cloudflare Pages + Pages Functions + Cloudflare R2 Standard Object Storage</b>.
</p>

---

## 🌟 Key Features

### 1. Pure Serverless & Zero Framework
- **4 Core Files, Zero External Runtime Dependencies**: The entire platform runs on strictly 4 vanilla files (`_worker.js`, `login.html`, `admin.html`, `teacher.html`). Built with modern ES2022 JavaScript, semantic HTML5, and responsive CSS3 variables without node_modules bundles, build step artifacts, or third-party CDN scripts. Instant sub-second loading speeds.
- **Strongly Consistent R2 Storage**: Uses private Cloudflare R2 Standard strongly consistent object storage. Leverages object ETag optimistic concurrency control to prevent accidental data overwrites during simultaneous multi-teacher grading.
- **Minimalist Operations**: Only a single encrypted secret `ADMIN` is required in Cloudflare Dashboard; R2 binding name is fixed as `R2`. Zero database instances to maintain, running permanently within Cloudflare's free tier for standard school usage.

### 2. Dual-Role Architecture & Strict Permission Isolation
- **Super Administrator (`admin`)**: Manages teacher accounts (create, reset passwords, archive/restore, delete permanently), maintains class rosters, configures many-to-many teacher-class bindings, maintains periods globally, adjusts global password security policies, and publishes system announcements.
- **Teacher**: Supports self-service password changes. Manages students, scoring projects, groups, and periods within authorized classes (add, edit, reorder, soft-archive, delete permanently, and whole-class graduation purge).
- **Strict Path Whitelist & Mutual Isolation**: Only `/login`, `/admin`, `/teacher`, and `/api/*` are accessible. All unauthorized probes, hidden files, and root path requests are strictly 302 redirected to `/login.html`. Teachers cannot access the admin console; admins cannot access the teacher ledger; unauthenticated requests are strictly blocked.

### 3. Periodic Score Archiving, Bi-directional Locking & Term-End Summary Views (v1.7.1 Upgraded)
- **Bi-Weekly Cycles & Fresh Starts**: Tailored for schools conducting class meetings every two weeks. When reviewing is complete, teachers tap **[+ New Period]**. The previous cycle is automatically locked and archived, all rosters and custom evaluation projects are inherited, and score cells start fresh from zero.
- **Bi-directional Period Locking & Active Misclick Prevention (v1.7.1 New)**:
  - **Persistent Topbar Lock Button**: Always visible in regular period views, displaying `🔓 Editable (Click to Lock)` when unlocked, and `🔒 Locked (Click to Unlock)` with an amber alert style when locked; 1-click seamless toggle;
  - **Re-seal After Corrections**: Historical periods support 1-click unlocking for corrections, and teachers can actively re-lock them at any time to re-seal data as read-only;
  - **Active Cycle Freezing**: Teachers can actively lock the current active period once a grading cycle concludes, preventing accidental cell edits before a new cycle is formally created;
  - **Unsaved Draft Safety Barrier**: The system actively intercepts locking attempts if unsaved score drafts are present, prompting teachers to save first to avoid data rejection;
  - **Period Settings Modal (⚙) Quick Toggle**: Features dedicated lock/unlock actions matching current status; clicking a locked cell or pressing Enter automatically prompts for 1-click unlocking.
- **Dual-Mode Term-End Comprehensive Views**: In the period selector, choose **[📊 Term-End Grand Summary]** to review semester-long cumulative student performance across two dedicated perspectives:
  - **Mode A (By Period Comparison)**: Columns display each period's net total alongside the grand cumulative semester score (`Name | Period 1 | Period 2 | ... | Grand Total`);
  - **Mode B (By Project Cumulative)**: Columns display semester-long totals grouped by individual evaluation projects (`Name | Chinese Total | Math Total | ... | Grand Total`).
- **Seamless Backwards Compatibility**: Legacy classes are automatically and non-destructively migrated to "Period 1 (Initial Period)" on first read, guaranteeing zero data loss.

### 4. Full-Entity Physical Deletion & Graduation Purge Security Lock (v1.7.0 New)
- **Complete Permanent Physical Deletion**:
  - Supports permanent physical deletion of students, evaluation projects, groups, periods, teacher accounts, and class directories for student graduation, transfers, teacher turnover, or test data cleanup;
  - **Direct Deletion Without Archiving**: In active lists, a **[Delete]** button sits directly beside **[Archive]** for immediate cleanup, alongside permanent deletion options in archived views;
  - **Single-Request Atomic Cascading Cleanup**: Deleting a student, project, or group atomically purges all corresponding score records across current and historical periods, unbinding student group assignments in a single R2 request. Deleting a class invokes `R2.delete` to release storage completely.
- **Class Graduation Purge Security Lock**:
  - Designed for graduating senior cohorts (e.g. Grade 9 / Grade 12 departures), providing an atomic **[Class Graduation Purge]** action in Class Settings;
  - Atomically purges all student rosters and historical personal scores across all periods, while fully preserving scoring projects, periods, and class structures for incoming cohorts.
- **Triple Security Guardrail Against Accidental Purge**:
  - **Guardrail 1: 10-Second Mandatory Calm Delay**, inputs and submit buttons remain strictly disabled until the countdown finishes;
  - **Guardrail 2: Dynamic Arithmetic Challenge**, generates dynamic mixed math equations (e.g. `23 + 19 = ?` or `7 × 8 = ?`), enabling submission only upon correct calculation;
  - **Guardrail 3: Native Browser Confirmation Dialog**, providing an ultimate sanity check.
- **100% Feature Parity Between Teacher and Admin**:
  - Admin class management fully includes a **[Periods]** tab supporting creation, editing, lock toggling, archiving, and deletion;
  - All direct deletion and graduation purge actions are equally accessible in both teacher and admin panels.

### 5. Global Password Security Policy & Initial Password Tracking (v1.5.0 New)
- **Configurable Global Password Strength Policy**: Administrators can enable/disable password complexity requirements on demand with modular rules:
  - Minimum length (customizable between 6–32 characters);
  - Require uppercase letters (A-Z);
  - Require lowercase letters (a-z);
  - Require numbers (0-9);
  - Require special symbols / punctuation marks.
- **Dual-Track Exemption Architecture**: Admin account creation and password resets follow the fundamental baseline (6–128 characters) and are **exempt from custom complex policies**, making it fast and effortless for admins to hand out simple temporary passwords. Teachers modifying passwords self-service are strictly validated against the active global policy.
- **Initial Password Status Tracking & Badges**: Teacher accounts track `initialPasswordChanged` flag. Newly created teachers and reset accounts automatically display a prominent high-contrast orange badge **[Initial Password]**, while updated accounts show a soft gray **[Modified]** badge in the admin table.
- **Teacher Login Password Modal & Real-Time Rule Feedback**: Unmodified accounts automatically trigger a password change modal upon login. Supports both **Reminder Mode** (skippable) and **Mandatory Mode** (blocks exit/Esc). Features real-time dynamic checkmarks (✓/○) beneath the input field as criteria are satisfied.
- **Emergency Bulk Reset Operation**: Provides a protected **[⚠️ Require All Teachers to Reset Password]** action with double confirmation, resetting all active accounts in one click for school-wide security compliance.

### 6. Pure Frontend Multi-Level Custom Sorting & Fallback Pinyin Collation (v1.4.0 New)
- **Pure Frontend Execution**: Sorting calculations run 100% in client-side memory and rendering pipelines without extra API requests or backend storage overhead.
- **Multi-Level Custom Priority Rules**: Teachers can open the **[⚡ Advanced Sort]** modal to configure multiple sorting levels (Personal Total, Group Total, or any custom scoring project) with independent ascending/descending directions, reordering priority via intuitive [↑] and [↓] controls.
- **Mandatory Chinese Pinyin A-Z Fallback**: When records tie on all specified sorting levels, the system automatically applies an internationalized Chinese Pinyin (`Intl.Collator("zh-Hans-CN")`) ascending collation fallback, guaranteeing deterministic and stable roster ordering.
- **Visual Status Badge & Mutual Exclusion**: A colorful status badge appears above the table displaying active priority rules with a 1-click `[×]` clear button. Clicking any single column header gracefully takes precedence. Rules are persisted locally per class and automatically reset to default when switching classes.

### 7. System Announcements & Changelog Timeline (v1.3.0 New)
- **Dual Modules (Notice & Timeline)**: Admins can publish pinned announcements (with formatted text) and release changelog cards (version number, date, detailed change log).
- **Active Release vs. Silent Update**: Choose between **Publish as New Announcement** (re-triggers popup for all teachers) or **Silent Update** (fixes typos without re-prompting).
- **Native Modal with Anti-Fatigue Cookies**: Automatically pops up centered on login using native `<dialog>` elements (zero browser popup blocker issues). Supports "Do not show again unless new announcement" remembered via teacher-isolated cookies. A permanent **[📢 Announcements]** topbar button with an unread indicator allows on-demand review anytime.

### 8. Excel-like Intelligent Scoring & Conflict Resolution
- **Natural Language Score Parsing**: Table cells accept mixed Chinese/English text comments and score values (e.g., `[Active in class +2] Late -1` $\rightarrow$ net score `+1`). Only numbers with explicit `+` or `-` signs are summed; unsigned numbers (e.g. dates like `20260901`) are safely ignored with a friendly visual yellow badge.
- **Local Draft Caching & Anti-Loss Protection**: Unsaved edits are immediately preserved in `sessionStorage`, seamlessly restored after unexpected page reloads or network drops. Active uncommitted drafts trigger standard browser `beforeunload` dialogs to prevent accidental tab closing.
- **Optimistic Concurrency Conflict Arbitration**: When multiple teachers update the same student cell simultaneously, an interactive conflict resolution panel lets teachers inspect side-by-side differences and choose between server latest vs. local draft values item-by-item.

### 9. Desktop & Mobile Responsive Experience with Dark Mode
- **Universal Dark Mode**: Defaults to system color scheme (`prefers-color-scheme: dark`) with a manual ☀️/🌙/🌓 three-state toggle persisted to `localStorage`. All screens and modals feature hand-tuned eye-protective color palettes.
- **Desktop (PC)**: Sticky frozen columns (Student Name on left, Total on right, Header on top); keyboard arrow key navigation for rapid grading; centered popup drawers.
- **Mobile Responsive Layout (v1.5.1 Anti-Anomaly Design)**:
  - 44px topbar hides long URLs to prevent line breaks, overflow, or button clipping;
  - Lightweight 20px status row at the top of content scrolls out of view naturally, leaving 100% screen height for grading;
  - Compact floating toolbar (~68px height) displaying **6+ scoring projects simultaneously** with smooth horizontal swipe;
  - Top-anchored score editing drawer (`top: 12px`) completely avoiding virtual software keyboard occlusion.

### 10. Enterprise-Grade Security (v1.8.0 Upgraded)
- **Pure Mathematics Challenge Captcha**: Dynamic arithmetic challenges (addition, subtraction, multiplication) eliminating image rendering and mobile browser compatibility glitches.
- **Compound Anti-Brute-Force & Campus Network Misblock Prevention**:
  - **`IP + Account` Composite Key Lock**: 8 consecutive password failures for a specific account only lock that account for 2 minutes; other teachers sharing the same campus network outbound IP (NAT) remain completely unaffected, eliminating the "one teacher wrong, whole school locked" misblocking and student DoS vulnerability;
  - **Progressive Response Delay**: 4–5 consecutive failures enforce a 2-second server delay, and 6–7 failures enforce 4 seconds, drastically raising the time cost for automated brute-force attacks;
  - **Single-IP Wide Rate Limit**: 60 cumulative failures within 15 minutes trigger a 10-minute global network protection to guard against password spraying across accounts;
  - **Admin Security Monitor & 1-Click Unlock**: Admin console (`admin.html`) features a **[🛡️ Login Security]** modal with masked IP listings, supporting single unblocking and 1-click unlock-all.
- **Strict CSP & Cookie Standards**: Strict Content Security Policy (CSP) with inline script SHA-256 hash enforcement; Cookies strictly set to `HttpOnly; SameSite=Strict; Secure; Path=/` (with `__Host-` prefix in production).

---

## 📁 4 Core Files Inventory

The entire production system is composed of strictly 4 pure native core files with zero nested subdirectories:

```text
├── _worker.js         # Cloudflare Pages Advanced Mode backend API router & security engine
├── login.html         # Login page with theme toggle & math challenge captcha
├── admin.html         # Administrator control panel (teachers, classes, period management, password policy, announcements)
├── teacher.html       # Teacher score ledger, period lock/unlock, graduation purge, advanced sorting & password change
├── LICENSE            # MIT License text
├── README.md          # Comprehensive Chinese Documentation
└── README.en.md       # Comprehensive English Documentation
```

### R2 Private Object Storage Schema

```text
system/catalog.json            # Teacher accounts, PBKDF2 hashes, class catalog, password policies & initial status
system/announcement.json       # System announcements, version changelog timeline & release versions
classes/{classId}.json         # Class stable structure, periods, personal/group scores, revisions & receipts
sessions/{tokenHash}.json      # Opaque sessions, roles, CSRF tokens & fixed expiration timestamps
captchas/{id}.json             # Single-use challenge hashes, IP digests & expiration timestamps
guards/{ipHash}.json           # Login failure count sliding window & temporary IP ban records
```

> **Dual-Mode Management (Soft Archive vs. Permanent Deletion)**:
> - **Soft Archive (Archive)**: Temporarily stows away entities; can be 1-click restored anytime with complete score histories and group memberships intact.
> - **Permanent Deletion (Delete)**: Physically wipes entities, atomically purging all corresponding score cells across all current and historical periods within a single atomic R2 operation to avoid orphan garbage data.

---

## 📊 Supported Scale & System Boundaries

| Dimension | Recommended Limit | Description |
| :--- | :--- | :--- |
| **Active Classes** | Up to 20 classes | Suitable for multi-class grade levels |
| **Teacher Accounts** | Up to 100 teachers | Supports many-to-many permission bindings |
| **Students per Class** | Up to 100 students | Accommodates oversized classroom cohorts |
| **Projects per Class** | Up to 30 projects | Multi-dimensional evaluations |
| **Groups per Class** | Up to 20 groups | Cooperative learning group evaluations |
| **Periods per Class** | No strict limit (5–15 per semester typical) | Supports bi-weekly evaluation cycles and term summaries |
| **Cell Content Limit** | Max 500 characters, score sum max `1,000,000` | Room for detailed feedback notes |
| **Batch Save Limit** | Max 500 cell updates per API request | Handles full-class bulk submissions |

---

## 🚀 Rapid Deployment Guide

### Method 1: Cloudflare Pages Direct Upload (Recommended, Drag-and-Drop ZIP, 3-Min Setup)

1. **Obtain the 4-File ZIP Package** (Two convenient options):
   - **Option A (No Git / Recommended): Download Repository ZIP**:
     - Click the green **Code** button at the top right of the GitHub repository $\rightarrow$ **Download ZIP**;
     - Extract the downloaded archive, and use the pre-built **`Cloud-Score-upload.zip`** located in the root directory;
     - *(Note: This ZIP strictly contains `_worker.js`, `login.html`, `admin.html`, and `teacher.html` at its root with zero nested subdirectories, ready for direct Cloudflare Pages upload)*.
   - **Option B: Clone the Repository (Git Clone)**:
     ```bash
     git clone https://github.com/mayunqing1230/Cloud-Score.git
     cd Cloud-Score
     ```
     The pre-packaged `Cloud-Score-upload.zip` is directly available in the root folder; if you modify the source code, you can also run `npm run build:release` to rebuild it.

2. **Create Pages Project in Cloudflare**:
   - Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/);
   - Go to **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Direct Upload**;
   - Enter your project name (e.g. `cloud-score`), drag and drop `Cloud-Score-upload.zip`, and click Deploy.

3. **Configure R2 Bucket and Master Secret (Crucial Step)**:
   - In Cloudflare Dashboard, navigate to **R2** and click **Create bucket** (e.g. `cloud-score-data`, keep Public Access disabled);
   - Return to your Pages project $\rightarrow$ **Settings** $\rightarrow$ **Functions**:
     - **R2 bucket bindings**: Click Add binding, Variable name **must strictly be uppercase `R2`**, select your bucket;
     - **Environment variables**: Click Add variable, select Type as **Secret**, Variable name **must strictly be uppercase `ADMIN`**, enter your initial master password (20+ random alphanumeric characters recommended);
   - On the Pages project overview page, click **Deploy a new version** and upload the ZIP one more time to activate the environment bindings.

4. **Initial Login**:
   - Visit your Pages domain (`https://<project-name>.pages.dev`) or bound custom domain;
   - You will automatically be redirected to `/login.html`;
   - Enter username `admin` and the password configured in the `ADMIN` Secret, solve the arithmetic challenge, and enter the admin console.

---

### Method 2: Git Zero-Configuration Deployment

1. **Fork or Import to GitHub**:
   - Fork this repository to your GitHub account;
   - In Cloudflare Pages, choose **Connect to Git** and select your repository;
   - Build configuration (Framework preset: `None`, Build command: *leave empty*, Build output directory: *leave empty*).
2. **Configure R2 and Secret Variables**:
   - In Pages Settings $\rightarrow$ Functions, add R2 bucket binding `R2` and Secret `ADMIN`;
   - Trigger a new deployment.

---

## ❓ Frequently Asked Questions (FAQ)

### Q1: Accessing the domain returns 500 or "Static asset binding is unavailable" / "Internal Server Error"?
- **Cause**: The Pages Functions runtime cannot locate the `R2` bucket binding or the `ADMIN` Secret.
- **Solution**:
  1. Ensure the R2 binding variable name is **strictly uppercase `R2`**;
  2. Ensure the environment variable is set as **Secret** with variable name **strictly uppercase `ADMIN`**;
  3. Re-deploy the ZIP (or push a commit) after setting variables to apply changes.

### Q2: A teacher account was locked due to incorrect password attempts?
- **Cause**: Built-in compound login security defense. After 8 consecutive failed password attempts for an account on a specific IP, only that account enters a short 2-minute cooldown (other teachers sharing the same network are completely unaffected). If cumulative failures from the same IP reach 60, a 10-minute global network protection triggers.
- **Solution**: For single-account lockouts, simply wait 2 minutes for automatic restoration. Alternatively, the administrator can log in to `/admin.html`, click **[🛡️ Login Security]** in the teacher toolbar to view the locked entry, and click **[🔓 Unlock]** or **[Unlock All]** for instant recovery.

### Q3: Why does a teacher see a password change modal immediately upon login?
- **Cause**: Starting in v1.5.0, new or admin-reset accounts are tracked with an initial password state.
- **Solution**: Teachers follow the on-screen checklist to set their personal password once. After submitting, they enter the ledger directly. Admins can also toggle to "Reminder Mode" or disable the password strength policy entirely in `/admin.html`.

### Q4: How do I handle student graduation, transfers, or clearing a graduating cohort?
- **Single Student Departure/Transfer**: In the Teacher Ledger (Class Settings) or Admin Console (Students Tab), tap **[Delete]** (or **[Permanent Delete]** in archives). The student is permanently removed and all historical scores across all periods are atomically purged.
- **Graduating Cohort Departure (Graduation Purge)**: In Class Settings, tap **[Class Graduation Purge]**. After a 10-second mandatory calm delay and arithmetic challenge verification, all student names and historical scores across all periods are wiped cleanly, while all scoring projects and periods remain intact for the next class.
- **Class Deletion**: Administrators can tap **[Delete Class]** at the top of the Class Details panel in `/admin.html`. All teacher assignments are cleanly unlinked and the cloud R2 storage object is permanently deleted.

---

## 📄 License

This project is open source under the [MIT License](LICENSE). Free for personal, academic, and commercial use.
