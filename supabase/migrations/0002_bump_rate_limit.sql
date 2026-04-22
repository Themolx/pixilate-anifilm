-- Bump frame rate limit from 12 → 40 per minute per device.
create or replace function public.enforce_frame_rate() returns trigger
language plpgsql as $$
declare recent int;
begin
  select count(*) into recent
    from public.frames
   where device_id  = new.device_id
     and created_at > now() - interval '1 minute';
  if recent >= 40 then
    raise exception 'rate_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;
