# 🍽️ Dinner Decider

A lightweight, family-friendly webapp to maintain a list of common meals and plan dinners for the next seven days.

Hosted as a **static site on GitHub Pages** with **Supabase** as the back end.

---

## Features

- **Meal library** — store each meal's name, reference (book title, website URL, etc.) and cuisine style (Indian, Asian, Italian, …)
- **Weekly planner** — pick a meal for each of the next 7 days and add optional notes
- **Family collaboration** — share a short family code so everyone plans together
- **Microsoft login** — sign in with any personal Microsoft account (Outlook, Hotmail, Live)

---

## Architecture

```
Browser (GitHub Pages)
  └─ index.html + style.css + app.js
       └─ Supabase JS SDK (loaded from CDN)
            ├─ Supabase Auth  ← Microsoft OAuth (Azure AD)
            └─ Supabase DB    ← PostgreSQL with Row-Level Security
```

All data is stored in your own Supabase project. The static files are served for free from GitHub Pages. There is no custom back-end server.

---

## Setup guide

### 1 — Fork / clone this repository

```bash
git clone https://github.com/<you>/Dinner-Decider.git
cd Dinner-Decider
```

Enable **GitHub Pages** in repository Settings → Pages → Deploy from branch `main` (root `/`).
Your site will be available at `https://<username>.github.io/Dinner-Decider/`.

---

### 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New project**, choose a name and region, set a database password.
3. Wait for provisioning (~1 minute).

---

### 3 — Run the database schema

1. In your Supabase project, open the **SQL Editor**.
2. Paste the contents of `supabase-schema.sql` and click **Run**.

This creates four tables (`families`, `user_families`, `meals`, `meal_plans`) and all Row-Level Security policies.

---

### 4 — Register an Azure app for Microsoft sign-in

> Microsoft personal accounts (Outlook, Hotmail, Live) require an Azure app registration.

1. Go to the [Azure Portal](https://portal.azure.com) and sign in.
2. Open **Azure Active Directory → App registrations → New registration**.
3. Fill in:
   - **Name**: Dinner Decider (or any name)
   - **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts*
   - **Redirect URI**: type `Web` and leave the value blank for now.
4. Click **Register** and note the **Application (client) ID**.
5. Go to **Certificates & secrets → New client secret**, set an expiry, copy the **Value** (shown only once).
6. Go to **Authentication → Add a platform → Web** and add the Supabase callback URL:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   (Replace `<project-ref>` with your Supabase project reference, visible in Project Settings → General.)
7. Save.

---

### 5 — Enable the Azure provider in Supabase

1. In Supabase, go to **Authentication → Providers → Azure**.
2. Toggle **Azure Enabled** on.
3. Enter:
   - **Application (client) ID** — from step 4
   - **Application (client) secret** — from step 4
4. Save.
5. Go to **Authentication → URL Configuration** and add your GitHub Pages URL to **Redirect URLs**:
   ```
   https://<username>.github.io/Dinner-Decider/
   ```

---

### 6 — Configure the app

Open `app.js` and replace the two placeholders near the top of the file:

```js
const SUPABASE_URL      = 'https://<project-ref>.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhb...';   // anon / public key
```

Both values are found in Supabase **Project Settings → API**.

---

### 7 — Deploy

```bash
git add app.js
git commit -m "feat: add Supabase config"
git push
```

GitHub Actions will publish the site automatically. Visit your GitHub Pages URL to start using the app.

---

## Usage

1. **Sign in** with your Microsoft account.
2. **Create a family** by choosing a unique code (e.g. `SMITH2024`) and a display name, or **join** an existing family by entering a code someone shared with you.
3. On the **Meals** tab, add your common meals — name, cuisine style, and an optional reference.
4. On the **This Week** tab, assign meals to each of the next 7 days and add any notes, then press **Save**.

All family members who share the same code see and edit the same meals and plan in real time.

---

## Project structure

```
index.html          Main single-page application
style.css           All styles (responsive, mobile-friendly)
app.js              Application logic (auth, meals, planner)
supabase-schema.sql Database schema + Row-Level Security policies
README.md           This file
```

---

## Tech stack

| Layer    | Technology |
|----------|-----------|
| Hosting  | GitHub Pages (static) |
| Auth     | Supabase Auth + Microsoft / Azure OAuth |
| Database | Supabase (PostgreSQL) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| SDK      | `@supabase/supabase-js` v2 (CDN) |

No build step, no framework, no Node.js required.

---

## Security notes

- All database tables have **Row-Level Security** enabled — users can only read and write data for families they belong to.
- The Supabase **anon key** is safe to include in client-side code; it cannot bypass RLS.
- Keep your Supabase **service role key** private — it is not used here.
