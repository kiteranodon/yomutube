-- Fixes the original URL regular expression, which escaped punctuation twice and
-- rejected valid normalized YouTube URLs.
alter table public.magazines
  drop constraint if exists magazines_video_url_check;

alter table public.magazines
  add constraint magazines_video_url_check
  check (video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$');
