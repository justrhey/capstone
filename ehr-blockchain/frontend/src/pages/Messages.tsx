import { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  getMessageThread,
  getStaff,
  listMessageThreads,
  sendMessage,
} from '../services/api'

interface ThreadSummary {
  counterparty_id: string
  counterparty_first_name: string | null
  counterparty_last_name: string | null
  counterparty_role: string | null
  last_message_at: string
  last_body: string
  unread_count: number
}

interface Message {
  id: string
  sender_id: string
  recipient_id: string
  patient_id: string | null
  body: string
  read_at: string | null
  created_at: string
}

interface Staff {
  id: string
  first_name: string
  last_name: string
  role: string
}

export default function Messages() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [active, setActive] = useState<ThreadSummary | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [staff, setStaff] = useState<Staff[]>([])
  const [newRecipient, setNewRecipient] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const loadThreads = async () => {
    try {
      const res = await listMessageThreads()
      const list = (res.data || []) as ThreadSummary[]
      setThreads(list)
      if (!active && list.length > 0) setActive(list[0])
    } catch (e: any) {
      setError(e.response?.data || 'Failed to load threads')
    }
  }

  const loadThread = async (cp: string) => {
    try {
      const res = await getMessageThread(cp)
      setMessages(res.data || [])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e: any) {
      setError(e.response?.data || 'Failed to load thread')
    }
  }

  useEffect(() => {
    void loadThreads()
    getStaff()
      .then((r) => setStaff(r.data || []))
      .catch(() => setStaff([]))
  }, [])

  useEffect(() => {
    if (active) void loadThread(active.counterparty_id)
  }, [active])

  const handleSend = async () => {
    const body = draft.trim()
    const to = active?.counterparty_id || newRecipient
    if (!body || !to) return
    setSending(true)
    try {
      await sendMessage({ to_user_id: to, body })
      setDraft('')
      await loadThreads()
      if (!active && newRecipient) {
        const found = threads.find((t) => t.counterparty_id === newRecipient)
        if (found) setActive(found)
      }
      if (active) await loadThread(active.counterparty_id)
    } catch (e: any) {
      alert(e.response?.data || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const startNewThread = (staffId: string) => {
    setNewRecipient(staffId)
    const existing = threads.find((t) => t.counterparty_id === staffId)
    if (existing) setActive(existing)
    else {
      const s = staff.find((x) => x.id === staffId)
      if (s) {
        setActive({
          counterparty_id: staffId,
          counterparty_first_name: s.first_name,
          counterparty_last_name: s.last_name,
          counterparty_role: s.role,
          last_message_at: new Date().toISOString(),
          last_body: '',
          unread_count: 0,
        })
        setMessages([])
      }
    }
  }

  const threadList = useMemo(
    () =>
      [...threads].sort(
        (a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at),
      ),
    [threads],
  )

  return (
    <Layout>
      <PageHeader
        section="Communication"
        title="Messages"
        subtitle="Secure, encrypted patient-provider messages"
      />

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {typeof error === 'string' ? error : 'Failed'}
        </div>
      )}

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Start a conversation</p>
        <select
          value={newRecipient}
          onChange={(e) => e.target.value && startNewThread(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
        >
          <option value="">— select recipient —</option>
          {staff
            .filter((s) => s.id !== user?.id)
            .filter((s) =>
              user?.role === 'patient'
                ? s.role === 'doctor' || s.role === 'nurse' || s.role === 'admin'
                : true,
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name} ({s.role})
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
        <aside className="glass-card p-3 max-h-[60vh] overflow-y-auto fade-up" style={{ animationDelay: '120ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-400 font-semibold px-2 pt-2 pb-3">
            Conversations ({threadList.length})
          </p>
          {threadList.length === 0 ? (
            <p className="text-slate-400 text-sm px-2">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {threadList.map((t) => (
                <li key={t.counterparty_id}>
                  <button
                    onClick={() => setActive(t)}
                    className={`w-full text-left px-3 py-3 rounded-xl text-sm transition-all ${
                      active?.counterparty_id === t.counterparty_id
                        ? 'bg-cyan-600/20 text-white border border-cyan-500/50'
                        : 'text-slate-200 hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-white">
                        {t.counterparty_first_name} {t.counterparty_last_name}
                      </span>
                      {t.unread_count > 0 && (
                        <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                          {t.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs truncate mt-1">{t.last_body}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="glass-card p-5 flex flex-col min-h-[60vh] fade-up" style={{ animationDelay: '180ms' }}>
          {active ? (
            <>
              <div className="border-b border-slate-600 pb-4 mb-4 bg-slate-800/50 px-4 py-3 -mx-5 mt-[-20px] pt-5">
                <p className="text-white font-bold text-lg">
                  {active.counterparty_first_name} {active.counterparty_last_name}
                </p>
                <p className="text-cyan-400 text-xs font-medium uppercase tracking-wide mt-1">
                  {active.counterparty_role}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {messages.length === 0 ? (
                  <p className="text-slate-400 text-base text-center py-10">No messages yet. Say hello!</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user?.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                            mine
                              ? 'bg-white text-slate-900 rounded-br-md'
                              : 'bg-white text-slate-900 rounded-bl-md'
                          }`}
                          style={{
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          }}
                        >
                          <p className="whitespace-pre-wrap break-words font-medium leading-relaxed text-slate-800">{m.body}</p>
                          <p className={`text-[10px] mt-2 ${mine ? 'text-slate-500' : 'text-slate-500'}`}>
                            {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={bottomRef} />
              </div>
              <div className="mt-4 flex gap-3 border-t border-slate-600 pt-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  rows={2}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white text-base focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 resize-none placeholder-slate-400"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white rounded-xl font-semibold disabled:opacity-50 hover:from-cyan-500 hover:to-cyan-600 transition-all shadow-lg"
                >
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-400 text-base">Select a conversation or start a new one.</p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}
