# NEXUS VAULT

**Save Today. Secure Tomorrow.**

A personal digital savings vault (Gullak) built with **React + Vite + Tailwind CSS**, backed permanently by **Google Sheets** via **Google Apps Script**, and ready for **GitHub** and **Cloudflare Pages** deployment.

---

## Architecture Overview

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS (`Nexus Obsidian` dark design system)
- **Database:** Google Sheets (`Nexus Vault Database` with `Transactions`, `Goals`, and `Settings` worksheets)
- **Backend API:** Google Apps Script Web App (`/apps-script/Code.gs`)
- **Hosting:** Cloudflare Pages (static build from `dist/`, zero paid server costs)

---

## 1. Google Sheets Database Setup

1. Open [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Rename the spreadsheet to: **`Nexus Vault Database`**
3. Keep the spreadsheet sharing permissions strictly **Private (Restricted / Only me)**. Never make the spreadsheet public.

The `setupNexusVault()` function in `apps-script/Code.gs` automatically creates and formats all three required worksheets:

| Worksheet | Columns |
| --- | --- |
| `Transactions` | `ID`, `Date`, `Amount`, `Note`, `CreatedAt` |
| `Goals` | `GoalID`, `GoalName`, `TargetAmount`, `CreatedAt`, `UpdatedAt` |
| `Settings` | `Key`, `Value` |

---

## 2. Google Apps Script Backend Installation & Deployment

1. Inside your **Nexus Vault Database** Google Sheet, click **Extensions → Apps Script**.
2. Delete any boilerplate inside `Code.gs` and paste the **entire** contents of `/apps-script/Code.gs` from this repository.
3. *(Optional)* To apply the timezone and runtime settings, enable **Project Settings → Show "appsscript.json" manifest file in editor** and paste `/apps-script/appsscript.json`.
4. **Important:** Click **Save** (`Ctrl+S` / `Cmd+S`) first. The Apps Script function dropdown only updates after saving the file.
5. In the function selector dropdown at the top, choose **`setupNexusVault`** and click **Run**.
6. Approve the Google permissions prompt for your own account.
7. Open the **Execution Log** and copy your generated **`VAULT_ACCESS_KEY`** (or set your own custom passphrase in **Project Settings → Script Properties → `VAULT_ACCESS_KEY`**).
   - `setupNexusVault()` automatically creates the `Transactions`, `Goals`, and `Settings` sheets with headers, sets `currency = INR`, removes an empty default `Sheet1`, and generates `VAULT_ACCESS_KEY`.
   - Even if you configure `VAULT_ACCESS_KEY` manually in **Script Properties**, `Code.gs` also auto-initializes any missing worksheets on the first API request.
8. Deploy the API as a Web App:
   - **First-time deployment:** Click **Deploy → New deployment** → select **Web app** → Description: `Nexus Vault API v1` → **Execute as:** `Me` → **Who has access:** `Anyone` → **Deploy**.
   - **Updating an existing deployment:** Click **Deploy → Manage deployments** → click the pencil (**Edit**) icon → Version: **New version** → **Deploy** (this keeps your existing `/exec` Web App URL unchanged).
   - Copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).

> **Security Note:** Setting "Who has access: Anyone" allows your Cloudflare Pages browser client to call the Apps Script endpoint without Google sign-in cookie issues, while your Google Sheet stays 100% private and every API request is authenticated server-side against `VAULT_ACCESS_KEY` in `ScriptProperties` using constant-time comparison. Never hardcode `VAULT_ACCESS_KEY` into frontend JavaScript.

---

## 3. Google Apps Script CORS Architecture

Google Apps Script Web Apps do **not** answer `OPTIONS` CORS preflight requests. Sending standard `Content-Type: application/json` or custom headers like `Authorization` from a browser triggers a preflight `OPTIONS` check and fails with a CORS error.

Nexus Vault solves this in `/src/services/vaultApi.ts` by:
1. Sending `POST` requests with `Content-Type: text/plain;charset=utf-8` (a CORS-safelisted simple request header that skips `OPTIONS` preflight).
2. Passing `accessKey` inside the HTTPS JSON request body rather than custom HTTP headers.
3. Setting `redirect: 'follow'` so Apps Script's `302` redirect to `script.googleusercontent.com` completes and returns valid JSON with `Access-Control-Allow-Origin: *`.

---

## 4. Frontend API Configuration & Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file from `.env.example` (never commit `.env`):
   ```env
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`, enter your `VAULT_ACCESS_KEY` (kept strictly in React memory, never written to `localStorage`), and unlock your vault.

---

## 5. GitHub Export Instructions

```bash
git init
git add .
git commit -m "Initial commit: Nexus Vault"
git branch -M main
git remote add origin https://github.com/<your-username>/nexus-vault.git
git push -u origin main
```

---

## 6. Cloudflare Pages Deployment

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Select your `nexus-vault` GitHub repository.
3. Configure build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Under **Environment variables (Production & Preview)**, add:
   - `VITE_APPS_SCRIPT_URL` = `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`
5. Click **Save and Deploy**.

The included `/public/_redirects` file (`/* /index.html 200`) ensures clean SPA routing on Cloudflare Pages.
