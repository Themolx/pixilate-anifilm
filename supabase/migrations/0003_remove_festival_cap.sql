-- Remove the 10,000-frame global festival cap.
-- The original cap was a Free-plan safeguard. After upgrading to Pro the
-- bottleneck becomes storage / egress quota, not a row count, so the trigger
-- is redundant and just risks blocking the festival mid-event.
--
-- The per-device rate limit (40 frames/min, in 0002) STAYS — that's spam
-- protection, unrelated to plan tier.
--
-- Apply once via the Supabase dashboard SQL editor; safe to re-run.

drop trigger if exists trg_frames_cap on public.frames;
drop function if exists public.enforce_frame_cap();
