create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null,
  parent_task_id uuid null,
  title text not null check (length(trim(title)) > 0),
  notes text,
  status text not null default 'open' check (status in ('open', 'completed', 'dropped', 'archived')),
  priority text not null default 'none' check (priority in ('none', 'low', 'medium', 'high')),
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  is_next_action boolean not null default false,
  sort_order numeric not null default 0,
  blocked boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'import', 'integration', 'system')),
  recurrence_id uuid null,
  last_reviewed_at timestamptz,
  deleted_at timestamptz,
  client_id text,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_user_status_due on public.tasks(user_id, status, due_at);
create index if not exists idx_tasks_user_updated on public.tasks(user_id, updated_at);

alter table public.tasks enable row level security;

create policy "Tasks viewable by owner"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Tasks insertable by owner"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Tasks updatable by owner"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Tasks deletable by owner"
  on public.tasks for delete
  using (auth.uid() = user_id);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.update_updated_at_column();
