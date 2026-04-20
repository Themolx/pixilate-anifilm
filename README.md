# Pixilate

Collaborative stop-motion animation for Anifilm 2026. Phone → frame → shared timeline.

- **Live:** https://themolx.github.io/pixilate/
- **Stack:** React 19 + Vite + Supabase (Postgres, Storage, Auth, Realtime). GitHub Pages for static hosting.

## Local setup

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project
npm install
npm run dev
```

Anon key is public by design — RLS policies are the real defense.
**Never put the service role key in this codebase.**

## Supabase project setup

1. Create a new Supabase project.
2. In **Database → Extensions**, enable `pg_cron` and `pgcrypto`.
3. In the **SQL Editor**, run the migrations in order:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_storage.sql`
   4. `supabase/migrations/0004_triggers.sql`
   5. `supabase/migrations/0005_cron.sql`
4. In **Database → Replication**, make sure the `frames` table is included in the `supabase_realtime` publication. Without this, Realtime events never fire.
5. In **Authentication → URL Configuration**, add `https://themolx.github.io/pixilate/**` to the Redirect URLs allowlist. (For local dev, also add `http://localhost:5173/**`.)

## Admin bootstrap

1. Run the app locally or in prod.
2. Navigate to `#/admin`, enter your email, send the magic link.
3. Click the link in your inbox. You'll be redirected, signed in, and shown **"Not authorized"** — expected.
4. In Supabase → **Authentication → Users**, copy your `user_id`.
5. Open `supabase/migrations/0006_bootstrap_admin.sql.template`, paste the uuid + your email, run it in the SQL editor.
6. Reload `#/admin`. You're in.

Repeat step 5 for every festival staff member who needs admin access.

## Deploy

GitHub Pages from the `master` branch via `.github/workflows/deploy.yml`.

Required repo secrets (Settings → Secrets and variables → Actions):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Push to `master` → GitHub Actions builds with env vars injected → deploys to Pages.

## Architecture at a glance

- **Routing**: `HashRouter` (GitHub Pages is static, no SPA fallback for real paths).
- **Sessions**: 5-char alphanumeric slugs, optional PIN (SHA-256 soft gate). Users join via `#/s/<slug>`.
- **Frames**: row-first, then upload both full + thumb. Failed row = no orphan blob.
- **Realtime**: one `postgres_changes` channel per mounted session, with a 10s fallback to polling if no event arrives (captive portals block WebSockets).
- **Admin moderation**: magic-link login → `admins` whitelist. All deletes are soft (`deleted_at`), reversible.
- **Caps**: 12 frames/min per device, 500 frames/session (both enforced by Postgres triggers).
- **TTL**: pg_cron soft-deletes idle sessions after 30 days; hard-deletes frame rows 7 days after soft delete.

## Festival-day checklist

- [ ] Deploy ≥30 min before doors open (Pages CDN cache)
- [ ] Verify `frames` in `supabase_realtime` publication
- [ ] Verify `https://themolx.github.io/pixilate/**` in Auth redirect allowlist
- [ ] Test capture flow on real phone on venue wifi
- [ ] Bookmark `#/admin` on the staff device
- [ ] Confirm storage not near 1GB cap (upgrade to Pro if close)

## Gotchas

- iOS Safari loses camera permission when the tab is backgrounded. The camera retry button handles it.
- Captive portals block Realtime WebSockets. The polling fallback handles it.
- `base: /pixilate/` is hardcoded via `VITE_PIXILATE_DEPLOY_BASE`. Change it for a custom domain.
- The PIN gate is client-side soft only. Anon users with a session id can still `select` frames via the API. Don't use for private content.

## Scripts

```bash
npm run dev         # dev server
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build
npm run preview     # local preview of the production build
```
