# LitVault — free static edition (GitHub Pages + Supabase)

A community PDF library that runs **for free**:

| Part | Where it lives |
|---|---|
| Website (HTML/JS, no build step) | **GitHub Pages** |
| Logins, database, PDF storage | **Supabase** (free tier) |
| AI Librarian (Gemini key stays secret) | **Supabase Edge Function** |

Features: email + Google sign-in, upload PDFs with cover/metadata, instant search & category filter, grid/list view,
PDF preview (works on phones), secure signed-URL downloads, admin/user roles, dark mode, AI Librarian chat.

Folder layout
```
index.html, app.js, style.css     the website
config.js                         <- you paste your Supabase URL + anon key here
supabase-client.js                Supabase connection
supabase/schema.sql               run once in Supabase (tables, security rules, storage buckets)
supabase/functions/librarian/     the AI Librarian (paste into Supabase)
```

---

## Setup (about 20 minutes, all in the browser — no installs)

### 1. Create a Supabase project
1. Go to https://supabase.com → sign up → **New project** (pick any name, set a database password, choose a nearby region).
2. Wait ~2 minutes until it finishes setting up.

### 2. Create the database and storage
1. In Supabase open **SQL Editor → New query**.
2. Open `supabase/schema.sql`, copy **everything**, paste it in, click **Run**. You should see "Success".

### 3. Connect the website to Supabase
1. Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon / public key**.
2. Open `config.js` and paste both values between the quotes. Save.
   (The anon key is meant to be public. **Never** paste the `service_role` key or your Gemini key into any website file.)

### 4. Put the site on GitHub Pages
1. Create a free account at https://github.com, click **New repository**, name it e.g. `litvault`, set it **Public**, create it.
2. On the new repo page click **uploading an existing file**, drag in **all files and folders from this project**
   (`index.html`, `app.js`, `style.css`, `config.js`, `supabase-client.js`, `supabase` folder, …), then **Commit changes**.
3. Repo **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, branch **main**, folder **/ (root)**, **Save**.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/litvault/`.

### 5. Tell Supabase your site address (needed for sign-in)
Supabase → **Authentication → URL Configuration**
- **Site URL:** `https://YOUR-USERNAME.github.io/litvault/`
- **Redirect URLs → Add:** the same address (keep the trailing `/`). While testing locally you can also add `http://localhost:8000/`.

Supabase → **Authentication → Sign In / Providers → Email**: for easiest testing turn **off "Confirm email"**.
(Supabase's built-in email sender is limited to a few emails per hour; with confirmation on, sign-ups can stall.
For a real launch, keep confirmation on and add your own SMTP provider.)

### 6. Deploy the AI Librarian
1. Get a free Gemini key at https://aistudio.google.com/apikey.
2. Supabase → **Edge Functions → Deploy a new function → Via Editor**. Name it exactly **`librarian`**.
3. Replace the sample code with the contents of `supabase/functions/librarian/index.ts` and click **Deploy**.
4. Supabase → **Edge Functions → Secrets** (or Project Settings → Edge Functions) → add **`GEMINI_API_KEY`** = your key.
   Optional: **`GEMINI_MODEL`** (default `gemini-2.5-flash`; `gemini-1.5-flash` is retired).
5. Leave "Verify JWT" **on**. The function also checks that a real signed-in user is calling it.

> Dashboard labels change occasionally — if a button is named slightly differently, look for the equivalent.

### 7. Make yourself admin
Register on your site first, then in Supabase **SQL Editor** run (with your email):
```sql
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'you@example.com');
```
Admins can delete any book; regular users can delete only their own.

### Optional: Google sign-in
Google Cloud Console → APIs & Services → Credentials → **OAuth client ID (Web)**.
Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
Then Supabase → Authentication → Providers → **Google** → paste the client ID/secret → enable.
(If you don't want it, delete the Google button block in `viewAuth` in `app.js`.)

---

## Test locally before publishing
```
python -m http.server 8000      # run inside the project folder, then open http://localhost:8000/
```
(Opening `index.html` by double-clicking won't work — browsers block ES modules on `file://`.)

## How it's secured
- **Row-level security** in Postgres: anyone can browse book info; only signed-in users can read PDFs; users can only add/delete their own books; nobody can make themselves admin.
- PDFs are in a **private bucket**; previews/downloads use 5-minute signed links.
- A database trigger verifies each uploaded file really exists, is a PDF, and records the real size — the browser can't fake it.
- Bucket limits enforce **PDF only, 50 MB** (covers: JPG/PNG/WebP, 5 MB) on the server.
- The Gemini key exists only as a Supabase secret.
- All user text is HTML-escaped before display.

## Free-tier limits to know (verify current numbers on supabase.com/pricing)
- Free projects are **paused after about a week of no activity** (you can resume them in the dashboard).
- Free storage is roughly 1 GB, and free-plan uploads are capped at 50 MB per file.
- Gemini's free tier is rate-limited; the Librarian shows a friendly "busy" message when it's hit.
- The AI Librarian reads titles, authors, categories and descriptions — not the text inside PDFs.

## Before opening to the public
Public PDF-sharing sites attract copyrighted/pirated material. Add a terms page, a way to report books, and be ready to
remove content on takedown requests. Consider custom SMTP + email confirmation to deter bots.
