-- Prerequisite: enable pg_cron in Supabase Dashboard > Integrations > Cron.
-- Supabase Cron uses UTC. 15:15 UTC is 00:15 JST on the following calendar day.
-- Apply once, after 202609100001_create_yomazine_schema.sql.

select cron.schedule(
  'yomazine-purge-expired-data',
  '15 15 * * *',
  $$select public.purge_yomazine_expired_data();$$
);
