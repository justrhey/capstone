import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getMyAuditHistory } from '../services/api'

interface HistoryRow {
  id: string
  action: string
  resource_type: string | null
  resource_id: string | null
  created_at: string
  blockchain_timestamp: number | null
  actor_id: string
  actor_first_name: string | null
  actor_last_name: string | null
  actor_role: string | null
}

type Category = 'create' | 'read' | 'update' | 'delete' | 'grant' | 'access-decision' | 'other'

function categorize(action: string): Category {
  if (action.includes('created')) return 'create'
  if (action.includes('updated')) return 'update'
  if (action.includes('deleted') || action.includes('revoked')) return 'delete'
  if (action.includes('granted')) return 'grant'
  if (action.startsWith('access_decision')) return 'access-decision'
  if (action.includes('viewed') || action.includes('accessed') || action.includes('read')) return 'read'
  return 'other'
}

function humanAction(action: string): string {
  // Turn machine action strings into readable English.
  return action
    .replace(/_/g, ' ')
    .replace(/^access decision /, 'access decision: ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function categoryColor(cat: Category): string {
  switch (cat) {
    case 'create': return 'bg-mint-500/10 text-mint-300 border-mint-500/20'
    case 'read': return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
    case 'update': return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
    case 'delete': return 'bg-red-500/10 text-red-300 border-red-500/20'
    case 'grant': return 'bg-violet-500/10 text-violet-300 border-violet-500/20'
    case 'access-decision': return 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    default: return 'bg-medical-500/10 text-medical-300 border-medical-500/20'
  }
}

function actorLabel(r: HistoryRow): string {
  const name = [r.actor_first_name, r.actor_last_name].filter(Boolean).join(' ').trim()
  if (name) return r.actor_role ? `${name} (${r.actor_role})` : name
  return r.actor_id.slice(0, 8) + '…'
}

function authoritativeTime(r: HistoryRow): Date {
  // BI-7: when an on-chain ledger timestamp was captured, it's authoritative.
  if (r.blockchain_timestamp && r.blockchain_timestamp > 0) {
    return new Date(r.blockchain_timestamp * 1000)
  }
  return new Date(r.created_at)
}

export default function AccessHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Category | 'all'>('all')

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getMyAuditHistory()
      setRows(res.data || [])
    } catch (err: any) {
      const body = err.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to load access history')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => categorize(r.action) === filter)
  }, [rows, filter])

  return (
    <Layout>
      <PageHeader
        section="Your Data"
        title="Access History"
        subtitle="Who has read, written, or been granted access to your records"
        actions={
          <>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Category | 'all')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
            >
              <option value="all">All</option>
              <option value="create">Created</option>
              <option value="read">Read</option>
              <option value="update">Updated</option>
              <option value="delete">Deleted / Revoked</option>
              <option value="grant">Granted</option>
              <option value="access-decision">Access decision</option>
              <option value="other">Other</option>
            </select>
            <button
              onClick={load}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-sm hover:bg-white/10"
            >
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="fade-up glass-card p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-medical-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <p className="text-medical-300">No access events yet.</p>
          <p className="text-medical-500 text-sm mt-1">
            Any time a clinician reads or edits your record, you'll see it here.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden fade-up" style={{ animationDelay: '80ms' }}>
          <ul className="divide-y divide-white/5">
            {filtered.map((r) => {
              const cat = categorize(r.action)
              const when = authoritativeTime(r)
              return (
                <li key={r.id} className="px-5 py-4 hover:bg-white/5 transition-colors flex items-start gap-4">
                  <div className="shrink-0 mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${categoryColor(cat)}`}>
                      {cat === 'access-decision' ? 'decision' : cat}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-medical-100 text-sm">
                      <span className="text-white font-medium">{actorLabel(r)}</span>
                      <span className="text-medical-400"> {humanAction(r.action).toLowerCase()}</span>
                      {r.resource_type && (
                        <span className="text-medical-500 text-xs ml-2">
                          · {r.resource_type}
                          {r.resource_id && (
                            <span className="font-mono ml-1">{r.resource_id.slice(0, 8)}…</span>
                          )}
                        </span>
                      )}
                    </p>
                    {r.blockchain_timestamp && r.blockchain_timestamp > 0 && (
                      <p className="text-mint-400/70 text-[10px] mt-0.5">
                        ⛓ ledger-attested timestamp
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-medical-300 text-xs font-mono">{when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-medical-500 text-[10px] mt-0.5">{when.toLocaleDateString()}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-medical-500 text-xs mt-4 fade-up" style={{ animationDelay: '160ms' }}>
        This view only shows events tied to <em>your</em> data. System-wide audit (available to admins and auditors)
        lives on the Audit Logs tab. IP addresses are not shown here.
      </p>
    </Layout>
  )
}
