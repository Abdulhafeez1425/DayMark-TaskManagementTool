create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  locale text not null default 'en',
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  onboarding_status text not null default 'not_started',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_plan on public.profiles(plan);
create index if not exists idx_profiles_onboarding_status on public.profiles(onboarding_status);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by owner" 
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles can be inserted by owner" 
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Profiles can be updated by owner" 
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Profiles can be deleted by owner" 
  on public.profiles for delete
  using (auth.uid() = id);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, timezone, locale, plan, onboarding_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'timezone', 'UTC'),
    coalesce(new.raw_user_meta_data->>'locale', 'en'),
    'free',
    'not_started'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
