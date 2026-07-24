-- Voice Scheduler schema (single-user MVP, no auth/RLS)

create table if not exists profile (
  id int primary key default 1 check (id = 1),
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '18:00',
  energy_high_start time not null default '09:00',
  energy_high_end time not null default '12:00',
  energy_low_start time not null default '14:00',
  energy_low_end time not null default '16:00',
  updated_at timestamptz not null default now()
);
insert into profile (id) values (1) on conflict (id) do nothing;

create table if not exists daily_goals (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  goal_text text not null default '',
  created_at timestamptz not null default now()
);

create type task_priority as enum ('low', 'medium', 'high');
create type task_energy as enum ('high', 'low');
create type task_status as enum ('pending', 'scheduled', 'done');

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  estimated_minutes int not null,
  priority task_priority not null default 'medium',
  energy_requirement task_energy not null default 'high',
  status task_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  is_manual boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create type insight_period as enum ('daily', 'weekly', 'monthly');

create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  period_type insight_period not null,
  period_start date not null,
  period_end date not null,
  stats_json jsonb not null default '{}',
  narrative_text text not null default '',
  generated_at timestamptz not null default now(),
  unique (period_type, period_start)
);

create index if not exists idx_calendar_events_date on calendar_events (date);
create index if not exists idx_conversation_messages_session on conversation_messages (session_id, created_at);
