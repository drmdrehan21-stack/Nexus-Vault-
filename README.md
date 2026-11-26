# NEXUS VAULT

**Save Today. Secure Tomorrow.**

A personal digital savings vault (Gullak) built with **React + Vite + Tailwind CSS**, protected by a **4-digit hashed PIN lock**, and backed permanently by **Google Sheets** via **Google Apps Script** through a secure server-side API proxy (`server.ts` / Cloudflare Pages Functions).

---

## Architecture Overview

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS (`Nexus Obsidian` dark design system)
- **Server Proxy & Auth:**
  - Node/Express (`server.ts`) for local development and Node hosting
  - Cloudflare Pages Function (`/functions/api/[[route]].ts`) for serverless Cloudflare Pages hosting
  - Stores `APPS_SCRIPT_URL`, `VAULT_ACCESS_KEY`, and `SESSION_SECRET` strictly server-side (never exposed in browser JS)
  - Issues signed `HttpOnly` session cookies (`nv_session`) after 4-digit PIN verification
- **Database:** Google Sheets (`Nexus Vault Database` with `Transactions`, `Goals`, and `Settings` worksheets)
- **Backend API:** Google Apps Script Web App (`/apps-script/Code.gs`) with salted SHA-256 PIN hashing and brute-force lockout protection

---

## 1. Google Sheets & Apps Script Setup

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet named **`Nexus Vault Database`** (keep sharing **Private / Only me**).
2. Open **Extensions → Apps Script**, replace `Code.gs` with the complete `/apps-script/Code.gs` file from this repository, and click **Save** (`Ctrl+S` / `Cmd+S`).
3. Select **`setupNexusVault`** in the function dropdown and click **Run**, approve permissions, and copy **`VAULT_ACCESS_KEY`** from the Execution Log (or set it in **Project Settings → Script Properties**).
4. Deploy as Web App:
   - **First-time:** **Deploy → New deployment** → **Web app** → **Execute as:** `Me` → **Who has access:** `Anyone` → **Deploy**.
   - **Updating an existing deployment:** **Deploy → Manage deployments** → click **Edit** (pencil icon) → Version: **New version** → **Deploy** (keeps your `/exec` URL unchanged).

---

## 2. Server Environment Configuration

Create a `.env` file locally (never commit `.env`) or set these in **AI Studio Secrets** / **Cloudflare Pages Environment Variables**:

```env
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VAULT_ACCESS_KEY=YOUR_VAULT_ACCESS_KEY
SESSION_SECRET=YOUR_RANDOM_32_BYTE_SECRET
```

- `APPS_SCRIPT_URL` and `VAULT_ACCESS_KEY` stay strictly on the server and are never bundled into frontend code.
- On launch, the app automatically connects to the server and opens directly to the **4-digit PIN lock screen**.
- First-time users create and confirm a 4-digit PIN (stored hashed on the server, never plain text).
- After 5 consecutive wrong PIN attempts, verification is temporarily locked for 5 minutes.

---

## 3. Local Development

```bash
npm install
npm run dev
```

Starts the unified Express + Vite server on `http://localhost:3000`.

---

## 4. GitHub & Cloudflare Pages Deployment

1. Push the repository to GitHub (`git push -u origin main`).
2. In **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Under **Settings → Environment variables (Production & Preview)**, add:
   - `APPS_SCRIPT_URL`
   - `VAULT_ACCESS_KEY`
   - `SESSION_SECRET`
4. Deploy. `/functions/api/[[route]].ts` automatically handles `/api/auth/*` and `/api/vault` on Cloudflare Pages.
