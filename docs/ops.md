# Running HQ — setup and operations

Plain-language steps for the owner, plus reference for whoever maintains HQ.
**Never paste keys, secrets or passwords into chat.** They go only where these steps say.

---

## Part 1 — One-time setup (owner, about an hour)

You need: your luke@pettyhomes.com Google account (Workspace admin) and your GitHub account
(lukepettersen).

### A. Google sign-in (Google Cloud)

1. Go to **console.cloud.google.com** and sign in as **luke@pettyhomes.com**.
2. Top bar → project picker → **New project** → name it **Petty Homes HQ** → Create. Make
   sure it's selected.
3. Menu → **APIs & Services → OAuth consent screen** (may be called **Google Auth
   Platform**). Choose **Internal** (only pettyhomes.com accounts). App name **Petty Homes
   HQ**, support email luke@pettyhomes.com. Save.
4. **Credentials → Create credentials → OAuth client ID** → type **Web application** → name
   **HQ**.
   - Under **Authorized redirect URIs** add the address Railway gives you in step B5, ending
     in `/api/auth/callback/google`, for example
     `https://pettyhomes-hq.up.railway.app/api/auth/callback/google`. (You can come back and
     add it after B5.)
   - Create. Google shows a **Client ID** and **Client secret**. Keep that window open; you'll
     paste them into Railway in B4. Don't send them to anyone.

### B. Railway (runs the app and database)

1. Go to **railway.com** → **Login with GitHub** (lukepettersen). Pick a paid plan (Hobby is
   fine to start).
2. **New Project → Deploy from GitHub repo → lukepettersen/pettyhomeshq.** Branch: **main**.
3. In the project, **New → Database → PostgreSQL.**
4. Click the app service → **Variables** → add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway fills it in) |
   | `NEXTAUTH_SECRET` | a long random value (Railway's **Generate** button, or any 40+ random characters) |
   | `NEXTAUTH_URL` | the app's address from step 5, e.g. `https://pettyhomes-hq.up.railway.app` |
   | `GOOGLE_CLIENT_ID` | from Google (A4) |
   | `GOOGLE_CLIENT_SECRET` | from Google (A4) |
   | `ALLOWED_EMAIL_DOMAIN` | `pettyhomes.com` |

   Leave the Twilio variables out. Texting stays off until you add them (Phase 4).
5. App service → **Settings → Networking → Generate Domain.** That's HQ's address. Put it in
   `NEXTAUTH_URL` and in Google's redirect URI (A4).
6. Postgres service → **Backups** → turn on daily backups (if your plan shows the option).
7. Railway deploys automatically. The first start creates the database tables and adds you
   and Alyssa to the team.

### C. Check it works

1. Open HQ's address → **Sign in with Google** → luke@pettyhomes.com → you see "Welcome, Luke".
2. Alyssa signs in with assistant@pettyhomes.com → she sees "Welcome, Alyssa".
3. Try a personal Gmail account → it's refused with "That Google account isn't on the Petty
   Homes team."

That's Phase 0 done.

### Optional: hq.pettyhomes.com

Railway → app service → Settings → Networking → **Custom domain** → `hq.pettyhomes.com`.
Railway shows a CNAME record; add it wherever pettyhomes.com's DNS is managed. Then update
`NEXTAUTH_URL` and add the new redirect URI in Google.

---

## Part 2 — Day-to-day operations

### How changes go live
1. Changes are made on a branch and opened as a pull request.
2. CI runs lint, type checks, tests, a security audit and a build.
3. Railway can show a preview of the pull request; the owner tries it.
4. Merging to `main` deploys. Startup applies database migrations and the (safe, repeatable)
   seed, then starts the app. If the health check (`/api/health`) fails, Railway keeps the
   previous version running.

### Roll back a bad release
Railway → app service → **Deployments** → pick the last good one → **Redeploy**.
Database migrations are always additive, so an older version still runs against the newer
database.

### Restore the database
Railway → Postgres service → **Backups** → choose a backup → **Restore**. Restoring replaces
current data with the backup, so export first if unsure.

### Add or remove a team member
Phase 0: ask for a change (Admin → Users & roles arrives in Phase 1). Only people on the team
list with an @pettyhomes.com Google account can sign in. Removing someone (status
**Disabled**) signs them out on their next page load.

### Connect another platform (Admin → Integrations)
Admin → Integrations lists each platform (Google, Twilio texting, Follow Up Boss, file storage),
whether it's connected, and the exact Railway variable names it needs. To connect one: Railway →
HQ app service → **Variables** → **New Variable**, paste the name and value, save. Railway
restarts HQ and the page shows **Connected**. To disconnect, delete the variables. Keys are never
shown in HQ or stored in its database. Texting also has an on/off switch on that page.

### Google Calendar
One-time: Google Cloud → APIs & Services → Library → **Google Calendar API** → Enable; then
Credentials → the HQ OAuth client → Authorized redirect URIs → add
`https://<HQ address>/api/google/callback` → Save. In HQ: Admin → Integrations → **Connect Google
Calendar** and approve. The connection is stored encrypted (key derived from `NEXTAUTH_SECRET`;
changing that secret means connecting again). Disconnect from the same page.

### Rotate a secret
Create the new value (Google: Credentials → the HQ client → reset secret), update the
Railway variable, Railway redeploys. Changing `NEXTAUTH_SECRET` signs everyone out.

---

## Part 3 — Developer reference

- Node 22. `npm install`, then copy `.env.example` to `.env` and fill it (local Postgres).
- `npm run dev` — local app on http://localhost:3000
- `npm run db:migrate` — create a migration after editing `prisma/schema.prisma`
- `npm run db:seed` — roles and team (safe to repeat)
- `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
- Release gate: `npm audit --omit=dev --audit-level=high` must pass. Known dev-only findings:
  `eslint-config-next` pulls an old `fast-glob`/`micromatch` chain; it runs only on
  developer machines and in CI, never in the deployed app.
