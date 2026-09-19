Daymark V2 — Concise Implementation Prompt

Extend Daymark V1 into a low-friction, next-action-first task manager that helps users complete work instead of maintaining a complex task system.

Preserve V1 strengths: simplified UI, quick add, low-friction capture, transparent prioritization, and a prominent Next action.

1. Signup and onboarding

Support, in order:

•
Google OAuth

•
Apple OAuth

•
Magic link

•
Guest mode for an instant trial

Guest mode must support the core flow without onboarding; explain that sync requires account creation.

Limit onboarding to three steps, with no tutorial screens. The final step must require adding one real task and showing it in Today. Every question is skippable and editable later in Settings.

Ask:

1.
What are you trying to stay on top of right now? Work / Personal tasks / Study / Projects / A mix of everything

2.
How do you usually decide what to do next? Deadlines / Most important task / A list / Often unsure where to start

3.
What support would help you follow through? Clear next action / Better prioritization / Gentle reminders / Break large tasks into steps / Simple weekly view

Use answers to personalize Today, categories, ranking behavior, the Next action emphasis, recap visibility, clarification prompts, and weekly context. Do not require a project, tags, priority, or due date to save a task.

2. Today and task execution

Today must clearly show:

•
One prominent Next action

•
Progress for today

•
Up-next and overdue tasks

•
Completed tasks

•
Optional Someday/backlog area

•
Lightweight weekly rhythm

Rank tasks transparently using due date, overdue status, importance, blocked state, age, and the user’s onboarding preference. When useful, explain the reason: “Due today,” “Overdue,” or “High priority.” Do not infer energy levels unless explicitly collected.

For vague tasks such as “Fix website,” offer a dismissible prompt: What is the next concrete action? Let the user keep or revise the original task.

3. Retention and review

Add a completion-based momentum indicator:

•
Completing at least one task counts for the day.

•
App opens do not count.

•
Missed days must not create shame or punitive resets.

Add an end-of-day recap showing completed versus planned tasks, unfinished tasks, and a one-tap Carry over to tomorrow action. Never reschedule silently.

Add a weekly review for unfinished tasks with Keep / Drop / Reschedule actions. Flag stale tasks for review; never silently delete or archive them.

Recurring tasks must be state-aware: create the next occurrence only after completion unless the user chooses otherwise, and prevent duplicate subtasks or reminders.

4. Offline-first reliability

The core personal task flow must work offline, including loading Today, creating, editing, completing, and ranking tasks. Persist local changes across restarts, sync in the background when connectivity returns, show subtle sync status, resolve conflicts deterministically, and never silently discard edits.

Optimize for instant-feeling local capture, but do not claim a fixed performance number unless measured and verified.

5. Pricing

Free

Include unlimited personal tasks, projects/categories, reminders, history, Today, momentum, end-of-day recap, weekly review, offline use, and personal sync. Never cap task count, project count, history, or basic usage.

Paid

Reserve paid features for team and advanced value:

•
Team assignment and shared workspaces

•
Third-party integrations

•
Advanced reporting

•
Team workload/dependency views

•
Priority support

Do not paywall basic personal task capture, reminders, history, or offline sync. Do not show upgrade prompts during onboarding or basic task completion.

6. Trust and roadmap

Add a visible in-app Changelog with improvements, bug fixes, user-requested changes, and a feedback entry point. Prioritize reliable execution, sync, speed, and usability over feature volume. Clearly label unreleased features as planned or experimental.

Delivery phases

Phase 1: signup/guest mode, three-step onboarding, personalized Today, task completion momentum, end-of-day recap, weekly review, offline-first personal tasks, and changelog.

Phase 2: conflict handling, state-aware recurrence, stale-task review, clarification prompts, ranking explanations, and personal workload visibility.

Phase 3: team workspaces, assignments, integrations, advanced reporting, dependencies, and priority support.

Definition of done

A user can enter through any supported signup path, complete onboarding in three steps, add one real task, and see it in Today. Their answers change understandable defaults. They can manage personal tasks offline and sync without data loss. Momentum reflects completion, recap supports explicit carry-over, weekly review supports keep/drop/reschedule, recurring tasks avoid duplication, basic usage is unlimited, paid features are team/advanced only, and the changelog is visible.


Product principle: Daymark should reduce the work of managing work by helping users decide what matters next, take action, and recover gracefully when plans change.

