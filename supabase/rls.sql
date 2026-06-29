-- ════════════════════════════════════════════════════════════════════════════
-- Bowson GRP — Row-Level Security policies + Realtime (Phase 6)
-- Run this ONCE in the Supabase SQL Editor WHEN you turn authentication on.
--
-- Model:
--   • The backend uses the service-role key, which BYPASSES RLS — so all writes
--     keep working and stay funnelled through the API (the workflow authority).
--   • These policies grant logged-in users (role "authenticated") READ access so
--     the browser can read directly + subscribe to Realtime. No write policies
--     are granted to authenticated → direct writes from the browser are denied.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'customers','operatives','moulds','orders','tickets','ticket_assignments',
    'time_sessions','catalogue','catalogue_parts','catalogue_hardware','audit_log','users'
  ]
  loop
    execute format('drop policy if exists %1$s_auth_read on %1$I', t);
    execute format(
      'create policy %1$s_auth_read on %1$I for select to authenticated using (true)', t);
  end loop;
end$$;

-- ─── Realtime: publish the live tables so the T-Card board can subscribe ──────
do $$
declare t text;
begin
  foreach t in array array['tickets','orders','ticket_assignments','time_sessions','moulds']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;   -- already in the publication
      when undefined_object then
        raise notice 'publication supabase_realtime not found — create it or enable Realtime in Supabase first';
    end;
  end loop;
end$$;
