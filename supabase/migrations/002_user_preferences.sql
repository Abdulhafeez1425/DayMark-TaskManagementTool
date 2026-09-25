create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  context_type text not null default 'mixed' check (context_type in ('work', 'personal', 'study', 'projects', 'mixed')),
  decision_style text not null default 'important' check (decision_style in ('deadlines', 'importance', 'list', 'unsure')),
  support_style text not null default 'next_action' check (support_style in ('next_action', 'prioritization', 'reminders', 'breakdown', 'weekly_view')),
  default_view text not null default 'today',
  reminder_preferences jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "User preferences viewable by owner"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "User preferences insertable by owner"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "User preferences updatable by owner"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User preferences deletable by owner"
  on public.user_preferences for delete
  using (auth.uid() = user_id);

create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row execute procedure public.update_updated_at_column();
