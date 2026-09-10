-- Prerequisite: enable the pg_cron extension in Supabase Dashboard > Integrations > Cron.
-- Supabase Cron uses UTC. 15:15 UTC is 00:15 JST on the following calendar day.

select cron.schedule(
  'yomazine-purge-expired-data',
  '15 15 * * *',
  $$select public.purge_yomazine_expired_data();$$
);
