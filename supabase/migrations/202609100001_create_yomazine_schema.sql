-- Yomazine: anonymous-user magazine history.
-- Prerequisite: enable Supabase Auth > Anonymous Sign-ins before applying.

create table public.magazines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_url text not null check (video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'),
  video_title text not null check (char_length(btrim(video_title)) > 0),
  channel_title text not null check (char_length(btrim(channel_title)) > 0),
  video_duration_seconds integer not null check (video_duration_seconds between 1 and 3600),
  video_minutes smallint generated always as (ceil(video_duration_seconds::numeric / 60)::smallint) stored,
  reading_minutes smallint not null check (reading_minutes in (3, 5, 10)),
  saved_minutes smallint generated always as (greatest(0, ceil(video_duration_seconds::numeric / 60)::integer - reading_minutes)::smallint) stored,
  user_goal text not null check (char_length(btrim(user_goal)) between 1 and 200),
  agreed_at timestamptz not null default now(),
  terms_version text not null check (char_length(btrim(terms_version)) > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  check (video_url = 'https://www.youtube.com/watch?v=' || video_id),
  check (expires_at > created_at)
);

create table public.magazine_versions (
  id uuid primary key default gen_random_uuid(),
  magazine_id uuid not null references public.magazines(id) on delete cascade,
  version_number smallint not null check (version_number > 0),
  status text not null check (status in ('generating', 'succeeded', 'failed')),
  article jsonb,
  failure_code text check (failure_code is null or failure_code in ('article_generation_failed', 'article_validation_failed', 'request_timed_out')),
  illustration_mode text not null default 'not_requested' check (illustration_mode in ('ephemeral_generated', 'fallback_layout', 'not_requested')),
  ai_model text not null check (char_length(btrim(ai_model)) > 0),
  prompt_template_version text not null check (char_length(btrim(prompt_template_version)) > 0),
  article_schema_version text not null check (char_length(btrim(article_schema_version)) > 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (magazine_id, version_number),
  check (
    (status = 'generating' and article is null and failure_code is null and completed_at is null)
    or (status = 'succeeded' and article is not null and failure_code is null and completed_at is not null)
    or (status = 'failed' and article is null and failure_code is not null and completed_at is not null)
  ),
  check (
    article is null or (
      jsonb_typeof(article) = 'object'
      and article ?& array['magazineTitle', 'lead', 'keyPoints', 'memorableMoment', 'episode', 'discovery', 'practicalPoints', 'closing']
      and jsonb_typeof(article -> 'keyPoints') = 'array'
      and jsonb_array_length(article -> 'keyPoints') = 3
      and jsonb_typeof(article -> 'practicalPoints') = 'array'
      and jsonb_array_length(article -> 'practicalPoints') > 0
    )
  )
);

comment on table public.magazines is 'One user-owned magazine input and video snapshot. PDFs, images, raw URLs, and media are never stored.';
comment on table public.magazine_versions is 'Immutable generation versions. article is validated JSONB only for succeeded versions.';

create index magazines_user_created_at_idx on public.magazines (user_id, created_at desc);
create index magazines_expires_at_idx on public.magazines (expires_at);
create index magazine_versions_magazine_version_idx on public.magazine_versions (magazine_id, version_number desc);
create index magazine_versions_incomplete_created_at_idx on public.magazine_versions (created_at) where status in ('generating', 'failed');

alter table public.magazines enable row level security;
alter table public.magazine_versions enable row level security;

revoke all on table public.magazines from anon, authenticated;
revoke all on table public.magazine_versions from anon, authenticated;
grant select, insert, update, delete on table public.magazines to authenticated;
grant select, insert, update, delete on table public.magazine_versions to authenticated;

create policy "magazines_select_own" on public.magazines for select to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "magazines_insert_own" on public.magazines for insert to authenticated with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "magazines_update_own" on public.magazines for update to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid())) with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "magazines_delete_own" on public.magazines for delete to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "magazine_versions_select_own" on public.magazine_versions for select to authenticated using (exists (select 1 from public.magazines where magazines.id = magazine_versions.magazine_id and magazines.user_id = (select auth.uid())));
create policy "magazine_versions_insert_own" on public.magazine_versions for insert to authenticated with check (exists (select 1 from public.magazines where magazines.id = magazine_versions.magazine_id and magazines.user_id = (select auth.uid())));
create policy "magazine_versions_update_own" on public.magazine_versions for update to authenticated using (exists (select 1 from public.magazines where magazines.id = magazine_versions.magazine_id and magazines.user_id = (select auth.uid()))) with check (exists (select 1 from public.magazines where magazines.id = magazine_versions.magazine_id and magazines.user_id = (select auth.uid())));
create policy "magazine_versions_delete_own" on public.magazine_versions for delete to authenticated using (exists (select 1 from public.magazines where magazines.id = magazine_versions.magazine_id and magazines.user_id = (select auth.uid())));

-- Supports the future "delete all history" action. It can only delete the caller's rows.
create function public.delete_my_magazines()
returns void language sql security invoker set search_path = ''
as $$ delete from public.magazines where user_id = (select auth.uid()); $$;

revoke all on function public.delete_my_magazines() from public;
grant execute on function public.delete_my_magazines() to authenticated;

-- Called only by pg_cron. Incomplete versions and their empty parents expire after 24 hours;
-- successful histories expire after 90 days via magazines.expires_at.
create function public.purge_yomazine_expired_data()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.magazine_versions
  where status in ('generating', 'failed') and created_at < now() - interval '24 hours';

  delete from public.magazines
  where expires_at <= now()
     or (created_at < now() - interval '24 hours' and not exists (
       select 1 from public.magazine_versions
       where magazine_versions.magazine_id = magazines.id
     ));
end;
$$;

revoke all on function public.purge_yomazine_expired_data() from public, anon, authenticated;
