# Pixilate — Anifilm 2026

Collaborative stop-motion web app. One shared animation for the whole festival.
Live at: https://themolx.github.io/pixilate-anifilm/

## Repo + deploy
- Remote: `github.com/Themolx/pixilate-anifilm` (branch: `master`)
- Token for pushes: in `.env` as `GITHUB_TOKEN` (git-ignored)
- GH Actions auto-deploys `master` to GitHub Pages after push

## Stack
- React 19 + Vite 7 + TypeScript (strict)
- HashRouter (static hosting)
- Supabase: Postgres + Storage + Realtime
- Framer Motion for transitions

## Routes
- `#/` — HomeGate → Onboarding (if not onboarded) → CameraView
- `#/play` — PlaybackView (full timeline)
- `#/admin` — AdminGate → AdminFrames
- `#/admin/reports` — AdminReports
- `#/logs` — LogsView (in-app console)

## Key files
- `src/lib/i18n.ts` — **single source of truth for all UI strings** (EN + CS, section-commented). User edits texts here.
- `src/components/CameraView.tsx` — main capture screen. 1:1 viewfinder, onion skin (canvas + multiply), zoom, rewind 2s button.
- `src/components/Onboarding.tsx` — start → name → preview (last 2s) → camera permission.
- `src/components/PlaybackView.tsx` — full-feed playback.
- `src/lib/logger.ts` — ring-buffer logger (200 entries) surfaced at `/logs`.
- `src/lib/onboarding.ts` — localStorage helpers (name, onboarded flag, camera-ok flag).
- `src/lib/db.ts` — `listFrames()` returns ASC by seq. Tail-slice for "latest N".
- `supabase/migrations/` — SQL schema + rate-limit trigger.

## Quirks to remember
- `listFrames()` is ASC. For "last N frames" use `.slice(-N)`, never `listFrames(N)` which returns the **oldest** N.
- Onion skin flickers if opacity-change re-runs the image load. Keep a cached offscreen `tintedRef` canvas; opacity effect only redraws, loader effect depends on frame id/URL.
- Zoom must be captured (digital zoom via source crop: `cropSize = baseSize / zoom`). Onion skin stays at base (no zoom) so users can see what moved.
- Rate limit: 40 frames/min, enforced by Postgres trigger `enforce_frame_rate`. Changing it requires new migration + Supabase SQL editor run (user applies manually).
- Supabase MCP is bound to the DUMPSTR project, NOT pixilate. Can't apply pixilate migrations via MCP — write SQL file, tell user to run it in Supabase dashboard.
- Portrait-locked via CSS `.landscape-lock` in App.tsx.
- Device language: `navigator.language.startsWith('cs')` → Czech, else English.

## Style rules
- **No emojis or em dashes ever** 

## Two git repos live under /Users/martintomek
- `/Users/martintomek` itself is a git repo (prezentaceAI, remote `martintomekvfx/prezentaceAI`)
- `/Users/martintomek/pixilate` is this repo
- **Always use `git -C /Users/martintomek/pixilate` or verify `pwd` first** — cwd resets between some tool calls and you risk modifying the wrong repo's config (happened once: accidentally overwrote prezentaceAI's remote).

## Push workflow
```bash
cd /Users/martintomek/pixilate
npm run build          # tsc --noEmit && vite build
git add -A
git commit -m "..."
git push               # origin already has token baked in
```


