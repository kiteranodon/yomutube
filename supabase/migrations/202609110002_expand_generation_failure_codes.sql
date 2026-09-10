-- Gemini generation records only fixed, non-sensitive failure categories.
-- No provider error body or model response is persisted.
alter table public.magazine_versions
  drop constraint if exists magazine_versions_failure_code_check;

alter table public.magazine_versions
  add constraint magazine_versions_failure_code_check
  check (failure_code is null or failure_code in (
    'article_generation_failed',
    'article_validation_failed',
    'request_timed_out',
    'gemini_key_missing',
    'gemini_rate_limited',
    'gemini_unavailable',
    'gemini_invalid_response',
    'generation_save_failed'
  ));
