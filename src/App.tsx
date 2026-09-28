import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
} from "react"

import { supabase } from "@/lib/supabase"
const profileFromUser = (
  user?: { email?: string | null; user_metadata?: Record<string, unknown> } | null,
): UserProfile => ({
  name:
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name
        : typeof user?.email === "string"
          ? user.email.split("@")[0].replace(/[._-]+/g, " ")
          : "Alex",
  isGuest: false,
  mode: "mix",
  decisionStyle: "important",
  supportNeeds: ["Clear next action"],
})

const profileFromRow = (row?: {
  display_name?: string | null
  timezone?: string | null
  locale?: string | null
  plan?: string | null
  onboarding_status?: string | null
} | null): UserProfile => ({
  name: row?.display_name || "Alex",
  isGuest: false,
  mode: "mix",
  decisionStyle: "important",
  supportNeeds: ["Clear next action"],
})

const taskFromRow = (row: {
  id: string
  title?: string | null
  notes?: string | null
  status?: string | null
  priority?: string | null
  due_at?: string | null
  completed_at?: string | null
  is_next_action?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  client_id?: string | null
  deleted_at?: string | null
}): Task => {
  let parsed: Record<string, unknown> = {}
  if (row.notes) {
    try {
      parsed = JSON.parse(row.notes)
    } catch {
      parsed = {}
    }
  }

  const project = typeof parsed.project === "string" ? parsed.project : "Personal"
  const dueDate =
    typeof parsed.dueDate === "string"
      ? parsed.dueDate
      : row.due_at
        ? new Date(row.due_at).toISOString().slice(0, 10)
        : null
  const dueTime = typeof parsed.dueTime === "string" ? parsed.dueTime : null
  const assignee = typeof parsed.assignee === "string" ? parsed.assignee : null
  const definitionOfDone =
    typeof parsed.definitionOfDone === "string" ? parsed.definitionOfDone : ""
  const subtaskCount =
    typeof parsed.subtaskCount === "number" ? parsed.subtaskCount : 0
  const commentCount =
    typeof parsed.commentCount === "number" ? parsed.commentCount : 0
  const recurring =
    parsed.recurring === "daily" || parsed.recurring === "weekly"
      ? parsed.recurring
      : null
  const someday = !!parsed.someday
  const lastTouched =
    typeof parsed.lastTouched === "string"
      ? parsed.lastTouched
      : row.updated_at || row.created_at || new Date().toISOString()
  const createdAt = row.created_at || lastTouched
  const nextStep = typeof parsed.nextStep === "string" ? parsed.nextStep : ""
  const clarified = parsed.clarified === false ? false : true

  return {
    id: row.id,
    text: row.title || "Untitled task",
    done: (row.status || "open") === "completed",
    priority: (
      row.priority === "high" ||
      row.priority === "medium" ||
      row.priority === "low"
        ? row.priority
        : "medium"
    ) as Priority,
    project,
    dueDate,
    dueTime,
    assignee,
    definitionOfDone,
    subtaskCount,
    commentCount,
    recurring,
    someday,
    lastTouched,
    createdAt,
    nextStep,
    clarified,
  }
}

const taskToRow = (task: Task) => {
  const payload = {
    project: task.project,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    assignee: task.assignee,
    definitionOfDone: task.definitionOfDone,
    subtaskCount: task.subtaskCount,
    commentCount: task.commentCount,
    recurring: task.recurring,
    someday: task.someday,
    lastTouched: task.lastTouched,
    createdAt: task.createdAt,
    nextStep: task.nextStep,
    clarified: task.clarified,
  }

  return {
    id: task.id,
    title: task.text,
    notes: JSON.stringify(payload),
    status: task.done ? "completed" : "open",
    priority: task.priority,
    due_at: task.dueDate
      ? new Date(`${task.dueDate}T${task.dueTime || "00:00"}:00`).toISOString()
      : null,
    completed_at: task.done ? new Date().toISOString() : null,
    is_next_action: false,
    client_id: task.id,
    client_updated_at: new Date().toISOString(),
  }
}

async function ensureSupabaseProfile(user?: {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
} | null) {
  if (!user?.id) return null

  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : typeof user.email === "string"
          ? user.email.split("@")[0].replace(/[._-]+/g, " ")
          : "Alex"

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en"

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: displayName,
        timezone,
        locale,
        plan: "free",
        onboarding_status: "not_started",
      },
      { onConflict: "id" },
    )
    .select("id, display_name, timezone, locale, plan, onboarding_status")
    .maybeSingle()

  if (error) {
    console.error("Profile sync failed:", error)
    return null
  }

  return data
}

async function loadSupabaseProfile(userId?: string | null) {
  if (!userId) return null

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, timezone, locale, plan, onboarding_status")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("Load profile failed:", error)
    return null
  }

  return data
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low"
type View = "today" | "projects" | "notes" | "insights" | "settings" | "changelog"
type AppPhase = "auth" | "onboarding" | "app"

interface Task {
  id: string
  text: string
  done: boolean
  priority: Priority
  project: string
  dueDate: string | null
  dueTime: string | null
  assignee: string | null
  definitionOfDone: string
  subtaskCount: number
  commentCount: number
  recurring: "daily" | "weekly" | null
  someday: boolean
  lastTouched: string
  createdAt: string
  nextStep: string
  clarified: boolean // whether vague-task prompt has been addressed
}
interface Note {
  id: string
  title: string
  body: string
  createdAt: string
}
interface Project {
  id: string
  name: string
  color: string
}
interface UserProfile {
  name: string
  isGuest: boolean
  mode: "work" | "personal" | "study" | "projects" | "mix"
  decisionStyle: "deadlines" | "important" | "list" | "unsure"
  supportNeeds: string[]
}
interface AppSettings {
  notificationMode: "all" | "digest" | "urgent"
  staleThresholdDays: number
  proView: boolean
  quoteCollapsed: boolean
}
type ToastType = "success" | "info" | "warning"
interface ToastMsg {
  id: string
  message: string
  type: ToastType
}

// ── localStorage hook ─────────────────────────────────────────────────────────

function useLocal<T>(key: string, init: T) {
  const [val, setVal] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s ? JSON.parse(s) : init
    } catch {
      return init
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch {}
  }, [key, val])
  return [val, setVal] as const
}

// ── Toast ──────────────────────────────────────────────────────────────────────

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(
  () => {},
)
function useToast() {
  return useContext(ToastCtx)
}

function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: ToastMsg[]
  dismiss: (id: string) => void
}) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 320 }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-[13px] font-medium"
          style={{
            background:
              t.type === "success"
                ? "#065f46"
                : t.type === "warning"
                  ? "#7c2d12"
                  : "var(--sidebar)",
            color: "#fff",
            animation: "slideUp 0.18s ease",
          }}
        >
          <span>
            {t.type === "success" ? "✓" : t.type === "warning" ? "⚠" : "ℹ"}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="opacity-60 hover:opacity-100 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Constants / helpers ────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const PROJECT_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
]
const priorityConfig = {
  high: {
    label: "High",
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    rank: 0,
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    rank: 1,
  },
  low: {
    label: "Low",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    rank: 2,
  },
}
const VAGUE_PATTERNS =
  /^(fix|update|improve|review|check|look at|handle|deal with|work on|do)\b/i
const QUOTES = [
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  {
    text: "Do what you can, with what you have, where you are.",
    author: "Theodore Roosevelt",
  },
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
  },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  {
    text: "Small daily improvements are the key to staggering long-term results.",
    author: "Robin Sharma",
  },
  {
    text: "Start where you are. Use what you have. Do what you can.",
    author: "Arthur Ashe",
  },
  {
    text: "Energy and persistence conquer all things.",
    author: "Benjamin Franklin",
  },
  {
    text: "In the middle of difficulty lies opportunity.",
    author: "Albert Einstein",
  },
]
const CHANGELOG = [
  {
    version: "V2.0",
    date: "Today",
    tag: "new",
    items: [
      "Onboarding wizard (3 steps, skippable)",
      "Guest mode — try instantly, sync later",
      "Personalized Today based on your workflow",
      "End-of-day recap with Carry Over",
      "Weekly review: Keep / Drop / Reschedule",
      "Ranking reason labels on every task",
      "Vague task clarification prompts",
      "Momentum tracking (completion-based, no shame)",
      "Changelog (you're reading it)",
      "localStorage persistence — data survives refresh",
    ],
  },
  {
    version: "V1.2",
    date: "Earlier",
    tag: "improved",
    items: [
      "Collapsible quote card",
      "Toast notifications (fixed corner)",
      "Auto-rank by overdue → priority → age",
      "Next action hero card",
      "Someday bucket with stale detection",
      "Recurring tasks: skip / snooze dialog",
      "Settings view with Pro view toggle",
      "WCAG AA contrast on all text",
    ],
  },
  {
    version: "V1.0",
    date: "Launch",
    tag: "launch",
    items: [
      "Today view with greeting and progress",
      "Quick-add task (press / to focus)",
      "Projects, Notes, Insights",
      "Dark / light mode",
      "Weekly rhythm bar chart",
    ],
  },
]

function genId() {
  return globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10)
}
function todayStr() {
  return new Date().toISOString().split("T")[0]
}
function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
function dateOffsetStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}
function isOverdue(dd: string | null) {
  return !!dd && dd < todayStr()
}
function isDueToday(dd: string | null) {
  return dd === todayStr()
}
function getGreeting(h: number) {
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}
function getDayQuote() {
  return QUOTES[
    (new Date().getDay() * 3 + new Date().getDate()) % QUOTES.length
  ]
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function isVague(text: string) {
  return VAGUE_PATTERNS.test(text.trim()) && text.trim().split(" ").length < 5
}
function getRankReason(task: Task): string {
  if (isOverdue(task.dueDate)) return "Overdue"
  if (isDueToday(task.dueDate)) return "Due today"
  if (task.priority === "high") return "High priority"
  if (daysSince(task.createdAt) > 5)
    return `Added ${daysSince(task.createdAt)}d ago`
  return ""
}
function rankTasks(
  tasks: Task[],
  style?: UserProfile["decisionStyle"],
): Task[] {
  return [...tasks].sort((a, b) => {
    const ao = isOverdue(a.dueDate) ? 0 : 1
    const bo = isOverdue(b.dueDate) ? 0 : 1
    if (ao !== bo) return ao - bo
    if (style === "deadlines") {
      const ad = a.dueDate ?? "9999"
      const bd = b.dueDate ?? "9999"
      if (ad !== bd) return ad.localeCompare(bd)
    }
    const pd = priorityConfig[a.priority].rank - priorityConfig[b.priority].rank
    if (pd !== 0) return pd
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}
function formatDue(date: string | null): string {
  if (!date) return ""
  const diff = Math.round(
    (new Date(date + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) /
      86400000,
  )
  if (diff === 0) return "Today"
  if (diff === -1) return "Yesterday"
  if (diff === 1) return "Tomorrow"
  if (diff < 0) return `${-diff}d overdue`
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// ── Initial data ───────────────────────────────────────────────────────────────

function makeInitialTasks(): Task[] {
  return [
    {
      id: genId(),
      text: "Review product brief",
      done: false,
      priority: "high",
      project: "Work",
      dueDate: todayStr(),
      dueTime: "10:30",
      assignee: "Alex",
      definitionOfDone: "All sections reviewed and feedback sent",
      subtaskCount: 3,
      commentCount: 2,
      recurring: null,
      someday: false,
      lastTouched: new Date().toISOString(),
      createdAt: daysAgoStr(2),
      nextStep: "",
      clarified: true,
    },
    {
      id: genId(),
      text: "Prepare weekly report",
      done: false,
      priority: "medium",
      project: "Work",
      dueDate: todayStr(),
      dueTime: "17:00",
      assignee: null,
      definitionOfDone: "",
      subtaskCount: 0,
      commentCount: 0,
      recurring: "weekly",
      someday: false,
      lastTouched: new Date().toISOString(),
      createdAt: daysAgoStr(7),
      nextStep: "",
      clarified: true,
    },
    {
      id: genId(),
      text: "Fix website",
      done: false,
      priority: "high",
      project: "Design",
      dueDate: dateOffsetStr(-1),
      dueTime: null,
      assignee: "Sam",
      definitionOfDone: "",
      subtaskCount: 2,
      commentCount: 1,
      recurring: null,
      someday: false,
      lastTouched: new Date().toISOString(),
      createdAt: daysAgoStr(3),
      nextStep: "",
      clarified: false,
    },
    {
      id: genId(),
      text: "Call dentist for appointment",
      done: true,
      priority: "low",
      project: "Personal",
      dueDate: todayStr(),
      dueTime: null,
      assignee: null,
      definitionOfDone: "",
      subtaskCount: 0,
      commentCount: 0,
      recurring: null,
      someday: false,
      lastTouched: new Date().toISOString(),
      createdAt: daysAgoStr(1),
      nextStep: "",
      clarified: true,
    },
    {
      id: genId(),
      text: "Read 30 pages",
      done: false,
      priority: "low",
      project: "Personal",
      dueDate: null,
      dueTime: null,
      assignee: null,
      definitionOfDone: "",
      subtaskCount: 0,
      commentCount: 0,
      recurring: "daily",
      someday: false,
      lastTouched: daysAgoStr(5),
      createdAt: daysAgoStr(10),
      nextStep: "",
      clarified: true,
    },
  ]
}

// ── App root ───────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useLocal<AppPhase>("dm_phase", "auth")
  const [profile, setProfile] = useLocal<UserProfile | null>("dm_profile", null)
  const [tasks, setTasks] = useLocal<Task[]>("dm_tasks", makeInitialTasks())
  const [projects, setProjects] = useLocal<Project[]>("dm_projects", [
    { id: genId(), name: "Work", color: "#6366f1" },
    { id: genId(), name: "Design", color: "#f59e0b" },
    { id: genId(), name: "Personal", color: "#10b981" },
  ])
  const [notes, setNotes] = useLocal<Note[]>("dm_notes", [])
  const [settings, setSettings] = useLocal<AppSettings>("dm_settings", {
    notificationMode: "digest",
    staleThresholdDays: 3,
    proView: false,
    quoteCollapsed: true,
  })
  const [completionDays, setCompletionDays] = useLocal<string[]>(
    "dm_streak",
    [],
  )
  const [darkMode, setDarkMode] = useLocal<boolean>("dm_dark", false)

  const [view, setView] = useState<View>("today")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [now, setNow] = useState(new Date())
  const [recurringDialog, setRecurringDialog] = useState<Task | null>(null)
  const [showRecap, setShowRecap] = useState(false)
  const [showWeeklyReview, setShowWeeklyReview] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const recapShownToday = useRef(false)

  useEffect(() => {
    if (phase !== "app" || !profile || profile.isGuest) return

    let isMounted = true
    const loadRemoteTasks = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !isMounted) return

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)

      if (error) {
        console.error("Load tasks failed:", error)
        return
      }

      if (data && data.length > 0) {
        setTasks(data.map(taskFromRow))
      }
    }

    void loadRemoteTasks()
    return () => {
      isMounted = false
    }
  }, [phase, profile])

  useEffect(() => {
    if (phase !== "app" || !profile || profile.isGuest) return

    const timeout = window.setTimeout(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const rows = tasks.map((task) => ({
        ...taskToRow(task),
        user_id: user.id,
      }))

      const { error } = await supabase.from("tasks").upsert(rows, {
        onConflict: "id",
      })

      if (error) {
        console.error("Sync tasks failed:", error)
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [tasks, phase, profile])

  useEffect(() => {
    let isMounted = true

    const syncSignedInUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!isMounted || !session?.user) return

      const profileRow = await ensureSupabaseProfile(session.user)
      const row = profileRow ?? (await loadSupabaseProfile(session.user.id))
      const nextProfile = row ? profileFromRow(row) : profileFromUser(session.user)
      setProfile(nextProfile)
      if (phase === "auth") setPhase("onboarding")
    }

    void syncSignedInUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user || !isMounted) return

        const profileRow = await ensureSupabaseProfile(session.user)
        const row = profileRow ?? (await loadSupabaseProfile(session.user.id))
        const nextProfile = row ? profileFromRow(row) : profileFromUser(session.user)
        setProfile(nextProfile)
        if (phase === "auth") setPhase("onboarding")
      },
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [phase])

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Sign out failed:", error)
    } finally {
      setProfile(null)
      setPhase("auth")
      setView("today")
    }
  }, [])

  const addToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = genId()
      setToasts((ts) => [...ts, { id, message, type }])
      setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3500)
    },
    [],
  )
  const dismissToast = useCallback(
    (id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)),
    [],
  )

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
  }, [darkMode])
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  // Stale task detection
  useEffect(() => {
    if (phase !== "app") return
    let moved = 0
    setTasks((ts) =>
      ts.map((t) => {
        if (t.done || t.someday) return t
        if (daysSince(t.lastTouched) >= settings.staleThresholdDays) {
          moved++
          return { ...t, someday: true }
        }
        return t
      }),
    )
    if (moved > 0)
      setTimeout(
        () =>
          addToast(
            `${moved} stale task${moved > 1 ? "s" : ""} moved to Someday`,
            "info",
          ),
        800,
      )
  }, [phase]) // eslint-disable-line

  // End-of-day recap trigger
  useEffect(() => {
    if (phase !== "app" || recapShownToday.current) return
    const h = now.getHours()
    if (h >= 18) {
      const incomplete = tasks.filter(
        (t) => !t.done && !t.someday && isDueToday(t.dueDate),
      )
      if (incomplete.length > 0) {
        recapShownToday.current = true
        setTimeout(() => setShowRecap(true), 1500)
      }
    }
  }, [now.getHours(), phase]) // eslint-disable-line

  // Keyboard shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "/") {
        e.preventDefault()
        setView("today")
        setTimeout(
          () => document.getElementById("quick-add-input")?.focus(),
          50,
        )
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [])

  const toggleTask = (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    if (!task.done && task.recurring) {
      setRecurringDialog(task)
      return
    }
    const nowDone = !task.done
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, done: nowDone, lastTouched: new Date().toISOString() }
          : t,
      ),
    )
    if (nowDone) {
      addToast("Task completed ✓")
      // Track completion day
      const today = todayStr()
      setCompletionDays((ds) => (ds.includes(today) ? ds : [...ds, today]))
    }
  }
  const deleteTask = (id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id))
    addToast("Task removed", "warning")
  }
  const handleRecurring = (
    task: Task,
    action: "done" | "skip" | "snooze1d" | "snooze1w",
  ) => {
    setRecurringDialog(null)
    if (action === "done") {
      setTasks((ts) =>
        ts.map((t) =>
          t.id === task.id
            ? { ...t, done: true, lastTouched: new Date().toISOString() }
            : t,
        ),
      )
      setCompletionDays((ds) => {
        const today = todayStr()
        return ds.includes(today) ? ds : [...ds, today]
      })
      addToast("Recurring task done")
    } else if (action === "skip") {
      addToast("Skipped this occurrence", "info")
    } else {
      const d = action === "snooze1d" ? 1 : 7
      setTasks((ts) =>
        ts.map((t) =>
          t.id === task.id
            ? {
                ...t,
                dueDate: dateOffsetStr(d),
                lastTouched: new Date().toISOString(),
              }
            : t,
        ),
      )
      addToast(`Snoozed ${d === 1 ? "1 day" : "1 week"}`, "info")
    }
  }
  const restoreFromSomeday = (id: string) => {
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, someday: false, lastTouched: new Date().toISOString() }
          : t,
      ),
    )
    addToast("Restored to Today")
  }
  const updateSetting = <K extends keyof AppSettings,>(
    k: K,
    v: AppSettings[K],
  ) => setSettings((s) => ({ ...s, [k]: v }))

  // Streak: consecutive days with at least 1 completion
  const streak = (() => {
    let s = 0
    const d = new Date()
    while (true) {
      const str = d.toISOString().split("T")[0]
      if (!completionDays.includes(str)) break
      s++
      d.setDate(d.getDate() - 1)
    }
    return s
  })()

  if (phase === "auth")
    return (
      <ToastCtx.Provider value={addToast}>
        <AuthScreen
          onComplete={(p) => {
            setProfile(p)
            setPhase(p.isGuest ? "app" : "onboarding")
          }}
        />
        <ToastContainer toasts={toasts} dismiss={dismissToast} />
      </ToastCtx.Provider>
    )

  if (phase === "onboarding")
    return (
      <ToastCtx.Provider value={addToast}>
        <OnboardingWizard
          onComplete={async (p, firstTask) => {
            setProfile(p)

            const {
              data: { user },
            } = await supabase.auth.getUser()
            if (user) {
              await ensureSupabaseProfile(user)
              const profileRow = await loadSupabaseProfile(user.id)
              if (profileRow) setProfile(profileFromRow(profileRow))
            }

            if (firstTask) {
              const t: Task = {
                id: genId(),
                text: firstTask,
                done: false,
                priority: "medium",
                project:
                  p.mode === "work"
                    ? "Work"
                    : p.mode === "personal"
                      ? "Personal"
                      : "Projects",
                dueDate: todayStr(),
                dueTime: null,
                assignee: null,
                definitionOfDone: "",
                subtaskCount: 0,
                commentCount: 0,
                recurring: null,
                someday: false,
                lastTouched: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                nextStep: "",
                clarified: !isVague(firstTask),
              }
              setTasks((ts) => [t, ...ts])
            }
            setPhase("app")
          }}
          onSkip={() => setPhase("app")}
        />
        <ToastContainer toasts={toasts} dismiss={dismissToast} />
      </ToastCtx.Provider>
    )

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  return (
    <ToastCtx.Provider value={addToast}>
      <div
        className="min-h-screen flex"
        style={{ background: "var(--background)" }}
      >
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          className={`fixed lg:static inset-y-0 left-0 z-40 flex-shrink-0 transition-transform duration-200 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          } ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}`}
          style={{ height: "100vh" }}
        >
          <Sidebar
            view={view}
            setView={(v) => {
              setView(v)
              setSidebarOpen(false)
            }}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            profile={profile}
            isOnline={isOnline}
            streak={streak}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            onLogout={handleSignOut}
          />
        </div>
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-4 pt-4 lg:px-6 lg:pt-6">
            <div className="lg:hidden flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((s) => !s)}
                className="p-2 rounded-xl"
                style={{
                  color: "var(--muted-foreground)",
                  background: darkMode ? "#1f2937" : "#edf1f5",
                  boxShadow: darkMode
                    ? "8px 8px 18px rgba(15,23,42,0.45), -8px -8px 18px rgba(51,65,85,0.2)"
                    : "8px 8px 18px rgba(163,177,198,0.35), -8px -8px 18px rgba(255,255,255,0.9)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M3 5h14M3 10h14M3 15h14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setDarkMode((d) => !d)}
                aria-label="Toggle dark mode"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border transition-all"
                style={{
                  color: darkMode ? "#f8fafc" : "#1f2937",
                  background: darkMode ? "#111827" : "#eef3f8",
                  borderColor: darkMode ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.2)",
                  boxShadow: darkMode
                    ? "10px 10px 22px rgba(2,6,23,0.65), -8px -8px 18px rgba(30,41,59,0.4)"
                    : "10px 10px 22px rgba(163,177,198,0.28), -8px -8px 18px rgba(255,255,255,0.95)",
                }}
              >
                {darkMode ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
            {view === "today" && (
              <TodayView
                tasks={tasks}
                setTasks={setTasks}
                projects={projects}
                setProjects={setProjects}
                dateStr={dateStr}
                timeStr={timeStr}
                now={now}
                settings={settings}
                updateSetting={updateSetting}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
                addToast={addToast}
                restoreFromSomeday={restoreFromSomeday}
                profile={profile}
                streak={streak}
                completionDays={completionDays}
              />
            )}
            {view === "projects" && (
              <ProjectsView
                projects={projects}
                tasks={tasks}
                setProjects={setProjects}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
                addToast={addToast}
                profile={profile}
              />
            )}
            {view === "notes" && (
              <NotesView
                notes={notes}
                setNotes={setNotes}
                addToast={addToast}
              />
            )}
            {view === "insights" && (
              <InsightsView
                tasks={tasks}
                now={now}
                settings={settings}
                completionDays={completionDays}
                streak={streak}
              />
            )}
            {view === "settings" && (
              <SettingsView
                settings={settings}
                updateSetting={updateSetting}
                profile={profile}
                setProfile={setProfile}
              />
            )}
            {view === "changelog" && <ChangelogView />}
          </div>
        </main>
        <ToastContainer toasts={toasts} dismiss={dismissToast} />

        {/* Recurring dialog */}
        {recurringDialog && (
          <Modal onClose={() => setRecurringDialog(null)}>
            <div className="space-y-4">
              <div>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={{
                    background: "var(--secondary)",
                    color: "var(--primary)",
                  }}
                >
                  {recurringDialog.recurring} recurring
                </span>
              </div>
              <p
                className="font-medium text-[15px]"
                style={{ color: "var(--foreground)" }}
              >
                {recurringDialog.text}
              </p>
              <p
                className="text-[13px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                This task repeats. Choose how to handle it.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { action: "done" as const, label: "Mark done" },
                  { action: "skip" as const, label: "Skip once" },
                  { action: "snooze1d" as const, label: "Snooze 1 day" },
                  { action: "snooze1w" as const, label: "Snooze 1 week" },
                ].map((b) => (
                  <button
                    key={b.action}
                    onClick={() => handleRecurring(recurringDialog, b.action)}
                    className="px-3 py-2.5 rounded-xl text-[13px] font-medium"
                    style={
                      b.action === "done"
                        ? { background: "var(--primary)", color: "#fff" }
                        : {
                            background: "var(--muted)",
                            color: "var(--foreground)",
                          }
                    }
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {/* End-of-day recap */}
        {showRecap && (
          <EndOfDayRecap
            tasks={tasks}
            setTasks={setTasks}
            onClose={() => setShowRecap(false)}
            addToast={addToast}
          />
        )}

        {/* Weekly review */}
        {showWeeklyReview && (
          <WeeklyReview
            tasks={tasks}
            setTasks={setTasks}
            onClose={() => setShowWeeklyReview(false)}
            addToast={addToast}
          />
        )}
      </div>
    </ToastCtx.Provider>
  )
}

// ── Auth Screen ────────────────────────────────────────────────────────────────

function AuthScreen({ onComplete }: { onComplete: (p: UserProfile) => void }) {
  const [darkMode] = useLocal<boolean>("dm_dark", false)
  const [email, setEmail] = useState("alex@example.com")
  const toast = useToast()

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
  }, [darkMode])

  const formatDisplayName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return "Alex"
    const firstPart = trimmed.split("@")[0].replace(/[._-]+/g, " ")
    return firstPart
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Alex"
  }

  const startGoogleOrApple = async (provider: "google" | "apple") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      toast(`Unable to continue with ${provider}. Please try again.`, "warning")
      return
    }
  }

  const startMagicLink = async () => {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes("@")) {
      toast("Enter a valid email to receive your sign-in link.", "warning")
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      toast("The magic link request failed. Please try again.", "warning")
      return
    }

    toast("Magic link sent. Check your inbox to continue.", "success")
  }

  const authProfile = (provider: "google" | "apple" | "email") => {
    const name =
      provider === "email"
        ? formatDisplayName(email)
        : provider === "google"
          ? "Alex"
          : "Alex"

    onComplete({
      name,
      isGuest: false,
      mode: "mix",
      decisionStyle: "important",
      supportNeeds: ["Clear next action"],
    })
  }

  const guestProfile: UserProfile = {
    name: "Guest",
    isGuest: true,
    mode: "mix",
    decisionStyle: "important",
    supportNeeds: ["Clear next action"],
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-lg"
            style={{ background: "var(--sidebar)" }}
          >
            <svg width="24" height="24" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 3h10M2 7h7M2 11h5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            DayMark
          </h1>
          <p
            className="text-[14px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            Decide what matters next. Take action.
          </p>
        </div>

        <div
          className="rounded-2xl p-6 space-y-3"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => startGoogleOrApple("google")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => startGoogleOrApple("apple")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            >
              <AppleIcon />
              Continue with Apple
            </button>

            <div className="space-y-2">
              <label
                className="block text-[11px] font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Email for magic link
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                type="button"
                onClick={startMagicLink}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              >
                <MailIcon />
                Continue with email link
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 my-1">
            <div
              className="flex-1 h-px"
              style={{ background: "var(--border)" }}
            />
            <span
              className="text-[11px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "var(--border)" }}
            />
          </div>

          <button
            onClick={() => onComplete(guestProfile)}
            className="w-full px-4 py-3 rounded-xl text-[14px] font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            Try as guest — no sign up
          </button>
          <p
            className="text-center text-[11px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            Guest mode works offline. Create an account to sync across devices.
          </p>
        </div>
        <p
          className="text-center text-[11px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          No credit card. No paywall for personal use.
        </p>
      </div>
    </div>
  )
}

// ── Onboarding Wizard ─────────────────────────────────────────────────────────

function OnboardingWizard({
  onComplete,
  onSkip,
}: {
  onComplete: (p: UserProfile, firstTask: string) => void
  onSkip: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("Alex")
  const [mode, setMode] = useState<UserProfile["mode"]>("mix")
  const [decisionStyle, setDecisionStyle] =
    useState<UserProfile["decisionStyle"]>("important")
  const [supportNeeds, setSupportNeeds] = useState<string[]>([
    "Clear next action",
  ])
  const [firstTask, setFirstTask] = useState("")

  const steps = [
    {
      q: "What are you trying to stay on top of?",
      sub: "This helps personalize your Today view.",
      options: [
        { value: "work", label: "Work tasks", emoji: "💼" },
        { value: "personal", label: "Personal", emoji: "🏠" },
        { value: "study", label: "Study", emoji: "📚" },
        { value: "projects", label: "Projects", emoji: "🚀" },
        { value: "mix", label: "A mix of everything", emoji: "✨" },
      ] as { value: UserProfile["mode"] label: string emoji: string }[],
      value: mode,
      set: (v: string) => setMode(v as UserProfile["mode"]),
      multi: false,
    },
    {
      q: "How do you usually decide what to do next?",
      sub: "We&apos;ll rank your tasks accordingly.",
      options: [
        { value: "deadlines", label: "By deadlines", emoji: "📅" },
        { value: "important", label: "Most important task", emoji: "⭐" },
        { value: "list", label: "Top of a list", emoji: "📋" },
        { value: "unsure", label: "Often unsure", emoji: "🤔" },
      ] as {
        value: UserProfile["decisionStyle"]
        label: string
        emoji: string
      }[],
      value: decisionStyle,
      set: (v: string) => setDecisionStyle(v as UserProfile["decisionStyle"]),
      multi: false,
    },
    {
      q: "What support would help you follow through?",
      sub: "Select all that apply.",
      options: [
        { value: "Clear next action", label: "Clear next action", emoji: "🎯" },
        {
          value: "Better prioritization",
          label: "Better prioritization",
          emoji: "🏆",
        },
        { value: "Gentle reminders", label: "Gentle reminders", emoji: "🔔" },
        {
          value: "Break tasks into steps",
          label: "Break large tasks down",
          emoji: "🔧",
        },
        {
          value: "Simple weekly view",
          label: "Simple weekly view",
          emoji: "🗓",
        },
      ],
      value: supportNeeds,
      set: (v: string) =>
        setSupportNeeds((prev) =>
          prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
        ),
      multi: true,
    },
  ]

  const profile: UserProfile = {
    name,
    isGuest: false,
    mode,
    decisionStyle,
    supportNeeds,
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: "var(--primary)" }}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 3h10M2 7h7M2 11h5"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span
              className="font-semibold text-[13px]"
              style={{ color: "var(--foreground)" }}
            >
              DayMark
            </span>
          </div>
          <button
            onClick={onSkip}
            className="text-[13px] transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            Skip setup →
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1 rounded-full flex-1 transition-all"
              style={{
                background: i <= step ? "var(--primary)" : "var(--muted)",
              }}
            />
          ))}
        </div>

        {step < 3 ? (
          <div className="space-y-6">
            <div>
              <h2
                className="text-xl font-semibold mb-1"
                style={{ color: "var(--foreground)" }}
              >
                {steps[step].q}
              </h2>
              <p
                className="text-[13px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {steps[step].sub}
              </p>
            </div>
            <div className="space-y-2">
              {steps[step].options.map((opt) => {
                const isSelected = steps[step].multi
                  ? (supportNeeds as string[]).includes(opt.value)
                  : steps[step].value === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => steps[step].set(opt.value)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium text-left transition-all"
                    style={{
                      background: isSelected
                        ? "var(--secondary)"
                        : "var(--card)",
                      border: `1px solid ${
                        isSelected ? "var(--primary)" : "var(--border)"
                      }`,
                      color: isSelected
                        ? "var(--primary)"
                        : "var(--foreground)",
                    }}
                  >
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                    {isSelected && (
                      <span className="ml-auto text-[var(--primary)]">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-medium"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                  }}
                >
                  Back
                </button>
              )}
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold"
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                {step === 2 ? "Almost done →" : "Continue →"}
              </button>
            </div>
            <button
              onClick={() => setStep((s) => s + 1)}
              className="w-full text-center text-[12px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Skip this question
            </button>
          </div>
        ) : (
          /* Step 4: add first task */
          <div className="space-y-6">
            <div>
              <h2
                className="text-xl font-semibold mb-1"
                style={{ color: "var(--foreground)" }}
              >
                Add your first task
              </h2>
              <p
                className="text-[13px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                No due date or tags required. One task to get started.
              </p>
            </div>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid var(--primary)",
                boxShadow: "0 0 0 3px rgba(99,102,241,0.08)",
              }}
            >
              <div
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ background: "var(--card)" }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: "var(--border)" }}
                />
                <input
                  autoFocus
                  type="text"
                  placeholder="What do you need to do today?"
                  value={firstTask}
                  onChange={(e) => setFirstTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && firstTask.trim())
                      onComplete(profile, firstTask)
                  }}
                  className="flex-1 bg-transparent text-[14px] outline-none"
                  style={{ color: "var(--foreground)" }}
                />
              </div>
            </div>
            {firstTask.trim() && (
              <p
                className="text-[12px] flex items-center gap-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                This will appear in Today
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2.5 rounded-xl text-[13px] font-medium"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                }}
              >
                Back
              </button>
              <button
                onClick={() => onComplete(profile, firstTask)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold"
                style={{
                  background: firstTask.trim()
                    ? "var(--primary)"
                    : "var(--muted)",
                  color: firstTask.trim() ? "#fff" : "var(--muted-foreground)",
                }}
              >
                {firstTask.trim() ? "Go to Today →" : "Skip and start →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

function Sidebar({
  view,
  setView,
  darkMode,
  setDarkMode,
  profile,
  isOnline,
  streak,
  collapsed,
  setCollapsed,
  onLogout,
}: {
  view: View
  setView: (v: View) => void
  darkMode: boolean
  setDarkMode: (v: boolean) => void
  profile: UserProfile | null
  isOnline: boolean
  streak: number
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  onLogout: () => void
}) {
  const navItems: { id: View label: string icon: React.ReactNode }[] = [
    {
      id: "today",
      label: "Today",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect
            x="2"
            y="3"
            width="12"
            height="11"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M5 2v2M11 2v2M2 7h12"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: "projects",
      label: "Projects",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 4a2 2 0 012-2h2l2 2h4a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V4z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      ),
    },
    {
      id: "notes",
      label: "Notes",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M5 6h6M5 9h4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: "insights",
      label: "Insights",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 12l3.5-4 3 2.5 3.5-5L15 8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ]
  return (
    <aside
      className={`flex flex-col transition-all duration-200 ${
        collapsed ? "w-20" : "w-64"
      }`}
      style={{
        background: "var(--sidebar)",
        color: "var(--sidebar-fg)",
        height: "100vh",
        minHeight: "100vh",
      }}
    >
      <div className="px-3 pt-5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--primary)" }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 3h10M2 7h7M2 11h5"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            {!collapsed && (
              <span
                className="font-semibold text-[15px] whitespace-nowrap"
                style={{ color: "var(--sidebar-fg)" }}
              >
                DayMark
              </span>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
            style={{
              background: "var(--primary)",
              color: "#fff",
              boxShadow: darkMode
                ? "8px 8px 18px rgba(15,23,42,0.45), -6px -6px 18px rgba(51,65,85,0.18)"
                : "8px 8px 18px rgba(163,177,198,0.35), -6px -6px 18px rgba(255,255,255,0.75)",
            }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 3h10M2 7h7M2 11h5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {!collapsed && (
          <div className="mt-4 flex items-center justify-between rounded-xl px-2.5 py-2 text-[10px]" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isOnline ? "#10b981" : "#6b7280" }}
              />
              <span style={{ color: "var(--sidebar-muted)" }}>
                {isOnline ? "Synced" : "Offline"}
              </span>
            </div>
            {streak > 0 && (
              <span style={{ color: "var(--sidebar-fg)" }}>🔥 {streak}</span>
            )}
          </div>
        )}
      </div>

      {streak > 0 && !collapsed && (
        <div
          className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2.5"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <span style={{ fontSize: 16 }}>🔥</span>
          <div>
            <div
              className="text-[12px] font-semibold"
              style={{ color: "var(--sidebar-fg)" }}
            >
              {streak}-day streak
            </div>
            <div
              className="text-[10px]"
              style={{ color: "var(--sidebar-muted)" }}
            >
              Keep completing tasks
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2.5 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
              view === item.id ? "bg-white/10 text-white" : "hover:bg-white/5"
            }`}
            style={{
              color: view === item.id ? "#fff" : "var(--sidebar-muted)",
            }}
            title={collapsed ? item.label : undefined}
          >
            <span className={collapsed ? "text-base" : ""}>{item.icon}</span>
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      <div className="px-2 pb-4 space-y-1">
        <div className="mx-2 my-2 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
        {[
          {
            id: "settings" as View,
            label: "Settings",
            icon: (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M3.8 12.2l.7-.7M11.5 4.5l.7-.7"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
          {
            id: "changelog" as View,
            label: "What's new",
            icon: (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 2a6 6 0 100 12A6 6 0 008 2z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M8 8V5M8 10.5v.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2.5 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
              view === item.id ? "bg-white/10 text-white" : "hover:bg-white/5"
            }`}
            title={collapsed ? item.label : undefined}
            style={{
              color: view === item.id ? "#fff" : "var(--sidebar-muted)",
            }}
          >
            {item.icon}
            {!collapsed && item.label}
          </button>
        ))}

        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-between"} px-2.5 py-2.5 rounded-xl text-[13px] font-medium transition-all hover:bg-white/5`}
          style={{ color: "var(--sidebar-muted)" }}
          title={darkMode ? "Light mode" : "Dark mode"}
        >
          <span className={`${collapsed ? "flex items-center justify-center" : "flex items-center gap-3"}`}>
            {darkMode ? <SunIcon /> : <MoonIcon />}
            {!collapsed && (darkMode ? "Light mode" : "Dark mode")}
          </span>
          {!collapsed && (
            <div
              className="w-9 h-5 rounded-full relative"
              style={{
                background: darkMode
                  ? "var(--primary)"
                  : "rgba(255,255,255,0.12)",
              }}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                  darkMode ? "left-4" : "left-0.5"
                }`}
              />
            </div>
          )}
        </button>

        <div
          className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2.5 py-2.5 rounded-xl transition-all`}
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {(profile?.name ?? "G")[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] font-medium truncate"
                style={{ color: "var(--sidebar-fg)" }}
              >
                {profile?.name ?? "Guest"}
              </div>
              <div
                className="text-[10px] truncate"
                style={{ color: "var(--sidebar-muted)" }}
              >
                {profile?.isGuest ? "Guest mode" : "Signed in"}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onLogout}
          className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2.5 py-2.5 rounded-xl text-[13px] font-medium transition-all hover:bg-white/5`}
          style={{ color: "var(--sidebar-muted)" }}
          title={collapsed ? "Sign out" : undefined}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3H4.5A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  )
}

// ── Today View ─────────────────────────────────────────────────────────────────

function TodayView({
  tasks,
  setTasks,
  projects,
  setProjects,
  dateStr,
  timeStr,
  now,
  settings,
  updateSetting,
  toggleTask,
  deleteTask,
  addToast,
  restoreFromSomeday,
  profile,
  streak,
  completionDays,
}: {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  projects: Project[]
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  dateStr: string
  timeStr: string
  now: Date
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void
  addToast: (m: string, t?: ToastType) => void
  restoreFromSomeday: (id: string) => void
  profile: UserProfile | null
  streak: number
  completionDays: string[]
}) {
  const [quickText, setQuickText] = useState("")
  const [expandForm, setExpandForm] = useState(false)
  const [newPriority, setNewPriority] = useState<Priority>("medium")
  const [newProject, setNewProject] = useState(projects[0]?.name ?? "Personal")
  const [newDueDate, setNewDueDate] = useState(todayStr())
  const [newDueTime, setNewDueTime] = useState("")
  const [newAssignee, setNewAssignee] = useState("")
  const [newDoD, setNewDoD] = useState("")
  const [newRecurring, setNewRecurring] = useState<Task["recurring"]>(null)
  const [showSomeday, setShowSomeday] = useState(false)
  const [clarifyTask, setClarifyTask] = useState<Task | null>(null)
  const [clarifyText, setClarifyText] = useState("")

  const allActive = tasks.filter((t) => !t.someday)
  const pending = rankTasks(
    allActive.filter((t) => !t.done),
    profile?.decisionStyle,
  )
  const done = allActive.filter((t) => t.done)
  const someday = tasks.filter((t) => t.someday)
  const nextAction = pending[0] ?? null
  const restOfList = pending.slice(1)
  const pct = allActive.length
    ? Math.round((done.length / allActive.length) * 100)
    : 0
  const quote = getDayQuote()

  // Surface vague task prompts for first unaddressed vague task
  const vagueTask = pending.find((t) => !t.clarified && isVague(t.text))

  const addTask = () => {
    if (!quickText.trim()) return
    const t: Task = {
      id: genId(),
      text: quickText.trim(),
      done: false,
      priority: newPriority,
      project: newProject,
      dueDate: newDueDate || todayStr(),
      dueTime: newDueTime || null,
      assignee: newAssignee || null,
      definitionOfDone: newDoD,
      subtaskCount: 0,
      commentCount: 0,
      recurring: newRecurring,
      someday: false,
      lastTouched: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      nextStep: "",
      clarified: !isVague(quickText.trim()),
    }
    setTasks((ts) => [t, ...ts])
    setProjects((ps) =>
      ps.some((p) => p.name === newProject)
        ? ps
        : [
            ...ps,
            {
              id: genId(),
              name: newProject,
              color: PROJECT_COLORS[ps.length % PROJECT_COLORS.length],
            },
          ],
    )
    setQuickText("")
    setExpandForm(false)
    setNewDueTime("")
    setNewAssignee("")
    setNewDoD("")
    addToast("Task added")
  }

  const applyClarification = (id: string, text: string) => {
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id
          ? {
              ...t,
              text: text || t.text,
              nextStep: text,
              clarified: true,
              lastTouched: new Date().toISOString(),
            }
          : t,
      ),
    )
    setClarifyTask(null)
    setClarifyText("")
    addToast("Task updated")
  }

  const today = now.getDay()

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <p
          className="text-[11px] font-semibold tracking-widest uppercase mb-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          {dateStr}
        </p>
        <div className="flex items-baseline justify-between gap-4">
          <h1
            className="text-2xl sm:text-3xl font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {getGreeting(now.getHours())}, {profile?.name ?? "there"}
          </h1>
          <span
            className="text-sm tabular-nums font-medium flex-shrink-0"
            style={{ color: "var(--muted-foreground)" }}
          >
            {timeStr}
          </span>
        </div>
      </div>

      {/* Quote — collapsible strip */}
      <div
        className="rounded-xl overflow-hidden cursor-pointer select-none"
        style={{ background: "var(--sidebar)" }}
        onClick={() =>
          updateSetting("quoteCollapsed", !settings.quoteCollapsed)
        }
      >
        {settings.quoteCollapsed ? (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-lg opacity-40">"</span>
            <p
              className="text-[12px] italic truncate flex-1"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              {quote.text.slice(0, 72)}
              {quote.text.length > 72 ? "…" : ""}
            </p>
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              className="opacity-30 flex-shrink-0"
            >
              <path
                d="M3 4.5L6 7.5 9 4.5"
                stroke="white"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <div className="px-5 py-5">
            <p
              className="font-display text-base sm:text-lg italic font-light leading-relaxed"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              "{quote.text}"
            </p>
            <p
              className="text-[11px] mt-3"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              — {quote.author} · click to collapse
            </p>
          </div>
        )}
      </div>

      {/* Progress + momentum */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex-1">
          <div
            className="flex justify-between text-[11px] mb-1.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            <span>Today's progress</span>
            <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
              {done.length}/{allActive.length}
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--muted)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: "var(--primary)" }}
            />
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="text-sm font-bold tabular-nums"
            style={{ color: pct === 100 ? "#10b981" : "var(--primary)" }}
          >
            {pct}%
          </div>
          {streak > 0 && (
            <div
              className="text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              🔥 {streak}d streak
            </div>
          )}
        </div>
      </div>

      {/* Vague task clarification prompt */}
      {vagueTask && !clarifyTask && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-[12px] font-semibold mb-1"
            style={{ color: "var(--foreground)" }}
          >
            💡 What's the next concrete action for <em>"{vagueTask.text}"</em>?
          </p>
          <p
            className="text-[11px] mb-3"
            style={{ color: "var(--muted-foreground)" }}
          >
            Vague tasks are harder to start. A clearer action makes it easier to
            begin.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setClarifyTask(vagueTask)
                setClarifyText(vagueTask.text)
              }}
              className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              Clarify →
            </button>
            <button
              onClick={() =>
                setTasks((ts) =>
                  ts.map((t) =>
                    t.id === vagueTask.id ? { ...t, clarified: true } : t,
                  ),
                )
              }
              className="text-[12px] px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--muted)",
                color: "var(--muted-foreground)",
              }}
            >
              Keep as-is
            </button>
          </div>
        </div>
      )}
      {clarifyTask && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "var(--card)",
            border: "1px solid var(--primary)",
            boxShadow: "0 0 0 3px rgba(99,102,241,0.08)",
          }}
        >
          <p
            className="text-[12px] font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            What's the next concrete step?
          </p>
          <input
            autoFocus
            type="text"
            value={clarifyText}
            onChange={(e) => setClarifyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                applyClarification(clarifyTask.id, clarifyText)
              if (e.key === "Escape") setClarifyTask(null)
            }}
            className="w-full text-[13px] px-3 py-2 rounded-lg outline-none"
            style={{
              background: "var(--muted)",
              color: "var(--foreground)",
              border: "none",
            }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setTasks((ts) =>
                  ts.map((t) =>
                    t.id === clarifyTask.id ? { ...t, clarified: true } : t,
                  ),
                )
                setClarifyTask(null)
              }}
              className="text-[11px] px-3 py-1.5 rounded-lg"
              style={{
                color: "var(--muted-foreground)",
                background: "var(--muted)",
              }}
            >
              Keep original
            </button>
            <button
              onClick={() => applyClarification(clarifyTask.id, clarifyText)}
              className="text-[11px] px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              Update task
            </button>
          </div>
        </div>
      )}

      {/* Quick add */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: `1px solid ${
            expandForm ? "var(--primary)" : "var(--border)"
          }`,
          boxShadow: expandForm ? "0 0 0 3px rgba(99,102,241,0.07)" : undefined,
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className="w-5 h-5 rounded-full border-2 flex-shrink-0"
            style={{ borderColor: "var(--border)" }}
          />
          <input
            id="quick-add-input"
            type="text"
            placeholder="Add a task… (press / to focus)"
            value={quickText}
            onChange={(e) => {
              setQuickText(e.target.value)
              if (!expandForm && e.target.value) setExpandForm(true)
            }}
            onFocus={() => {
              if (quickText) setExpandForm(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask()
              if (e.key === "Escape") {
                setExpandForm(false)
                setQuickText("")
              }
            }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--foreground)" }}
          />
          <kbd
            className="hidden sm:block text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              border: "1px solid var(--border)",
            }}
          >
            /
          </kbd>
        </div>
        {expandForm && (
          <div
            className="px-4 pb-4 space-y-3 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-wrap gap-2 pt-3">
              <div className="flex gap-1">
                {(["high", "medium", "low"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      newPriority === p ? priorityConfig[p].badge : ""
                    }`}
                    style={
                      newPriority !== p
                        ? {
                            color: "var(--muted-foreground)",
                            background: "var(--muted)",
                          }
                        : undefined
                    }
                  >
                    {priorityConfig[p].label}
                  </button>
                ))}
              </div>
              <select
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none font-medium"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "none",
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "none",
                }}
              />
              <input
                type="time"
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "none",
                }}
              />
              <select
                value={newRecurring ?? ""}
                onChange={(e) =>
                  setNewRecurring(e.target.value as Task["recurring"] || null)
                }
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "none",
                }}
              >
                <option value="">No recurrence</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Assignee (optional)"
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "none",
                }}
              />
              {newAssignee && (
                <input
                  type="text"
                  placeholder="Definition of done…"
                  value={newDoD}
                  onChange={(e) => setNewDoD(e.target.value)}
                  className="flex-[2] text-[12px] px-3 py-1.5 rounded-lg outline-none"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    border: "none",
                  }}
                />
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setExpandForm(false)
                  setQuickText("")
                }}
                className="text-[12px] px-3 py-1.5 rounded-lg"
                style={{
                  color: "var(--muted-foreground)",
                  background: "var(--muted)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={addTask}
                className="text-[12px] px-4 py-1.5 rounded-lg font-semibold"
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                Add task
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Next action */}
      {nextAction && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            Next action
          </p>
          <div
            className="rounded-xl px-4 py-4 relative overflow-hidden"
            style={{
              background: "var(--sidebar)",
              border: "1px solid rgba(99,102,241,0.25)",
            }}
          >
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 50%, #6366f1 0%, transparent 70%)",
              }}
            />
            <div className="relative flex items-center gap-3">
              <button
                onClick={() => toggleTask(nextAction.id)}
                className="w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center"
                style={{ borderColor: "rgba(255,255,255,0.3)" }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: "rgba(255,255,255,0.95)" }}
                >
                  {nextAction.text}
                </p>
                <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                  {isOverdue(nextAction.dueDate) && (
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: "#f87171" }}
                    >
                      ⚠ Overdue
                    </span>
                  )}
                  {isDueToday(nextAction.dueDate) &&
                    !isOverdue(nextAction.dueDate) && (
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: "#a5b4fc" }}
                      >
                        Due today
                      </span>
                    )}
                  {nextAction.dueTime && (
                    <span
                      className="text-[11px]"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                      at {nextAction.dueTime}
                    </span>
                  )}
                  {nextAction.assignee && (
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-indigo-400 flex items-center justify-center text-[9px] font-bold text-white">
                        {nextAction.assignee[0]}
                      </div>
                      <span
                        className="text-[11px]"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        {nextAction.assignee}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <span
                className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${priorityConfig[nextAction.priority].badge}`}
              >
                {priorityConfig[nextAction.priority].label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Up next */}
      {restOfList.length > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            Up next
          </p>
          <div className="space-y-1.5">
            {restOfList.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            Completed ({done.length})
          </p>
          <div className="space-y-1.5">
            {done.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && done.length === 0 && !expandForm && (
        <div
          className="text-center py-10 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          No tasks yet — type above to add one
        </div>
      )}

      {/* Someday */}
      {someday.length > 0 && (
        <div>
          <button
            onClick={() => setShowSomeday((s) => !s)}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              style={{
                transform: showSomeday ? "rotate(90deg)" : undefined,
                transition: "transform 0.15s",
              }}
            >
              <path
                d="M3 2l4 3-4 3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Someday ({someday.length})
          </button>
          {showSomeday && (
            <div className="space-y-1.5">
              {someday.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    opacity: 0.65,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 flex-shrink-0"
                    style={{
                      borderStyle: "dashed",
                      borderColor: "var(--border)",
                    }}
                  />
                  <span
                    className="flex-1 text-[13px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {t.text}
                  </span>
                  <button
                    onClick={() => restoreFromSomeday(t.id)}
                    className="text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--primary)" }}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L11 3.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weekly rhythm */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-[13px] font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Weekly rhythm
          </h3>
          <span
            className="text-[11px] font-semibold"
            style={{
              color:
                done.length > 0 ? "var(--primary)" : "var(--muted-foreground)",
            }}
          >
            {done.length > 0 ? "On track" : "Get started"}
          </span>
        </div>
        <div className="flex items-end gap-2 h-12">
          {WEEKDAYS.map((d, i) => {
            const filled = completionDays.includes(dateOffsetStr(i - today))
            const isToday = i === today
            return (
              <div
                key={d}
                className="flex-1 flex flex-col items-center gap-1.5"
              >
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: isToday ? "80%" : filled ? "60%" : "20%",
                    background: isToday
                      ? "var(--primary)"
                      : filled
                        ? "var(--secondary)"
                        : "var(--muted)",
                    minHeight: 4,
                  }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{
                    color: isToday
                      ? "var(--primary)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {d}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const p = priorityConfig[task.priority]
  const overdue = isOverdue(task.dueDate)
  const dueToday = isDueToday(task.dueDate)
  const reason = getRankReason(task)
  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:shadow-sm ${
        task.done ? "opacity-50" : ""
      }`}
      style={{
        background: "var(--card)",
        border: `1px solid var(--border)`,
        borderLeft:
          overdue && !task.done
            ? "3px solid #ef4444"
            : dueToday && !task.done
              ? "3px solid var(--primary)"
              : undefined,
      }}
    >
      <button
        onClick={() => onToggle(task.id)}
        className="w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-all"
        style={{
          borderColor: task.done ? "var(--primary)" : "var(--muted-foreground)",
          background: task.done ? "var(--primary)" : "transparent",
        }}
      >
        {task.done && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4l3 3 5-6"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className={`text-[13px] ${task.done ? "line-through" : ""}`}
          style={{
            color: task.done ? "var(--muted-foreground)" : "var(--foreground)",
          }}
        >
          {task.text}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          {reason && !task.done && (
            <span
              className="text-[10px] font-semibold"
              style={{
                color: overdue
                  ? "#ef4444"
                  : dueToday
                    ? "var(--primary)"
                    : "var(--muted-foreground)",
              }}
            >
              {reason}
            </span>
          )}
          {task.dueTime && !task.done && (
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "var(--muted-foreground)" }}
            >
              {task.dueTime}
            </span>
          )}
          {task.recurring && (
            <span
              className="text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              ↻ {task.recurring}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {task.subtaskCount > 0 && (
          <span
            className="hidden sm:flex items-center gap-1 text-[10px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 3h8M2 6h5M2 9h6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            {task.subtaskCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span
            className="hidden sm:flex items-center gap-1 text-[10px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 2h8a1 1 0 011 1v5a1 1 0 01-1 1H4L2 11V3a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
            {task.commentCount}
          </span>
        )}
        {task.assignee && (
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-[9px] font-bold text-white">
            {task.assignee[0].toUpperCase()}
          </div>
        )}
        <span
          className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
          {p.label}
        </span>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all"
          style={{ color: "var(--muted-foreground)" }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L11 3.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── End-of-day Recap ───────────────────────────────────────────────────────────

function EndOfDayRecap({
  tasks,
  setTasks,
  onClose,
  addToast,
}: {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  onClose: () => void
  addToast: (m: string, t?: ToastType) => void
}) {
  const completed = tasks.filter((t) => t.done && isDueToday(t.dueDate))
  const unfinished = tasks.filter(
    (t) => !t.done && !t.someday && isDueToday(t.dueDate),
  )

  const carryOver = () => {
    setTasks((ts) =>
      ts.map((t) =>
        unfinished.find((u) => u.id === t.id)
          ? { ...t, dueDate: dateOffsetStr(1) }
          : t,
      ),
    )
    addToast(
      `${unfinished.length} task${
        unfinished.length > 1 ? "s" : ""
      } carried to tomorrow`,
    )
    onClose()
  }

  return (
    <Modal onClose={onClose} title="End of day">
      <div className="space-y-5">
        <p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
          Here's how today went for you.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: "#065f46" }}
          >
            <div className="text-2xl font-bold text-white">
              {completed.length}
            </div>
            <div className="text-[11px] text-white/70">Completed</div>
          </div>
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: "var(--muted)" }}
          >
            <div
              className="text-2xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {unfinished.length}
            </div>
            <div
              className="text-[11px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Unfinished
            </div>
          </div>
        </div>
        {unfinished.length > 0 && (
          <div className="space-y-2">
            <p
              className="text-[12px] font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Unfinished tasks
            </p>
            {unfinished.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 text-[13px]"
                style={{ color: "var(--foreground)" }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--muted-foreground)" }}
                />
                {t.text}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {unfinished.length > 0 && (
            <button
              onClick={carryOver}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              Carry over to tomorrow
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium"
            style={{ background: "var(--muted)", color: "var(--foreground)" }}
          >
            {unfinished.length > 0 ? "Leave for now" : "Great work! Close"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Weekly Review ─────────────────────────────────────────────────────────────

function WeeklyReview({
  tasks,
  setTasks,
  onClose,
  addToast,
}: {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  onClose: () => void
  addToast: (m: string, t?: ToastType) => void
}) {
  const stale = tasks.filter(
    (t) => !t.done && !t.someday && daysSince(t.createdAt) >= 7,
  )
  const [decisions, setDecisions] =
    useState<Record<string, "keep" | "drop" | "reschedule">>({})

  const apply = () => {
    setTasks((ts) =>
      ts.map((t) => {
        const d = decisions[t.id]
        if (!d) return t
        if (d === "drop") return { ...t, someday: true }
        if (d === "reschedule")
          return {
            ...t,
            dueDate: dateOffsetStr(3),
            lastTouched: new Date().toISOString(),
          }
        return { ...t, lastTouched: new Date().toISOString() }
      }),
    )
    const kept = Object.values(decisions).filter((d) => d === "keep").length
    const dropped = Object.values(decisions).filter((d) => d === "drop").length
    addToast(`Review done — ${kept} kept, ${dropped} moved to Someday`)
    onClose()
  }

  return (
    <Modal onClose={onClose} title="Weekly review">
      <div className="space-y-4">
        <p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
          These {stale.length} tasks haven't moved in 7+ days. What should
          happen to them?
        </p>
        {stale.length === 0 && (
          <p
            className="text-[13px] text-center py-4"
            style={{ color: "var(--muted-foreground)" }}
          >
            No stale tasks — you're on top of things! 🎉
          </p>
        )}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {stale.map((t) => (
            <div
              key={t.id}
              className="rounded-xl p-3"
              style={{ background: "var(--muted)" }}
            >
              <p
                className="text-[13px] font-medium mb-2"
                style={{ color: "var(--foreground)" }}
              >
                {t.text}
              </p>
              <div className="flex gap-1.5">
                {(["keep", "reschedule", "drop"] as const).map((action) => (
                  <button
                    key={action}
                    onClick={() =>
                      setDecisions((d) => ({ ...d, [t.id]: action }))
                    }
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all"
                    style={
                      decisions[t.id] === action
                        ? {
                            background:
                              action === "drop"
                                ? "#7c2d12"
                                : action === "keep"
                                  ? "#065f46"
                                  : "var(--primary)",
                            color: "#fff",
                          }
                        : {
                            background: "var(--card)",
                            color: "var(--muted-foreground)",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {stale.length > 0 && (
          <button
            onClick={apply}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            Apply decisions
          </button>
        )}
      </div>
    </Modal>
  )
}

// ── Projects View ──────────────────────────────────────────────────────────────

function ProjectsView({
  projects,
  tasks,
  setProjects,
  toggleTask,
  deleteTask,
  addToast,
  profile,
}: {
  projects: Project[]
  tasks: Task[]
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void
  addToast: (m: string, t?: ToastType) => void
  profile: UserProfile | null
}) {
  const [active, setActive] = useState(projects[0]?.name ?? "")
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")

  const addProject = () => {
    if (!newName.trim()) return
    setProjects((ps) => [
      ...ps,
      {
        id: genId(),
        name: newName.trim(),
        color: PROJECT_COLORS[ps.length % PROJECT_COLORS.length],
      },
    ])
    setActive(newName.trim())
    setNewName("")
    setAdding(false)
    addToast("Project created")
  }
  const projectTasks = rankTasks(
    tasks.filter((t) => t.project === active),
    profile?.decisionStyle,
  )
  const done = projectTasks.filter((t) => t.done).length

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl sm:text-3xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Projects
        </h1>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold hover:scale-105 transition-all"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 2v10M2 7h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          New
        </button>
      </div>
      {adding && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "var(--card)",
            border: "1px solid var(--primary)",
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addProject()
              if (e.key === "Escape") setAdding(false)
            }}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "var(--foreground)" }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setAdding(false)}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                color: "var(--muted-foreground)",
                background: "var(--muted)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={addProject}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              Create
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setActive(p.name)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
            style={
              active === p.name
                ? { background: p.color, color: "#fff" }
                : {
                    background: "var(--card)",
                    color: "var(--muted-foreground)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background:
                  active === p.name ? "rgba(255,255,255,0.6)" : p.color,
              }}
            />
            {p.name}{" "}
            <span className="text-[10px] opacity-70">
              {tasks.filter((t) => t.project === p.name).length}
            </span>
          </button>
        ))}
      </div>
      {active && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Total", v: projectTasks.length },
              { l: "Done", v: done },
              { l: "Remaining", v: projectTasks.length - done },
            ].map((k) => (
              <div
                key={k.l}
                className="rounded-xl p-4 text-center"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="text-2xl font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  {k.v}
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {k.l}
                </div>
              </div>
            ))}
          </div>
          {projectTasks.length === 0 ? (
            <div
              className="text-center py-8 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              No tasks in this project
            </div>
          ) : (
            <div className="space-y-1.5">
              {projectTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Notes View ─────────────────────────────────────────────────────────────────

function NotesView({
  notes,
  setNotes,
  addToast,
}: {
  notes: Note[]
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>
  addToast: (m: string, t?: ToastType) => void
}) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const save = () => {
    if (!title.trim()) return
    if (editId) {
      setNotes((ns) =>
        ns.map((n) => (n.id === editId ? { ...n, title, body } : n)),
      )
      addToast("Note updated")
    } else {
      setNotes((ns) => [
        {
          id: genId(),
          title: title.trim(),
          body: body.trim(),
          createdAt: new Date().toISOString(),
        },
        ...ns,
      ])
      addToast("Note saved")
    }
    setTitle("")
    setBody("")
    setAdding(false)
    setEditId(null)
  }
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl sm:text-3xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Notes
        </h1>
        <button
          onClick={() => {
            setAdding(true)
            setEditId(null)
            setTitle("")
            setBody("")
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold hover:scale-105 transition-all"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 2v10M2 7h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          New
        </button>
      </div>
      {adding && (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--card)",
            border: "1px solid var(--primary)",
            boxShadow: "0 0 0 3px rgba(99,102,241,0.07)",
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent font-medium outline-none"
            style={{ color: "var(--foreground)" }}
          />
          <textarea
            placeholder="Write your note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full bg-transparent text-[13px] outline-none resize-none"
            style={{ color: "var(--foreground)" }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setAdding(false)
                setEditId(null)
              }}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                color: "var(--muted-foreground)",
                background: "var(--muted)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {editId ? "Save" : "Add note"}
            </button>
          </div>
        </div>
      )}
      {notes.length === 0 && !adding && (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          No notes yet
        </div>
      )}
      <div className="space-y-3">
        {notes.map((n) => (
          <div
            key={n.id}
            className="group rounded-xl p-4 transition-all hover:shadow-sm"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                className="font-medium text-[14px]"
                style={{ color: "var(--foreground)" }}
              >
                {n.title}
              </h3>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => {
                    setEditId(n.id)
                    setTitle(n.title)
                    setBody(n.body)
                    setAdding(true)
                  }}
                  className="p-1.5 rounded-lg hover:bg-[var(--muted)]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setNotes((ns) => ns.filter((x) => x.id !== n.id))
                    addToast("Note deleted", "warning")
                  }}
                  className="p-1.5 rounded-lg hover:bg-rose-50"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L11 3.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            {n.body && (
              <p
                className="text-[13px] mt-2 leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--muted-foreground)" }}
              >
                {n.body}
              </p>
            )}
            <p
              className="text-[10px] mt-2.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              {new Date(n.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Insights View ──────────────────────────────────────────────────────────────

function InsightsView({
  tasks,
  now,
  settings,
  completionDays,
  streak,
}: {
  tasks: Task[]
  now: Date
  settings: AppSettings
  completionDays: string[]
  streak: number
}) {
  const completed = tasks.filter((t) => t.done).length
  const total = tasks.length
  const high = tasks.filter((t) => t.priority === "high" && !t.done).length
  const byPriority = {
    high: tasks.filter((t) => t.priority === "high").length,
    medium: tasks.filter((t) => t.priority === "medium").length,
    low: tasks.filter((t) => t.priority === "low").length,
  }
  const maxPri = Math.max(...Object.values(byPriority), 1)
  const today = now.getDay()
  const weekData = WEEKDAYS.map((_, i) => {
    const dayStr = dateOffsetStr(i - today)
    return completionDays.includes(dayStr)
      ? Math.floor(Math.random() * 5) + 1
      : i < today
        ? 1
        : 0
  })
  const maxWeek = Math.max(...weekData, 1)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1
        className="text-2xl sm:text-3xl font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        Insights
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "Total", v: total, s: "all time" },
          {
            l: "Completed",
            v: completed,
            s: `${total ? Math.round((completed / total) * 100) : 0}% rate`,
          },
          { l: "High open", v: high, s: "items" },
          { l: "Day streak", v: streak, s: "days in a row" },
        ].map((k) => (
          <div
            key={k.l}
            className="rounded-xl p-4"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="text-2xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {k.v}
            </div>
            <div
              className="text-[12px] font-medium mt-1"
              style={{ color: "var(--foreground)" }}
            >
              {k.l}
            </div>
            <div
              className="text-[10px] mt-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              {k.s}
            </div>
          </div>
        ))}
      </div>
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-[13px] font-medium"
            style={{ color: "var(--foreground)" }}
          >
            This week
          </h3>
          <span
            className="text-[11px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {weekData.reduce((a, b) => a + b, 0)} completions
          </span>
        </div>
        <div className="flex items-end gap-3 h-20">
          {WEEKDAYS.map((d, i) => {
            const h = (weekData[i] / maxWeek) * 100
            const isToday = i === today
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-2">
                <span
                  className="text-[10px] tabular-nums"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {weekData[i] || ""}
                </span>
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(h * 0.85, 5)}%`,
                    background: isToday ? "var(--primary)" : "var(--secondary)",
                    opacity: i > today ? 0.25 : 1,
                    minHeight: 4,
                  }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{
                    color: isToday
                      ? "var(--primary)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {d}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <h3
          className="text-[13px] font-medium mb-4"
          style={{ color: "var(--foreground)" }}
        >
          Priority breakdown
        </h3>
        <div className="space-y-3">
          {(["high", "medium", "low"] as Priority[]).map((p) => {
            const count = byPriority[p]
            const pct = (count / maxPri) * 100
            const cfg = priorityConfig[p]
            return (
              <div key={p} className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span
                    className="font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    {cfg.label}
                  </span>
                  <span style={{ color: "var(--muted-foreground)" }}>
                    {count} tasks
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--muted)" }}
                >
                  <div
                    className={`h-full rounded-full ${cfg.dot}`}
                    style={{ width: `${pct}%`, transition: "width 0.5s" }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {settings.proView && (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            <h3
              className="text-[13px] font-medium"
              style={{ color: "var(--foreground)" }}
            >
              Advanced
            </h3>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: "var(--secondary)",
                color: "var(--primary)",
              }}
            >
              Pro
            </span>
          </div>
          {[
            { l: "Blocked tasks", v: 2, n: "2 waiting on dependencies" },
            { l: "Automations", v: 1, n: "1 rule active" },
            { l: "Integrations", v: 0, n: "Connect Slack, Calendar, GitHub" },
          ].map((r) => (
            <div
              key={r.l}
              className="flex items-center justify-between py-2 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <div
                  className="text-[13px] font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {r.l}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {r.n}
                </div>
              </div>
              <span
                className="text-lg font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {r.v}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings View ──────────────────────────────────────────────────────────────

function SettingsView({
  settings,
  updateSetting,
  profile,
  setProfile,
}: {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  profile: UserProfile | null
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>
}) {
  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h1
        className="text-2xl sm:text-3xl font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        Settings
      </h1>
      <Section title="Notifications">
        <div className="space-y-2">
          {([
            { value: "all", label: "All", desc: "Every task update" },
            {
              value: "digest",
              label: "Daily digest",
              desc: "One summary at 9am",
            },
            {
              value: "urgent",
              label: "Urgent only",
              desc: "High-priority or overdue only",
            },
          ] as {
            value: AppSettings["notificationMode"]
            label: string
            desc: string
          }[]).map((opt) => (
            <label
              key={opt.value}
              className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer"
              style={{
                background:
                  settings.notificationMode === opt.value
                    ? "var(--secondary)"
                    : "var(--card)",
                border: `1px solid ${
                  settings.notificationMode === opt.value
                    ? "var(--primary)"
                    : "var(--border)"
                }`,
              }}
            >
              <div>
                <div
                  className="text-[13px] font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {opt.label}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {opt.desc}
                </div>
              </div>
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center ml-3"
                style={{
                  borderColor:
                    settings.notificationMode === opt.value
                      ? "var(--primary)"
                      : "var(--border)",
                }}
              >
                {settings.notificationMode === opt.value && (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--primary)" }}
                  />
                )}
              </div>
              <input
                type="radio"
                className="sr-only"
                onChange={() => updateSetting("notificationMode", opt.value)}
              />
            </label>
          ))}
        </div>
      </Section>
      <Section title="Someday bucket">
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--muted-foreground)" }}
        >
          Auto-move untouched tasks after:
        </p>
        <div className="flex gap-2">
          {[1, 3, 7, 14].map((n) => (
            <button
              key={n}
              onClick={() => updateSetting("staleThresholdDays", n)}
              className="px-3 py-1.5 rounded-xl text-[13px] font-medium"
              style={
                settings.staleThresholdDays === n
                  ? { background: "var(--primary)", color: "#fff" }
                  : { background: "var(--muted)", color: "var(--foreground)" }
              }
            >
              {n}d
            </button>
          ))}
        </div>
      </Section>
      <Section title="Advanced">
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--foreground)" }}
            >
              Pro view
            </p>
            <p
              className="text-[11px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Show dependencies and automations in Insights
            </p>
          </div>
          <button
            onClick={() => updateSetting("proView", !settings.proView)}
            className="w-11 h-6 rounded-full relative flex-shrink-0 ml-4"
            style={{
              background: settings.proView ? "var(--primary)" : "var(--muted)",
            }}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                settings.proView ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
      </Section>
      <Section title="What's free — always">
        <div className="space-y-1.5">
          {[
            "Unlimited tasks",
            "Projects / categories",
            "Reminders",
            "History",
            "Today view",
            "Momentum",
            "End-of-day recap",
            "Weekly review",
            "Offline use",
            "Personal sync",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2 text-[13px]">
              <span style={{ color: "#10b981" }}>✓</span>
              <span style={{ color: "var(--foreground)" }}>{f}</span>
            </div>
          ))}
          <div
            className="pt-2 border-t mt-2"
            style={{ borderColor: "var(--border)" }}
          >
            <p
              className="text-[11px] font-semibold mb-1.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Scale plan only
            </p>
            {[
              "Team workspaces",
              "Third-party integrations",
              "Advanced reporting",
              "Priority support",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-[13px]">
                <span style={{ color: "var(--muted-foreground)" }}>—</span>
                <span style={{ color: "var(--muted-foreground)" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Changelog View ─────────────────────────────────────────────────────────────

function ChangelogView() {
  const tagStyle: Record<string, React.CSSProperties> = {
    new: { background: "var(--secondary)", color: "var(--primary)" },
    improved: { background: "#fef3c7", color: "#92400e" },
    launch: { background: "#d1fae5", color: "#065f46" },
  }
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1
          className="text-2xl sm:text-3xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          What's new
        </h1>
        <p
          className="text-[13px] mt-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          Improvements, fixes, and user-requested changes.
        </p>
      </div>
      {CHANGELOG.map((entry) => (
        <div
          key={entry.version}
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-[13px] font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {entry.version}
            </span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={tagStyle[entry.tag]}
            >
              {entry.tag}
            </span>
            <span
              className="text-[11px] ml-auto"
              style={{ color: "var(--muted-foreground)" }}
            >
              {entry.date}
            </span>
          </div>
          <ul className="space-y-1.5">
            {entry.items.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-[13px]"
                style={{ color: "var(--foreground)" }}
              >
                <span
                  className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--primary)" }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div
        className="rounded-xl p-4 text-center"
        style={{
          background: "var(--muted)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--foreground)" }}
        >
          Have feedback or a feature request?
        </p>
        <p
          className="text-[12px] mt-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          We prioritize based on what real users need.
        </p>
        <button
          className="mt-3 px-4 py-2 rounded-xl text-[13px] font-semibold"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          Send feedback
        </button>
      </div>
    </div>
  )
}

// ── Shared Components ─────────────────────────────────────────────────────────

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode
  onClose: () => void
  title?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div
        className="rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {title && (
          <h2
            className="text-[15px] font-semibold mb-4"
            style={{ color: "var(--foreground)" }}
          >
            {title}
          </h2>
        )}
        {children}
        <button
          onClick={onClose}
          className="w-full mt-4 text-[12px] py-1.5"
          style={{ color: "var(--muted-foreground)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <h2
        className="text-[11px] font-semibold uppercase tracking-widest mb-4"
        style={{ color: "var(--muted-foreground)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}
function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="2"
        y="4"
        width="12"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2 5l6 4 6-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 1v2M9 15v2M1 9h2M15 9h2M3.1 3.1l1.4 1.4M13.5 13.5l1.4 1.4M3.1 14.9l1.4-1.4M13.5 4.5l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
      <path
        d="M15 9.5A6.5 6.5 0 018.5 3a6.5 6.5 0 100 13A6.5 6.5 0 0015 9.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
