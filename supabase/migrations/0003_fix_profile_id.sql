-- Fix a bug introduced by 0002: it dropped profile's primary key and the
-- default on `id`, but left the `id` column NOT NULL. That made it impossible
-- to create a profile row for any new user (insert fails with
-- "null value in column id violates not-null constraint"), which broke the
-- Insights page, Settings, and set_preferences for anyone without a row yet.
--
-- `id` is now vestigial — a profile is identified by user_id — so drop it.
alter table profile drop column if exists id;
