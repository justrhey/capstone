import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { listErasureRequests, resolveErasureRequest } from '../services/api'

interface Row {
  id: string
  user_id: string
  reason: string | null
  status: 'pending' | 'approved' | 'declined'
  requested_at: string
  resolved_at: string | null
  resolved_by: string | null
  admin_note: string | null
  requester_email: string | null
  requester_first_name: string | null
  requester_last_name: string | null
}

export default function ErasureQueue() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listErasureRequests()
      setRows(res.data || [])
    } catch (e: any) {
      const body = e.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (id: string, action: 'approve' | 'decline') => {
    const note = prompt(`${action === 'approve' ? 'Approve' : 'Decline'} note (optional)`) ?? undefined
    if (action === 'approve' && !confirm('Approving soft-deletes the user + their patient profile. Proceed?')) return
    try {
      await resolveErasureRequest(id, action, note || undefined)
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed to resolve')
    }
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const resolved = rows.filter((r) => r.status !== 'pending')

  return (
    <Layout>
      <PageHeader
        section="Compliance"
        title="Erasure Queue"
        subtitle="Patient-initiated right-to-erasure requests awaiting review"
        actions={
          <button
            onClick={load}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-sm hover:bg-white/10"
          >
            Refresh
          </button>
        }
      />

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '80ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Pending ({pending.length})
            </p>
            {pending.length === 0 ? (
              <p className="text-medical-500 text-sm">No pending requests.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {pending.map((r) => (
                  <li key={r.id} className="py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm">
                        {r.requester_first_name} {r.requester_last_name}
                        {r.requester_email && (
                          <span className="text-medical-400 ml-2 text-xs">{r.requester_email}</span>
                        )}
                      </p>
                      {r.reason && (
                        <p className="text-medical-300 text-sm mt-1">Reason: {r.reason}</p>
                      )}
                      <p className="text-medical-600 text-[10px] mt-1">
                        Requested {new Date(r.requested_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleResolve(r.id, 'approve')}
                        className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-xs hover:bg-red-500/20"
                      >
                        Approve (delete)
                      </button>
                      <button
                        onClick={() => handleResolve(r.id, 'decline')}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 text-medical-200 rounded-lg text-xs hover:bg-white/10"
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-card p-5 fade-up" style={{ animationDelay: '140ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Recently resolved
            </p>
            {resolved.length === 0 ? (
              <p className="text-medical-500 text-sm">No history yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {resolved.slice(0, 10).map((r) => (
                  <li key={r.id} className="py-3 flex items-start gap-4">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border shrink-0 ${
                        r.status === 'approved'
                          ? 'bg-red-500/10 text-red-300 border-red-500/30'
                          : 'bg-medical-500/10 text-medical-300 border-white/10'
                      }`}
                    >
                      {r.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm">
                        {r.requester_first_name} {r.requester_last_name}
                      </p>
                      {r.admin_note && (
                        <p className="text-medical-400 text-xs mt-1">{r.admin_note}</p>
                      )}
                      <p className="text-medical-600 text-[10px] mt-1">
                        Resolved {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  )
}
