Daymark V1/V2 — Supabase Database and Backend Implementation Prompt

Build Daymark’s backend on Supabase using Supabase Auth, PostgreSQL, Row Level Security, Realtime, and Edge Functions where server-side logic is required.

Daymark is a low-friction, next-action-first task manager. Personal task capture must remain fast, secure, and usable offline. Do not require projects, tags, priorities, or due dates to create a task.

1. Authentication

Configure Supabase Auth for:

•
Google OAuth

•
Apple OAuth

•
Magic-link email login

•
Anonymous/guest accounts for instant trial

Guest users must be able to create and manage local personal tasks. When they register, preserve their tasks and preferences by linking or migrating the anonymous user to the permanent account. Do not expose service-role credentials in the client.

Create a profiles row after signup with the user’s display name, email, timezone, locale, plan, and onboarding status. Use the user’s Supabase Auth ID as the primary key.

2. Core database schema

Use UUID primary keys, UTC timestamps, foreign keys, and consistent created_at/updated_at fields. Add indexes for common Today-view and sync queries.

profiles

•
id uuid primary key references auth.users(id) on delete cascade

•
display_name text

•
avatar_url text

•
timezone text not null default 'UTC'

•
locale text not null default 'en'

•
plan text not null default 'free' with values free, pro, team

•
onboarding_status text not null default 'not_started'

•
onboarding_completed_at timestamptz

•
timestamps

user_preferences

One row per user:

•
user_id uuid primary key

•
context_type text — work, personal, study, projects, mixed

•
decision_style text — deadlines, importance, list, unsure

•
support_style text — next_action, prioritization, reminders, breakdown, weekly_view

•
default_view text not null default 'today'

•
reminder_preferences jsonb not null default '{}'

•
settings jsonb not null default '{}'

•
timestamps

projects

•
id uuid primary key

•
user_id uuid not null

•
name text not null

•
description text

•
color text

•
archived_at timestamptz

•
timestamps

Personal projects are unlimited on the free plan.

tasks

•
id uuid primary key

•
user_id uuid not null

•
project_id uuid null

•
parent_task_id uuid null for optional breakdowns

•
title text not null check (length(trim(title)) > 0)

•
notes text

•
status text not null default 'open' — open, completed, dropped, archived

•
priority text not null default 'none' — none, low, medium, high

•
due_at timestamptz

•
completed_at timestamptz

•
completed_by uuid

•
is_next_action boolean not null default false

•
sort_order numeric not null default 0

•
blocked boolean not null default false

•
source text not null default 'manual' — manual, import, integration, system

•
recurrence_id uuid null

•
last_reviewed_at timestamptz

•
deleted_at timestamptz for sync-safe soft deletion

•
client_id text and client_updated_at timestamptz for idempotent offline writes

•
timestamps

When a task is completed, set completed_at; when reopened, clear it. Never permanently delete tasks through normal client operations.

recurrences

•
id uuid primary key

•
user_id uuid not null

•
task_template_id uuid not null

•
rule text not null using a documented recurrence format

•
next_due_at timestamptz

•
active boolean not null default true

•
timestamps

Create the next occurrence only after the current occurrence is completed. Prevent duplicate instances with a unique constraint or idempotency key.

task_events

Append-only audit/activity table:

•
id uuid primary key

•
user_id uuid not null

•
task_id uuid

•
event_type text not null — created, updated, completed, reopened, dropped, rescheduled, carried_over

•
metadata jsonb not null default '{}'

•
created_at timestamptz not null default now()

Use this table for completion analytics, momentum, recap data, and debugging. Users may read their own events but must not edit them.

daily_progress

One row per user and local calendar date:

•
id uuid primary key

•
user_id uuid not null

•
local_date date not null

•
planned_count integer not null default 0

•
completed_count integer not null default 0

•
momentum_earned boolean not null default false

•
recap_viewed_at timestamptz

•
unique (user_id, local_date)

Momentum is earned by completing at least one task, not by opening the app.

weekly_reviews

•
id uuid primary key

•
user_id uuid not null

•
week_start date not null

•
status text not null default 'open' — open, completed, dismissed

•
completed_at timestamptz

•
unique (user_id, week_start)

Store each keep/drop/reschedule decision in task_events or a separate review-items table.

notifications and feedback

Create user-scoped tables for scheduled reminders and submitted feedback. Notifications must support read/dismissed state and a source task. Feedback must include category, message, optional task/context metadata, and status.

changelog_entries

Public/readable entries:

•
id uuid primary key

•
title text not null

•
body text not null

•
entry_type text — feature, improvement, fix, feedback

•
published_at timestamptz

•
created_at timestamptz

Only authorized administrators can create or edit changelog entries. All authenticated users can read published entries.

3. Security and Row Level Security

Enable RLS on every public table.

Rules:

•
A user can select, insert, update, and soft-delete only rows where user_id = auth.uid().

•
A user can access only projects, tasks, recurrences, events, progress, reviews, notifications, and feedback belonging to that user.

•
Users cannot update their own plan, admin fields, changelog entries, audit events, or server-generated progress fields directly.

•
Use database triggers or Edge Functions for user_id, timestamps, completion events, momentum, and recurrence creation.

•
Validate ownership when inserting a task with a project_id, parent_task_id, or recurrence_id.

•
Never use the service-role key in frontend code.

Add tests proving that User A cannot read or mutate User B’s records.

4. Backend behavior and APIs

Use Supabase queries for ordinary CRUD and Realtime subscriptions. Use Edge Functions or secure Postgres functions for privileged or multi-step operations.

Implement these operations:

get_today_view

Return the user’s timezone-aware Today data:

•
Next action

•
Due and overdue tasks

•
Up-next tasks

•
Completed tasks

•
Progress counts

•
Momentum status

•
Relevant weekly rhythm data

•
Support-style-specific emphasis

Use a deterministic ranking function based on due date, overdue status, priority, blocked state, age, manual order, and onboarding decision style. Return a short ranking reason where appropriate.

complete_task

Atomically:

1.
Mark the task completed.

2.
Write a task_events row.

3.
Update daily_progress using the user’s timezone.

4.
Award momentum if this is the first completion that day.

5.
Create the next recurrence exactly once when applicable.

carry_over_tasks

Accept an explicit list of unfinished task IDs and a target date. Validate ownership, update due dates/status as appropriate, and write carried_over events. This must be user-triggered and idempotent.

weekly_review

Return incomplete tasks from the target week and accept keep, drop, or reschedule decisions. Write an audit event for every decision. Never silently delete or archive tasks.

sync_changes

Support offline-first clients with:

•
Pull by updated_at or sync cursor

•
Push of idempotent client mutations

•
Soft deletes using deleted_at

•
Conflict responses when the server version changed

•
Deterministic conflict policy documented in the API

•
No silent overwrites or data loss

Use client_id/idempotency keys to make retries safe.

submit_feedback

Allow authenticated users and guests where appropriate to submit product feedback. Rate-limit this endpoint and strip sensitive data from logs.

5. Realtime and offline sync

Enable Realtime only for the user’s own task/project changes. Do not broadcast private data across users. The client should maintain a local store and queue mutations while offline. When online, push queued mutations, resolve conflicts, then pull the latest user-scoped changes.

The core personal workflow must work offline: load Today from local data, create/edit/complete tasks, and preserve changes across restarts.

6. Plans and feature gates

The free plan includes unlimited personal tasks, projects, reminders, history, Today, momentum, recaps, weekly review, offline use, and personal sync.

Gate only team and advanced capabilities:

•
Team assignment

•
Shared workspaces

•
Third-party integrations

•
Advanced reporting

•
Team workload/dependency views

•
Priority support

Enforce plan checks server-side. Never rely only on client-side hiding. Do not cap task count, project count, history, or basic personal usage.

7. Migrations, seed data, and testing

Deliver:

•
Versioned SQL migrations

•
All tables, indexes, constraints, triggers, functions, and RLS policies

•
Seed data for a development user

•
Environment-variable documentation

•
Edge Function source and deployment instructions

•
API examples for core operations

•
RLS tests for cross-user isolation

•
Tests for offline retry idempotency and conflict handling

•
Tests for completion momentum, carry-over, weekly review, and recurring-task deduplication

•
A short data-retention and soft-delete policy

Definition of done

A new or guest user can start immediately, add a task without setup, see it in a personalized Today view, complete it offline, and sync it safely later. On completion, progress, momentum, events, and recurrence state update atomically. Users can explicitly carry tasks to tomorrow and review unfinished weekly tasks. Free personal usage is unlimited, paid features are team/advanced only, every table is protected by RLS, and no client can access another user’s data.


Backend principle: Keep personal task execution fast, local-first, secure, auditable, and simple; move complexity to the backend without exposing it in the core user experience.

