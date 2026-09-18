import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low'
type View = 'today' | 'projects' | 'notes' | 'insights' | 'settings'

interface Task {
  id: string
  text: string
  done: boolean
  priority: Priority
  project: string
  dueDate: string | null   // YYYY-MM-DD
  dueTime: string | null   // HH:MM
  assignee: string | null
  definitionOfDone: string
  subtaskCount: number
  commentCount: number
  recurring: 'daily' | 'weekly' | null
  someday: boolean
  lastTouched: string      // ISO
  createdAt: string        // ISO
  nextStep: string
}

interface Note    { id: string; title: string; body: string; createdAt: Date }
interface Project { id: string; name: string; color: string }
interface AppSettings {
  notificationMode: 'all' | 'digest' | 'urgent'
  staleThresholdDays: number
  proView: boolean
  quoteCollapsed: boolean
}

// ── Toast ──────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'info' | 'warning'
interface ToastMsg { id: string; message: string; type: ToastType }

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {})
function useToast() { return useContext(ToastCtx) }

function ToastContainer({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 320 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
          style={{
            background: t.type === 'success' ? '#065f46' : t.type === 'warning' ? '#92400e' : 'var(--sidebar)',
            color: '#fff',
            animation: 'slideUp 0.18s ease',
          }}
        >
          <span style={{ fontSize: 16 }}>
            {t.type === 'success' ? '✓' : t.type === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100 ml-1 text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  )
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PROJECT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

const priorityConfig = {
  high:   { label: 'High',   dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400',    rank: 0 },
  medium: { label: 'Medium', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400', rank: 1 },
  low:    { label: 'Low',    dot: 'bg-emerald-500',  badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400', rank: 2 },
}

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Productivity is never an accident. It is always the result of commitment to excellence.", author: "Paul J. Meyer" },
  { text: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { text: "What gets measured gets managed.", author: "Peter Drucker" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 10) }

function todayStr()     { return new Date().toISOString().split('T')[0] }
function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
function dateOffsetStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function isOverdue(dueDate: string | null): boolean {
  return !!dueDate && dueDate < todayStr()
}
function isDueToday(dueDate: string | null): boolean {
  return dueDate === todayStr()
}

function getGreeting(h: number) {
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getDayQuote() {
  const i = (new Date().getDay() * 4 + new Date().getDate()) % QUOTES.length
  return QUOTES[i]
}

function formatDueDate(date: string | null): string {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${-diff}d overdue`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function rankTasks(tasks: Task[]): Task[] {
  const today = todayStr()
  return [...tasks].sort((a, b) => {
    // Overdue first
    const ao = a.dueDate && a.dueDate < today ? 0 : 1
    const bo = b.dueDate && b.dueDate < today ? 0 : 1
    if (ao !== bo) return ao - bo
    // Then priority
    const pd = priorityConfig[a.priority].rank - priorityConfig[b.priority].rank
    if (pd !== 0) return pd
    // Oldest created first
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

// ── Initial Data ───────────────────────────────────────────────────────────────

const INITIAL_TASKS: Task[] = [
  {
    id: genId(), text: 'Review product brief', done: false, priority: 'high',
    project: 'Work', dueDate: todayStr(), dueTime: '10:30', assignee: 'Alex',
    definitionOfDone: 'All sections reviewed and feedback sent to team',
    subtaskCount: 3, commentCount: 2, recurring: null, someday: false,
    lastTouched: new Date().toISOString(), createdAt: daysAgoStr(2),
    nextStep: '',
  },
  {
    id: genId(), text: 'Prepare weekly report', done: false, priority: 'medium',
    project: 'Work', dueDate: todayStr(), dueTime: '17:00', assignee: null,
    definitionOfDone: '', subtaskCount: 0, commentCount: 0, recurring: 'weekly',
    someday: false, lastTouched: new Date().toISOString(), createdAt: daysAgoStr(7),
    nextStep: '',
  },
  {
    id: genId(), text: 'Finish landing page design', done: false, priority: 'high',
    project: 'Design', dueDate: dateOffsetStr(-1), dueTime: null, assignee: 'Sam',
    definitionOfDone: 'Desktop + mobile mockups approved by stakeholders',
    subtaskCount: 5, commentCount: 4, recurring: null, someday: false,
    lastTouched: new Date().toISOString(), createdAt: daysAgoStr(3),
    nextStep: '',
  },
  {
    id: genId(), text: 'Call dentist for appointment', done: true, priority: 'low',
    project: 'Personal', dueDate: todayStr(), dueTime: null, assignee: null,
    definitionOfDone: '', subtaskCount: 0, commentCount: 0, recurring: null,
    someday: false, lastTouched: new Date().toISOString(), createdAt: daysAgoStr(1),
    nextStep: '',
  },
  {
    id: genId(), text: 'Read 30 pages of current book', done: false, priority: 'low',
    project: 'Personal', dueDate: null, dueTime: null, assignee: null,
    definitionOfDone: '', subtaskCount: 0, commentCount: 0, recurring: 'daily',
    someday: false, lastTouched: daysAgoStr(5), createdAt: daysAgoStr(10),
    nextStep: '',
  },
  {
    id: genId(), text: 'Set up CI pipeline', done: false, priority: 'medium',
    project: 'Work', dueDate: null, dueTime: null, assignee: 'Jordan',
    definitionOfDone: 'Pipeline runs green on every PR',
    subtaskCount: 2, commentCount: 1, recurring: null, someday: false,
    lastTouched: daysAgoStr(6), createdAt: daysAgoStr(14),
    nextStep: '',
  },
]

const INITIAL_PROJECTS: Project[] = [
  { id: genId(), name: 'Work',     color: '#6366f1' },
  { id: genId(), name: 'Design',   color: '#f59e0b' },
  { id: genId(), name: 'Personal', color: '#10b981' },
]

const INITIAL_NOTES: Note[] = [
  { id: genId(), title: 'Weekly priorities', body: 'Focus on shipping the landing page. Block 3h of focus time daily. Don\'t book calls before 11am.', createdAt: new Date() },
  { id: genId(), title: 'Ideas backlog', body: 'Add recurring task support. Dark mode toggle in sidebar. Weekly email digest. Calendar sync.', createdAt: new Date() },
]

const WEEK_DATA = [3, 5, 2, 7, 4, 6, 1]

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [darkMode, setDarkMode]   = useState(false)
  const [view, setView]           = useState<View>('today')
  const [tasks, setTasks]         = useState<Task[]>(INITIAL_TASKS)
  const [projects, setProjects]   = useState<Project[]>(INITIAL_PROJECTS)
  const [notes, setNotes]         = useState<Note[]>(INITIAL_NOTES)
  const [now, setNow]             = useState(new Date())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toasts, setToasts]       = useState<ToastMsg[]>([])
  const [settings, setSettings]   = useState<AppSettings>({
    notificationMode: 'digest',
    staleThresholdDays: 3,
    proView: false,
    quoteCollapsed: true,
  })
  // Recurring task dialog
  const [recurringDialog, setRecurringDialog] = useState<Task | null>(null)
  // Stale review dialog
  const [staleReview, setStaleReview] = useState<Task[]>([])
  const [showStaleReview, setShowStaleReview] = useState(false)

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = genId()
    setToasts(ts => [...ts, { id, message, type }])
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 3500)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(ts => ts.filter(t => t.id !== id))
  }, [])

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Stale task detection on mount
  useEffect(() => {
    const today = new Date()
    const stale: Task[] = []
    setTasks(ts => ts.map(t => {
      if (t.done || t.someday) return t
      const days = Math.floor((today.getTime() - new Date(t.lastTouched).getTime()) / 86400000)
      if (days >= settings.staleThresholdDays) {
        stale.push(t)
        return { ...t, someday: true }
      }
      return t
    }))
    if (stale.length > 0) {
      setTimeout(() => {
        setStaleReview(stale)
        addToast(`${stale.length} stale task${stale.length > 1 ? 's' : ''} moved to Someday — review them`, 'info')
      }, 800)
    }
  }, []) // eslint-disable-line

  // Global quick-add shortcut: press "/" outside inputs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/') {
        e.preventDefault()
        setView('today')
        setTimeout(() => {
          document.getElementById('quick-add-input')?.focus()
        }, 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    if (!task.done && task.recurring) {
      setRecurringDialog(task)
      return
    }
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done, lastTouched: new Date().toISOString() } : t))
    if (!task.done) addToast('Task completed ✓')
  }

  const deleteTask = (id: string) => {
    setTasks(ts => ts.filter(t => t.id !== id))
    addToast('Task removed', 'warning')
  }

  const handleRecurring = (task: Task, action: 'done' | 'skip' | 'snooze1d' | 'snooze1w') => {
    setRecurringDialog(null)
    if (action === 'done') {
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done: true, lastTouched: new Date().toISOString() } : t))
      addToast('Recurring task marked done')
    } else if (action === 'skip') {
      addToast('Skipped this occurrence', 'info')
    } else {
      const days = action === 'snooze1d' ? 1 : 7
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, dueDate: dateOffsetStr(days), lastTouched: new Date().toISOString() } : t))
      addToast(`Snoozed ${days === 1 ? '1 day' : '1 week'}`, 'info')
    }
  }

  const restoreFromSomeday = (id: string) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, someday: false, lastTouched: new Date().toISOString() } : t))
    addToast('Task restored to Today')
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings(s => ({ ...s, [key]: val }))
  }

  const quote = getDayQuote()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  return (
    <ToastCtx.Provider value={addToast}>
      <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)}/>
        )}

        {/* Sidebar */}
        <div className={`fixed lg:static inset-y-0 left-0 z-40 w-56 flex-shrink-0 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <Sidebar
            view={view}
            setView={(v) => { setView(v); setSidebarOpen(false) }}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
          />
        </div>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Mobile topbar */}
          <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <button onClick={() => setSidebarOpen(s => !s)} className="p-2 rounded-lg" style={{ color: 'var(--muted-foreground)' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
            <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>daymark</span>
            <button onClick={() => setDarkMode(d => !d)} className="p-2 rounded-lg" style={{ color: 'var(--muted-foreground)' }}>
              {darkMode
                ? <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.1 3.1l1.4 1.4M13.5 13.5l1.4 1.4M3.1 14.9l1.4-1.4M13.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                : <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M15 9.5A6.5 6.5 0 018.5 3a6.5 6.5 0 100 13A6.5 6.5 0 0115 9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              }
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
            {view === 'today' && (
              <TodayView
                tasks={tasks}
                setTasks={setTasks}
                projects={projects}
                setProjects={setProjects}
                quote={quote}
                dateStr={dateStr}
                timeStr={timeStr}
                now={now}
                settings={settings}
                updateSetting={updateSetting}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
                addToast={addToast}
                staleReview={staleReview}
                showStaleReview={showStaleReview}
                setShowStaleReview={setShowStaleReview}
                restoreFromSomeday={restoreFromSomeday}
              />
            )}
            {view === 'projects' && (
              <ProjectsView
                projects={projects}
                tasks={tasks}
                addingProject={false}
                setAddingProject={() => {}}
                newProjectName=""
                setNewProjectName={() => {}}
                addProject={() => {}}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
                setProjects={setProjects}
                addToast={addToast}
              />
            )}
            {view === 'notes' && <NotesView notes={notes} setNotes={setNotes} addToast={addToast} />}
            {view === 'insights' && <InsightsView tasks={tasks} weekData={WEEK_DATA} now={now} settings={settings} />}
            {view === 'settings' && <SettingsView settings={settings} updateSetting={updateSetting} />}
          </div>
        </main>

        <ToastContainer toasts={toasts} dismiss={dismissToast} />

        {/* Recurring dialog */}
        {recurringDialog && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
            <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
                  {recurringDialog.recurring === 'daily' ? 'Daily' : 'Weekly'} recurring
                </span>
              </div>
              <p className="font-medium text-sm mt-3 mb-1" style={{ color: 'var(--foreground)' }}>{recurringDialog.text}</p>
              <p className="text-xs mb-5" style={{ color: 'var(--muted-foreground)' }}>This task repeats. How would you like to handle it?</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleRecurring(recurringDialog, 'done')} className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--primary)', color: '#fff' }}>Mark done</button>
                <button onClick={() => handleRecurring(recurringDialog, 'skip')} className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Skip once</button>
                <button onClick={() => handleRecurring(recurringDialog, 'snooze1d')} className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Snooze 1 day</button>
                <button onClick={() => handleRecurring(recurringDialog, 'snooze1w')} className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Snooze 1 week</button>
              </div>
              <button onClick={() => setRecurringDialog(null)} className="w-full mt-3 text-xs py-2" style={{ color: 'var(--muted-foreground)' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

function Sidebar({ view, setView, darkMode, setDarkMode }: {
  view: View; setView: (v: View) => void; darkMode: boolean; setDarkMode: (v: boolean) => void
}) {
  const items: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'today', label: 'Today', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    { id: 'projects', label: 'Projects', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 4a2 2 0 012-2h2l2 2h4a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: 'notes', label: 'Notes', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    { id: 'insights', label: 'Insights', icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 12l3.5-4 3 2.5 3.5-5L15 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  ]
  return (
    <aside className="flex flex-col h-full" style={{ background: 'var(--sidebar)', color: 'var(--sidebar-fg)' }}>
      {/* Logo */}
      <div className="px-5 pt-7 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M2 7h7M2 11h5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--sidebar-fg)' }}>daymark</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
              view === item.id ? 'bg-white/10 text-white' : 'hover:bg-white/5'
            }`}
            style={{ color: view === item.id ? '#fff' : 'var(--sidebar-muted)' }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-5 space-y-0.5">
        <div className="mx-2 mb-3 h-px" style={{ background: 'rgba(255,255,255,0.07)' }}/>
        {/* Settings */}
        <button
          onClick={() => setView('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${view === 'settings' ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}
          style={{ color: view === 'settings' ? '#fff' : 'var(--sidebar-muted)' }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M3.8 12.2l.7-.7M11.5 4.5l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          Settings
        </button>
        {/* Dark mode */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all hover:bg-white/5"
          style={{ color: 'var(--sidebar-muted)' }}
        >
          <div className="flex items-center gap-3">
            {darkMode
              ? <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.1 3.1l1.4 1.4M13.5 13.5l1.4 1.4M3.1 14.9l1.4-1.4M13.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              : <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="M15 9.5A6.5 6.5 0 018.5 3a6.5 6.5 0 100 13A6.5 6.5 0 0115 9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            }
            {darkMode ? 'Light mode' : 'Dark mode'}
          </div>
          <div className={`w-9 h-5 rounded-full relative transition-colors ${darkMode ? '' : ''}`} style={{ background: darkMode ? 'var(--primary)' : 'rgba(255,255,255,0.12)' }}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${darkMode ? 'left-4' : 'left-0.5'}`}/>
          </div>
        </button>
        {/* Profile anchor */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">A</div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate" style={{ color: 'var(--sidebar-fg)' }}>Alex</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--sidebar-muted)' }}>alex@work.co</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 9L7.5 6 4.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>
    </aside>
  )
}

// ── Today View ─────────────────────────────────────────────────────────────────

function TodayView({
  tasks, setTasks, projects, setProjects, quote, dateStr, timeStr, now, settings, updateSetting,
  toggleTask, deleteTask, addToast, staleReview, showStaleReview, setShowStaleReview, restoreFromSomeday,
}: {
  tasks: Task[]; setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  projects: Project[]; setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  quote: { text: string; author: string }; dateStr: string; timeStr: string; now: Date
  settings: AppSettings; updateSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  toggleTask: (id: string) => void; deleteTask: (id: string) => void
  addToast: (msg: string, type?: ToastType) => void
  staleReview: Task[]; showStaleReview: boolean; setShowStaleReview: (v: boolean) => void
  restoreFromSomeday: (id: string) => void
}) {
  const [quickAddText, setQuickAddText] = useState('')
  const [expandForm, setExpandForm]     = useState(false)
  const [newPriority, setNewPriority]   = useState<Priority>('medium')
  const [newProject, setNewProject]     = useState(projects[0]?.name ?? '')
  const [newDueDate, setNewDueDate]     = useState(todayStr())
  const [newDueTime, setNewDueTime]     = useState('')
  const [newAssignee, setNewAssignee]   = useState('')
  const [newDoD, setNewDoD]             = useState('')
  const [newRecurring, setNewRecurring] = useState<Task['recurring']>(null)
  const [showSomeday, setShowSomeday]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const todayTasks = tasks.filter(t => !t.someday)
  const pending    = rankTasks(todayTasks.filter(t => !t.done))
  const done       = todayTasks.filter(t => t.done)
  const someday    = tasks.filter(t => t.someday)
  const nextAction = pending[0] ?? null
  const restOfList = pending.slice(1)
  const completionPct = todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0

  const addTask = () => {
    if (!quickAddText.trim()) return
    const task: Task = {
      id: genId(), text: quickAddText.trim(), done: false,
      priority: newPriority, project: newProject,
      dueDate: newDueDate || todayStr(), dueTime: newDueTime || null,
      assignee: newAssignee || null, definitionOfDone: newDoD,
      subtaskCount: 0, commentCount: 0, recurring: newRecurring,
      someday: false, lastTouched: new Date().toISOString(),
      createdAt: new Date().toISOString(), nextStep: '',
    }
    setTasks(ts => [task, ...ts])
    setProjects(ps => ps.some(p => p.name === newProject) ? ps : [...ps, { id: genId(), name: newProject, color: PROJECT_COLORS[ps.length % PROJECT_COLORS.length] }])
    setQuickAddText(''); setExpandForm(false); setNewDueTime(''); setNewAssignee(''); setNewDoD('')
    addToast('Task added')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>
          {dateStr}
        </p>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
            {getGreeting(now.getHours())}, Alex
          </h1>
          <span className="text-sm tabular-nums flex-shrink-0 font-medium" style={{ color: 'var(--muted-foreground)' }}>{timeStr}</span>
        </div>
      </div>

      {/* Quote card — collapsible */}
      <div
        className="rounded-xl overflow-hidden cursor-pointer select-none"
        style={{ background: 'var(--sidebar)' }}
        onClick={() => updateSetting('quoteCollapsed', !settings.quoteCollapsed)}
      >
        {settings.quoteCollapsed ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <svg width="16" height="13" viewBox="0 0 16 13" fill="none" className="flex-shrink-0 opacity-40">
              <path d="M0 8C0 4.686 2.149 2.353 6.4 0l1.067 1.6C5.178 2.933 4 4.48 3.733 6.4v.533H7.2V13H0V8zM8.8 8C8.8 4.686 10.949 2.353 15.2 0l1.067 1.6C14.378 2.933 13.2 4.48 12.933 6.4v.533H16.4V13H8.8V8z" fill="white"/>
            </svg>
            <p className="text-[13px] italic truncate flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              "{quote.text.length > 70 ? quote.text.slice(0, 68) + '…' : quote.text}"
            </p>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 opacity-40">
              <path d="M3 4.5L6 7.5 9 4.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        ) : (
          <div className="px-5 py-5 relative">
            <div className="absolute top-4 right-4 opacity-10">
              <svg width="32" height="26" viewBox="0 0 40 32" fill="none"><path d="M0 20C0 12.268 5.373 5.88 16 0l2.667 4C12.444 7.333 9.333 11.2 9.333 16v1.333H18V32H0V20zM22 20C22 12.268 27.373 5.88 38 0l2.667 4C34.444 7.333 31.333 11.2 31.333 16v1.333H40V32H22V20z" fill="white"/></svg>
            </div>
            <p className="font-display text-base sm:text-lg italic font-light leading-relaxed pr-8" style={{ color: 'rgba(255,255,255,0.9)' }}>
              "{quote.text}"
            </p>
            <p className="text-[11px] mt-3 font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>— {quote.author}</p>
            <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 1.5L9 4.5 6 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Click to collapse
            </p>
          </div>
        )}
      </div>

      {/* Stale review banner */}
      {staleReview.length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 text-sm">
            <span style={{ fontSize: 16 }}>🗂</span>
            <span style={{ color: 'var(--foreground)' }}>
              <strong>{staleReview.length}</strong> task{staleReview.length > 1 ? 's' : ''} moved to <strong>Someday</strong> — untouched for {settings.staleThresholdDays}+ days
            </span>
          </div>
          <button
            onClick={() => setShowSomeday(true)}
            className="text-xs font-semibold whitespace-nowrap"
            style={{ color: 'var(--primary)' }}
          >
            Review →
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="rounded-xl px-4 py-3 flex items-center gap-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex-1">
          <div className="flex justify-between text-[11px] font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
            <span>Today's progress</span>
            <span style={{ color: 'var(--foreground)' }}>{done.length}/{todayTasks.length}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${completionPct}%`, background: 'var(--primary)' }}/>
          </div>
        </div>
        <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: completionPct === 100 ? '#10b981' : 'var(--primary)' }}>
          {completionPct}%
        </span>
      </div>

      {/* Quick add */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: `1px solid ${expandForm ? 'var(--primary)' : 'var(--border)'}`, boxShadow: expandForm ? '0 0 0 3px rgba(99,102,241,0.08)' : undefined }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-5 h-5 rounded-full flex-shrink-0 border-2" style={{ borderColor: 'var(--border)' }}/>
          <input
            id="quick-add-input"
            ref={inputRef}
            type="text"
            placeholder="Add a task… (press / to focus)"
            value={quickAddText}
            onChange={e => { setQuickAddText(e.target.value); if (!expandForm && e.target.value) setExpandForm(true) }}
            onFocus={() => { if (quickAddText) setExpandForm(true) }}
            onKeyDown={e => {
              if (e.key === 'Enter') addTask()
              if (e.key === 'Escape') { setExpandForm(false); setQuickAddText('') }
            }}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--foreground)' }}
          />
          <kbd className="hidden sm:block text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>/</kbd>
        </div>
        {/* Expanded form */}
        {expandForm && (
          <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap gap-2 pt-3">
              {/* Priority */}
              <div className="flex gap-1">
                {(['high','medium','low'] as Priority[]).map(p => (
                  <button key={p} onClick={() => setNewPriority(p)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${newPriority === p ? priorityConfig[p].badge : ''}`}
                    style={newPriority !== p ? { color: 'var(--muted-foreground)', background: 'var(--muted)' } : undefined}
                  >
                    {priorityConfig[p].label}
                  </button>
                ))}
              </div>
              {/* Project */}
              <select value={newProject} onChange={e => setNewProject(e.target.value)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none font-medium"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: 'none' }}
              >
                {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              {/* Due date */}
              <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: 'none' }}
              />
              {/* Due time */}
              <input type="time" value={newDueTime} onChange={e => setNewDueTime(e.target.value)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: 'none' }}
              />
              {/* Recurring */}
              <select value={newRecurring ?? ''} onChange={e => setNewRecurring((e.target.value as Task['recurring']) || null)}
                className="text-[11px] px-2.5 py-1 rounded-lg outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: 'none' }}
              >
                <option value="">No recurrence</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {/* Assignee row */}
            <div className="flex gap-2">
              <input type="text" placeholder="Assignee (optional)" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}
                className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: 'none' }}
              />
              {newAssignee && (
                <input type="text" placeholder="Definition of done…" value={newDoD} onChange={e => setNewDoD(e.target.value)}
                  className="flex-[2] text-[12px] px-3 py-1.5 rounded-lg outline-none"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: 'none' }}
                />
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setExpandForm(false); setQuickAddText('') }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}
              >Cancel</button>
              <button onClick={addTask}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold"
                style={{ background: 'var(--primary)', color: '#fff' }}
              >Add task</button>
            </div>
          </div>
        )}
      </div>

      {/* Next action */}
      {nextAction && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Next action</p>
          <div className="rounded-xl px-4 py-4 relative overflow-hidden" style={{ background: 'var(--sidebar)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #6366f1 0%, transparent 70%)' }}/>
            <div className="relative flex items-center gap-3">
              <button
                onClick={() => toggleTask(nextAction.id)}
                className="w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-all"
                style={{ borderColor: 'rgba(255,255,255,0.3)' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>{nextAction.text}</p>
                <div className="flex items-center gap-3 mt-1">
                  {nextAction.dueTime && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>at {nextAction.dueTime}</span>}
                  {nextAction.assignee && (
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-indigo-400 flex items-center justify-center text-[9px] font-bold text-white">{nextAction.assignee[0].toUpperCase()}</div>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{nextAction.assignee}</span>
                    </div>
                  )}
                  {isOverdue(nextAction.dueDate) && (
                    <span className="text-[11px] font-semibold" style={{ color: '#f87171' }}>Overdue</span>
                  )}
                </div>
              </div>
              <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${priorityConfig[nextAction.priority].badge}`}>
                {priorityConfig[nextAction.priority].label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rest of task list */}
      {restOfList.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Up next</p>
          <div className="space-y-1.5">
            {restOfList.map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}
          </div>
        </div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Completed ({done.length})</p>
          <div className="space-y-1.5">
            {done.map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {pending.length === 0 && done.length === 0 && !expandForm && (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          No tasks today — type above to add one
        </div>
      )}

      {/* Someday bucket */}
      {someday.length > 0 && (
        <div>
          <button
            onClick={() => setShowSomeday(s => !s)}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: showSomeday ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }}>
              <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Someday ({someday.length})
          </button>
          {showSomeday && (
            <div className="space-y-1.5">
              {someday.map(t => (
                <div key={t.id} className="group flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)', opacity: 0.7 }}>
                  <div className="w-5 h-5 rounded-full border-2 flex-shrink-0" style={{ borderStyle: 'dashed', borderColor: 'var(--border)' }}/>
                  <span className="flex-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{t.text}</span>
                  <button onClick={() => restoreFromSomeday(t.id)} className="text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--primary)' }}>
                    Restore
                  </button>
                  <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg" style={{ color: 'var(--muted-foreground)' }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L11 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Week mini */}
      <WeekMini now={now} completedToday={done.length} />
    </div>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────────

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: (id: string) => void; onDelete: (id: string) => void }) {
  const p = priorityConfig[task.priority]
  const overdue = isOverdue(task.dueDate)
  const dueToday = isDueToday(task.dueDate)

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:shadow-sm ${task.done ? 'opacity-50' : ''}`}
      style={{
        background: 'var(--card)',
        border: `1px solid ${overdue && !task.done ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
        borderLeft: overdue && !task.done ? '3px solid #ef4444' : dueToday && !task.done ? '3px solid var(--primary)' : '1px solid var(--border)',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-all`}
        style={{
          borderColor: task.done ? 'var(--primary)' : 'var(--muted-foreground)',
          background: task.done ? 'var(--primary)' : 'transparent',
        }}
      >
        {task.done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>

      {/* Text + meta */}
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] ${task.done ? 'line-through' : ''}`} style={{ color: task.done ? 'var(--muted-foreground)' : 'var(--foreground)' }}>
          {task.text}
        </span>
        <div className="flex items-center gap-2.5 mt-0.5">
          {/* Due time */}
          {task.dueTime && !task.done && (
            <span className="text-[11px] tabular-nums" style={{ color: overdue ? '#ef4444' : 'var(--muted-foreground)' }}>
              {task.dueTime}
            </span>
          )}
          {/* Due date label */}
          {task.dueDate && !task.done && (
            <span className="text-[11px] font-medium" style={{ color: overdue ? '#ef4444' : dueToday ? 'var(--primary)' : 'var(--muted-foreground)' }}>
              {formatDueDate(task.dueDate)}
            </span>
          )}
          {/* Recurring badge */}
          {task.recurring && (
            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>↻ {task.recurring}</span>
          )}
        </div>
      </div>

      {/* Right meta */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Subtask count */}
        {task.subtaskCount > 0 && (
          <span className="hidden sm:flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M2 6h5M2 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {task.subtaskCount}
          </span>
        )}
        {/* Comment count */}
        {task.commentCount > 0 && (
          <span className="hidden sm:flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2h8a1 1 0 011 1v5a1 1 0 01-1 1H4L2 11V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1"/></svg>
            {task.commentCount}
          </span>
        )}
        {/* Assignee */}
        {task.assignee && (
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
            {task.assignee[0].toUpperCase()}
          </div>
        )}
        {/* Priority badge */}
        <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`}/>
          {p.label}
        </span>
        {/* Delete */}
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all hover:bg-rose-50 dark:hover:bg-rose-950"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L11 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  )
}

// ── Week Mini ──────────────────────────────────────────────────────────────────

function WeekMini({ now, completedToday }: { now: Date; completedToday: number }) {
  const today = now.getDay()
  const data = [3, 5, 2, 7, 4, 6, completedToday]
  const max = Math.max(...data, 1)
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Weekly rhythm</h3>
        <span className="text-[11px] font-semibold" style={{ color: completedToday > 0 ? 'var(--primary)' : 'var(--muted-foreground)' }}>
          {completedToday > 0 ? 'On track' : 'Get started'}
        </span>
      </div>
      <div className="flex items-end gap-2 h-14">
        {WEEKDAYS.map((d, i) => {
          const h = (data[i] / max) * 100
          const isToday = i === today
          return (
            <div key={d} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full rounded-sm" style={{
                height: `${Math.max(h, 8)}%`,
                background: isToday ? 'var(--primary)' : 'var(--secondary)',
                opacity: i > today ? 0.3 : 1,
                minHeight: 4,
              }}/>
              <span className="text-[10px] font-medium" style={{ color: isToday ? 'var(--primary)' : 'var(--muted-foreground)' }}>{d}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Projects View ──────────────────────────────────────────────────────────────

function ProjectsView({ projects, tasks, setProjects, toggleTask, deleteTask, addToast, ..._ }: {
  projects: Project[]; tasks: Task[]; setProjects: React.Dispatch<React.SetStateAction<Project[]>>
  toggleTask: (id: string) => void; deleteTask: (id: string) => void; addToast: (m: string, t?: ToastType) => void
  addingProject: boolean; setAddingProject: (v: boolean) => void; newProjectName: string
  setNewProjectName: (v: string) => void; addProject: () => void
}) {
  const [active, setActive]         = useState(projects[0]?.name ?? '')
  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState('')

  const addProject = () => {
    if (!newName.trim()) return
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length]
    setProjects(ps => [...ps, { id: genId(), name: newName.trim(), color }])
    setActive(newName.trim())
    setNewName(''); setAdding(false)
    addToast('Project created')
  }

  const projectTasks = tasks.filter(t => t.project === active)
  const done = projectTasks.filter(t => t.done).length

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Projects</h1>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold hover:scale-105 transition-all" style={{ background: 'var(--primary)', color: '#fff' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          New
        </button>
      </div>
      {adding && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--primary)' }}>
          <input autoFocus type="text" placeholder="Project name" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addProject(); if (e.key === 'Escape') setAdding(false) }}
            className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}>Cancel</button>
            <button onClick={addProject} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--primary)', color: '#fff' }}>Create</button>
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {projects.map(p => (
          <button key={p.id} onClick={() => setActive(p.name)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
            style={active === p.name ? { background: p.color, color: '#fff' } : { background: 'var(--card)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: active === p.name ? 'rgba(255,255,255,0.6)' : p.color }}/>
            {p.name}
            <span className="text-[10px] opacity-70">{tasks.filter(t => t.project === p.name).length}</span>
          </button>
        ))}
      </div>
      {active && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total',     value: projectTasks.length },
              { label: 'Done',      value: done },
              { label: 'Remaining', value: projectTasks.length - done },
            ].map(k => (
              <div key={k.label} className="rounded-xl p-4 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>{k.value}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{k.label}</div>
              </div>
            ))}
          </div>
          {projectTasks.length === 0
            ? <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>No tasks in this project yet</div>
            : <div className="space-y-1.5">{rankTasks(projectTasks).map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}</div>
          }
        </>
      )}
    </div>
  )
}

// ── Notes View ─────────────────────────────────────────────────────────────────

function NotesView({ notes, setNotes, addToast }: { notes: Note[]; setNotes: React.Dispatch<React.SetStateAction<Note[]>>; addToast: (m: string, t?: ToastType) => void }) {
  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [title, setTitle]     = useState('')
  const [body, setBody]       = useState('')

  const save = () => {
    if (!title.trim()) return
    if (editId) {
      setNotes(ns => ns.map(n => n.id === editId ? { ...n, title, body } : n))
      addToast('Note updated')
    } else {
      setNotes(ns => [{ id: genId(), title: title.trim(), body: body.trim(), createdAt: new Date() }, ...ns])
      addToast('Note saved')
    }
    setTitle(''); setBody(''); setAdding(false); setEditId(null)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Notes</h1>
        <button onClick={() => { setAdding(true); setEditId(null); setTitle(''); setBody('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold hover:scale-105 transition-all"
          style={{ background: 'var(--primary)', color: '#fff' }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          New note
        </button>
      </div>
      {adding && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--primary)', boxShadow: '0 0 0 3px rgba(99,102,241,0.07)' }}>
          <input autoFocus type="text" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-transparent font-medium outline-none" style={{ color: 'var(--foreground)' }}
          />
          <textarea placeholder="Write your note…" value={body} onChange={e => setBody(e.target.value)}
            rows={4} className="w-full bg-transparent text-sm outline-none resize-none" style={{ color: 'var(--foreground)' }}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setEditId(null) }} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}>Cancel</button>
            <button onClick={save} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--primary)', color: '#fff' }}>
              {editId ? 'Save changes' : 'Save note'}
            </button>
          </div>
        </div>
      )}
      {notes.length === 0 && !adding && (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>No notes yet</div>
      )}
      <div className="space-y-3">
        {notes.map(n => (
          <div key={n.id} className="group rounded-xl p-4 transition-all hover:shadow-sm" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium text-[14px]" style={{ color: 'var(--foreground)' }}>{n.title}</h3>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => { setEditId(n.id); setTitle(n.title); setBody(n.body); setAdding(true) }}
                  className="p-1.5 rounded-lg hover:bg-[var(--muted)]" style={{ color: 'var(--muted-foreground)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </button>
                <button onClick={() => { setNotes(ns => ns.filter(x => x.id !== n.id)); addToast('Note deleted', 'warning') }}
                  className="p-1.5 rounded-lg hover:bg-rose-50" style={{ color: 'var(--muted-foreground)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L11 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
            {n.body && <p className="text-[13px] mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--muted-foreground)' }}>{n.body}</p>}
            <p className="text-[10px] mt-2.5" style={{ color: 'var(--muted-foreground)' }}>{n.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Insights View ──────────────────────────────────────────────────────────────

type Priority2 = Priority

function InsightsView({ tasks, weekData, now, settings }: { tasks: Task[]; weekData: number[]; now: Date; settings: AppSettings }) {
  const completed = tasks.filter(t => t.done).length
  const total = tasks.length
  const high = tasks.filter(t => t.priority === 'high' && !t.done).length
  const byPriority = { high: tasks.filter(t => t.priority === 'high').length, medium: tasks.filter(t => t.priority === 'medium').length, low: tasks.filter(t => t.priority === 'low').length }
  const maxPri = Math.max(...Object.values(byPriority), 1)
  const maxWeek = Math.max(...weekData, 1)
  const today = now.getDay()

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Insights</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total tasks',  value: total,     sub: 'all time' },
          { label: 'Completed',    value: completed, sub: `${total ? Math.round(completed/total*100) : 0}% rate` },
          { label: 'High priority', value: high,    sub: 'open items' },
          { label: 'Day streak',   value: 5,         sub: 'days in a row' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>{k.value}</div>
            <div className="text-[12px] font-medium mt-1" style={{ color: 'var(--foreground)' }}>{k.label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Weekly chart */}
      <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Tasks completed this week</h3>
          <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{weekData.reduce((a,b)=>a+b,0)} total</span>
        </div>
        <div className="flex items-end gap-3 h-24">
          {WEEKDAYS.map((d, i) => {
            const h = (weekData[i] / maxWeek) * 100
            const isToday = i === today
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{weekData[i]}</span>
                <div className="w-full rounded-sm" style={{ height: `${Math.max(h * 0.85, 6)}%`, background: isToday ? 'var(--primary)' : 'var(--secondary)', opacity: i > today ? 0.3 : 1, minHeight: 5 }}/>
                <span className="text-[10px] font-medium" style={{ color: isToday ? 'var(--primary)' : 'var(--muted-foreground)' }}>{d}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <h3 className="text-[13px] font-medium mb-4" style={{ color: 'var(--foreground)' }}>Priority breakdown</h3>
        <div className="space-y-3">
          {(['high','medium','low'] as Priority2[]).map(p => {
            const count = byPriority[p]
            const pct = (count / maxPri) * 100
            const cfg = priorityConfig[p]
            return (
              <div key={p} className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{cfg.label}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>{count} tasks</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
                  <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${pct}%`, transition: 'width 0.5s ease' }}/>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pro view: advanced reporting */}
      {settings.proView && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Dependencies & Automations</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>Pro</span>
          </div>
          {[
            { label: 'Blocked tasks', value: 2,  note: '2 tasks waiting on dependencies' },
            { label: 'Automations',   value: 1,  note: '1 rule active: auto-assign Work tasks to Alex' },
            { label: 'Integrations',  value: 0,  note: 'Connect Slack, Calendar, GitHub' },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>{r.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{r.note}</div>
              </div>
              <span className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings View ──────────────────────────────────────────────────────────────

function SettingsView({ settings, updateSetting }: { settings: AppSettings; updateSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Settings</h1>

      <Section title="Notifications">
        <p className="text-[13px] mb-3" style={{ color: 'var(--muted-foreground)' }}>How you receive task reminders and alerts.</p>
        <div className="space-y-2">
          {([
            { value: 'all',    label: 'All notifications', desc: 'Get notified for every task update' },
            { value: 'digest', label: 'Daily digest',      desc: 'One summary at 9am each morning' },
            { value: 'urgent', label: 'Urgent only',       desc: 'Only high-priority or overdue tasks' },
          ] as { value: AppSettings['notificationMode']; label: string; desc: string }[]).map(opt => (
            <label key={opt.value} className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all" style={{ background: settings.notificationMode === opt.value ? 'var(--secondary)' : 'var(--card)', border: `1px solid ${settings.notificationMode === opt.value ? 'var(--primary)' : 'var(--border)'}` }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>{opt.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{opt.desc}</div>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3`}
                style={{ borderColor: settings.notificationMode === opt.value ? 'var(--primary)' : 'var(--border)' }}
              >
                {settings.notificationMode === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }}/>}
              </div>
              <input type="radio" className="sr-only" checked={settings.notificationMode === opt.value} onChange={() => updateSetting('notificationMode', opt.value)}/>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Someday bucket">
        <p className="text-[13px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Tasks untouched for this many days move to <strong>Someday</strong> automatically.
        </p>
        <div className="flex items-center gap-4">
          {[1, 3, 7, 14].map(n => (
            <button key={n} onClick={() => updateSetting('staleThresholdDays', n)}
              className="px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all"
              style={settings.staleThresholdDays === n ? { background: 'var(--primary)', color: '#fff' } : { background: 'var(--muted)', color: 'var(--foreground)' }}
            >
              {n}d
            </button>
          ))}
        </div>
      </Section>

      <Section title="Pro view">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Show advanced features</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Dependencies, automations, and detailed reporting in Insights</p>
          </div>
          <button
            onClick={() => updateSetting('proView', !settings.proView)}
            className={`w-11 h-6 rounded-full relative flex-shrink-0 transition-colors ml-4`}
            style={{ background: settings.proView ? 'var(--primary)' : 'var(--muted)' }}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${settings.proView ? 'left-6' : 'left-1'}`}/>
          </button>
        </div>
      </Section>

      <Section title="Plan">
        <div className="space-y-2 text-[13px]">
          {[
            { label: 'Task management',   free: true },
            { label: 'Notes',             free: true },
            { label: 'Daily quotes',      free: true },
            { label: 'Basic reporting',   free: true },
            { label: 'Reminders',         free: true },
            { label: 'Task history',      free: true },
            { label: 'Team collaboration', free: false },
            { label: 'Integrations',      free: false },
            { label: 'Automations',       free: false },
          ].map(f => (
            <div key={f.label} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--foreground)' }}>{f.label}</span>
              {f.free
                ? <span className="text-[11px] font-semibold" style={{ color: '#10b981' }}>Free</span>
                : <span className="text-[11px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>Scale plan</span>
              }
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <h2 className="text-[12px] font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--muted-foreground)' }}>{title}</h2>
      {children}
    </div>
  )
}
