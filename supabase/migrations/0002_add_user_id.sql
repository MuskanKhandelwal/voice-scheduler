-- Multi-tenant migration: scope every table to a Clerk user_id.
--
-- Clerk user ids are strings like "user_2abc...". We store them as text.
-- Run this in the Supabase SQL editor AFTER the initial schema.sql.
--
-- NOTE ON EXISTING DATA: rows created before auth existed have no user_id.
-- They'll be invisible once the app filters by user_id. If you want to keep
-- your current tasks/events, sign in once, find your user id (Clerk dashboard
-- → Users, or the app logs), and run e.g.
--   update tasks set user_id = 'user_XXX' where user_id is null;
-- for each table. Otherwise the old single-user rows can simply be deleted.

-- 1. profile: was a single locked row (id = 1); now one row per user.
alter table profile add column if not exists user_id text;
-- Drop the old single-row primary key / check so multiple users can exist.
alter table profile drop constraint if exists profile_pkey;
alter table profile drop constraint if exists profile_id_check;
alter table profile alter column id drop default;
-- Make user_id the identity for a profile.
update profile set user_id = 'legacy-single-user' where user_id is null;
alter table profile alter column user_id set not null;
alter table profile add constraint profile_user_id_key unique (user_id);

-- 2. Add user_id to every per-user table.
alter table tasks add column if not exists user_id text;
alter table calendar_events add column if not exists user_id text;
alter table daily_goals add column if not exists user_id text;
alter table conversation_messages add column if not exists user_id text;
alter table insights add column if not exists user_id text;

-- 3. daily_goals & insights had uniqueness that must now be per-user.
alter table daily_goals drop constraint if exists daily_goals_date_key;
alter table daily_goals add constraint daily_goals_user_date_key unique (user_id, date);

alter table insights drop constraint if exists insights_period_type_period_start_key;
alter table insights add constraint insights_user_period_key unique (user_id, period_type, period_start);

-- 4. Helpful indexes for the per-user filtering the API now does.
create index if not exists idx_tasks_user on tasks (user_id);
create index if not exists idx_calendar_events_user_date on calendar_events (user_id, date);
create index if not exists idx_daily_goals_user_date on daily_goals (user_id, date);
create index if not exists idx_conversation_user_session on conversation_messages (user_id, session_id, created_at);
create index if not exists idx_insights_user on insights (user_id);
