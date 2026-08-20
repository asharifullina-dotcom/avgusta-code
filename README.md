# Merchant & Payment Matcher — standalone version

A shared team site (no Claude account needed) with the same UI as the Claude prototype,
backed by a real database (Vercel KV) and calling Similarweb's API from a secure server
function (your API key never reaches the browser).

## What you need to do (click-by-click)

### 1. Put this code on GitHub
1. Go to github.com → sign up / log in.
2. Click **New repository** → name it e.g. `merchant-payment-matcher` → Create.
3. Upload all the files in this folder to that repository (drag-and-drop works on
   GitHub's "Add file → Upload files" screen, or use GitHub Desktop if you prefer).

### 2. Deploy on Vercel
1. Go to vercel.com → **Sign up** → choose "Continue with GitHub" (uses the account
   from step 1, one click, no separate password).
2. Click **Add New → Project** → select the `merchant-payment-matcher` repo → **Deploy**.
   Vercel will detect the `/api` folder automatically — no configuration needed.

### 3. Add a database (Vercel KV)
1. In your new Vercel project, go to the **Storage** tab → **Create Database** → **KV**.
2. Follow the prompts, then click **Connect** to link it to this project. Vercel
   automatically adds the required `KV_REST_API_URL` / `KV_REST_API_TOKEN` environment
   variables for you — you don't need to type these anywhere.

### 4. Add your Similarweb API key
1. In the Vercel project, go to **Settings → Environment Variables**.
2. Add a new variable: Name = `SIMILARWEB_API_KEY`, Value = your Similarweb API key
   (the same one from mcp-auth.similarweb.com). Save.
3. Go to the **Deployments** tab → click the "..." menu on the latest deployment →
   **Redeploy** (so the new environment variable takes effect).

### 5. Open your site
Vercel gives you a URL like `merchant-payment-matcher.vercel.app` — that's your shared
site. Send that link to your team; no Claude login required.

## Important: verify the Similarweb endpoints

I don't have your exact Similarweb API plan's documented endpoint paths in front of me,
so `api/_lib/similarweb.js` contains my best-effort guess at the standard endpoint
pattern, clearly marked at the top of that file. Before relying on this:

1. Log into your Similarweb account → find their API docs / Postman collection.
2. Confirm the exact path for "traffic by country" and "website technologies."
3. Update the two URLs in `api/_lib/similarweb.js` if they differ.
4. Check whether countries come back as names or numeric codes — if codes, tell me
   and I'll add a lookup table.

Everything else (the site, the database, the UI) does not depend on getting this exactly
right on the first try — only those two functions need adjusting if Similarweb's actual
response shape differs from my guess.

## Ongoing costs to check yourself (these change over time)
- **Vercel**: free "Hobby" tier covers small team internal tools; check current limits
  on serverless function invocations if your team refreshes data heavily.
- **Vercel KV**: free tier has a request/storage cap; fine for ~200 records and light use.
- **Similarweb API**: your existing subscription/plan — confirm rate limits with them.

## What changed vs. the Claude version
- Data lives in Vercel KV instead of the Claude artifact's storage — same shape, just a
  different home.
- The 🌐 and 💳 buttons now call your own `/api/refresh-countries` and
  `/api/check-payments` functions, which call Similarweb directly — no AI reasoning step,
  which is actually more predictable for structured data like this.
- The Diagnostics tab was removed (it tested a Claude-specific mechanism that doesn't
  apply here).
- Everything else — search, filters, Match tab (saved + custom lookup), CSV export — works
  the same way.
