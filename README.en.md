# Cloud-Score Classroom Ledger

<p align="center">
  <b>English Documentation</b> | <a href="README.md">简体中文文档</a>
</p>

<p align="center">
  <a href="https://github.com/mayunqing1230/Cloud-Score"><img src="https://img.shields.io/badge/GitHub-mayunqing1230%2FCloud--Score-blue?logo=github" alt="GitHub Repo"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
</p>

<p align="center">
  A lightweight, enterprise-secure, zero-framework, 4-core-file serverless classroom score management and student evaluation platform built on <b>Cloudflare Pages + Pages Functions + Cloudflare R2 Standard Object Storage</b>.
</p>

---

## 🌟 Key Features

### 1. Pure Serverless & Zero Framework
- **4 Core Files, Zero External Runtime Dependencies**: Built with vanilla modern HTML5, CSS3, and ES2022 JavaScript. No bulky bundler runtime chunks, no external CDN dependencies, millisecond loading times.
- **Strongly Consistent R2 Storage**: Built purely on private Cloudflare R2 Standard object storage (instead of eventually consistent KV). Leverages object ETag optimistic concurrency control to prevent accidental data overwrites during multi-teacher scoring.
- **Minimalist Operations**: Only a single encrypted secret `ADMIN` is required in Cloudflare Dashboard; R2 binding name is fixed as `R2`. Zero SQL database maintenance needed.

### 2. Dual-Role Architecture & Strict Permission Isolation
- **Super Administrator (`admin`)**: Manages teacher accounts (create, change passwords, archive/restore), maintains class rosters, and configures many-to-many teacher-class bindings.
- **Teacher**: Supports self-service password modifications (length requirement 6–128 characters). Manages students, scoring projects, and groups within assigned classes (add, edit, reorder, soft-archive, and restore).
- **Strict Path Whitelist & Mutual Isolation**: Only `/login`, `/admin`, `/teacher`, and `/api/*` are accessible. All unauthorized probes and root path requests are strictly 302 redirected to `/login.html`. Teachers cannot access admin panel; admins cannot access teacher workbench.

### 3. Excel-like Intelligent Scoring & Conflict Resolution
- **Natural Language Score Parsing**: Table cells accept mixed Chinese/English text and score values (e.g., `[Active in class +2] Late -1` $\rightarrow$ `+1`). Only numbers with explicit `+` or `-` signs are calculated; unsigned numbers (e.g. dates like `0901`) are safely ignored with a visual yellow badge.
- **Local Draft Caching & Anti-Loss Protection**: Unsaved edits are instantly cached to `sessionStorage` and automatically restored upon reconnection or refresh. Unsaved drafts trigger standard browser `beforeunload` popups to prevent accidental tab closing.
- **Optimistic Concurrency Conflict Resolution**: When concurrent updates occur on the same cell, an interactive conflict resolution modal allows users to review and choose between server latest vs. local draft changes item-by-item.

### 4. Full Column Click Sorting & Chinese Pinyin A-Z Collation
- **Student / Group Names**: Supports cycle sorting: **Pinyin A-Z (Ascending) $\rightarrow$ Pinyin Z-A (Descending) $\rightarrow$ Default Roster Order** using the international `Intl.Collator("zh-Hans-CN")` standard.
- **Score Items & Totals**: All custom score items, Personal Total, and Group Total columns support **Descending (High to Low) $\rightarrow$ Ascending (Low to High) $\rightarrow$ Default Order** cycle sorting with real-time recalculation of unsaved drafts.

### 5. Desktop & Mobile Responsive Optimization
- **Desktop (PC)**: Sticky frozen columns (Name on left, Total on right, Header on top); keyboard arrow key navigation; centered popup modals.
- **Mobile (Phone)**:
  - Ultra-compact floating toolbar (~68px height);
  - High-density table layout accommodating **6+ scoring projects on a single screen** with smooth horizontal scrolling for 10+ items;
  - Top-anchored score editing drawer (`top: 12px`) completely avoiding virtual software keyboard occlusion.

### 6. Enterprise-Grade Security
- **Pure Mathematics Challenge Captcha**: Dynamic arithmetic challenge (addition, subtraction, multiplication) eliminating image rendering and mobile browser compatibility glitches.
- **Brute-force IP Temporary Ban**: 8 consecutive password failures trigger a 15-minute temporary IP ban (stored hashed in R2 without exposing raw IP).
- **Strict CSP & Cookie Standards**: Strict Content Security Policy (CSP) with inline script SHA-256 hash enforcement; Cookies strictly set to `HttpOnly; SameSite=Strict; Secure; Path=/` (with `__Host-` prefix in production).

---

## 📁 4 Core Files Inventory

The entire platform is composed of strictly 4 pure native core files with zero subdirectories:

```text
├── _worker.js         # Cloudflare Pages Advanced Mode backend API & routing
├── login.html         # Login page with math challenge captcha
├── admin.html         # Administrator control panel
├── teacher.html       # Teacher score ledger & class management workbench
├── README.md          # Detailed Chinese Documentation
└── README.en.md       # Detailed English Documentation
```

### R2 Private Object Storage Structure

```text
system/catalog.json            # Teachers, PBKDF2 hashes, class catalog & bindings
classes/{classId}.json         # Class structure, personal/group scores, revisions & receipts
sessions/{tokenHash}.json      # Opaque sessions, roles, CSRF tokens & expirations
captchas/{id}.json             # Single-use challenge hashes, IP digests & expirations
guards/{ipHash}.json           # Login failure count window & temporary IP bans
```

> **Note**: All students, projects, and groups use globally stable random IDs (`s_*`, `p_*`, `g_*`). Deletions are implemented as "soft archives", preserving all historical scoring data mapped to stable IDs.

---

## 📊 Scale & System Boundaries

| Dimension | Recommended Boundary |
| :--- | :--- |
| **Active Classes** | Up to 20 classes |
| **Teacher Accounts** | Up to 100 teachers |
| **Students per Class** | Up to 100 students |
| **Projects per Class** | Up to 30 projects |
| **Groups per Class** | Up to 20 groups |
| **Cell Content Limit** | Max 500 characters, absolute sum max `1,000,000` |
| **Batch Save Limit** | Max 500 cell updates per API request |

---

## 🚀 Deployment Guide

### Method 1: Cloudflare Pages Direct Upload (Recommended, Drag-and-Drop ZIP)

1. **Prepare 4-File ZIP**:
   Zip the 4 files `_worker.js`, `login.html`, `admin.html`, and `teacher.html` into a single ZIP archive.

2. **Create Pages Project in Cloudflare**:
   - Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/);
   - Navigate to **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Direct Upload**;
   - Enter your project name (e.g. `cloud-score`), upload the 4-file ZIP, and deploy.

3. **Configure R2 Bucket and Secret**:
   - In Cloudflare Dashboard, go to **R2** and create a private bucket (e.g. `cloud-score-r2`, keep Public Access disabled);
   - Go to your Pages project $\rightarrow$ **Settings** $\rightarrow$ **Functions**:
     - Under **R2 bucket bindings**, add a binding: Variable name **must** be `R2`, select your bucket;
     - Under **Environment variables**, add a variable (Type: **Secret**): Variable name `ADMIN`, Value: your strong master password (20+ random characters recommended);
   - Re-upload the ZIP once to make the bindings take effect.

4. **Initial Login**:
   - Visit your Pages domain (or custom domain). You will be redirected to `/login.html`;
   - Login with username `admin` and the password configured in `ADMIN` Secret.

---

### Method 2: Git Zero-Configuration Deployment

1. **Connect GitHub Repository**:
   - Fork or push this repository to GitHub;
   - In Cloudflare Pages, choose **Connect to Git** and select this repo;
   - Build configuration (leave everything blank):
     - **Framework preset**: `None`
     - **Build command**: *(leave empty)*
     - **Build output directory**: *(leave empty)*
2. **Configure R2 Binding and Secret**:
   - Add R2 bucket binding `R2` and Secret `ADMIN` in Pages project settings;
   - Deploy.

---

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
