import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getReportsSummary } from '../services/api'

interface Summary {
  totals: {
    patients: number
    records: number
    users: number
    open_orders: number
    appointments_upcoming: number
    active_problems: number
  }
  by_sex: Array<{ sex: string | null; count: number }>
  by_age: Array<{ bucket: string; count: number }>
  records_by_month: Array<{ month: string; count: number }>
  users_by_role: Array<{ role: string; count: number }>
  top_problems: Array<{ description: string; count: number }>
}

function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-medical-400 text-xs font-mono truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-mint-500 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-white text-xs font-mono w-12 text-right">{value}</span>
      {hint && <span className="text-medical-600 text-[10px]">{hint}</span>}
    </div>
  )
}

function StatCard({ label, value, tone = 'cyan' }: { label: string; value: number; tone?: 'cyan' | 'mint' | 'amber' }) {
  const toneClass =
    tone === 'mint'
      ? 'from-mint-500/10 to-mint-500/0 border-mint-500/20'
      : tone === 'amber'
        ? 'from-amber-500/10 to-amber-500/0 border-amber-500/20'
        : 'from-cyan-500/10 to-cyan-500/0 border-cyan-500/20'
  return (
    <div className={`glass-card p-4 bg-gradient-to-br ${toneClass} border`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">{label}</p>
      <p className="text-3xl font-semibold text-white mt-1 tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}

export default function Reports() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getReportsSummary()
      setData(res.data as Summary)
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const maxSex = Math.max(1, ...(data?.by_sex.map((s) => s.count) || [0]))
  const maxAge = Math.max(1, ...(data?.by_age.map((a) => a.count) || [0]))
  const maxMonth = Math.max(1, ...(data?.records_by_month.map((m) => m.count) || [0]))
  const maxRole = Math.max(1, ...(data?.users_by_role.map((r) => r.count) || [0]))
  const maxProblem = Math.max(1, ...(data?.top_problems.map((p) => p.count) || [0]))

  return (
    <Layout>
      <PageHeader
        section="Analytics"
        title="Reports"
        subtitle="Aggregate view of the practice — counts only, no PHI"
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

      {loading && !data ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 fade-up">
            <StatCard label="Patients" value={data.totals.patients} />
            <StatCard label="Records" value={data.totals.records} />
            <StatCard label="Users" value={data.totals.users} />
            <StatCard label="Open orders" value={data.totals.open_orders} tone="amber" />
            <StatCard label="Upcoming appts" value={data.totals.appointments_upcoming} tone="mint" />
            <StatCard label="Active problems" value={data.totals.active_problems} tone="amber" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <section className="glass-card p-5 fade-up" style={{ animationDelay: '60ms' }}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
                Patients by sex
              </p>
              {data.by_sex.length === 0 ? (
                <p className="text-medical-500 text-sm">No data.</p>
              ) : (
                <div className="space-y-3">
                  {data.by_sex.map((s, i) => (
                    <Bar key={i} label={s.sex || '—'} value={s.count} max={maxSex} />
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card p-5 fade-up" style={{ animationDelay: '120ms' }}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
                Patients by age
              </p>
              {data.by_age.length === 0 ? (
                <p className="text-medical-500 text-sm">No data.</p>
              ) : (
                <div className="space-y-3">
                  {data.by_age.map((a) => (
                    <Bar key={a.bucket} label={a.bucket} value={a.count} max={maxAge} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <section className="glass-card p-5 fade-up" style={{ animationDelay: '180ms' }}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
                Records — last 6 months
              </p>
              {data.records_by_month.length === 0 ? (
                <p className="text-medical-500 text-sm">No records in window.</p>
              ) : (
                <div className="space-y-3">
                  {data.records_by_month.map((m) => (
                    <Bar key={m.month} label={m.month} value={m.count} max={maxMonth} />
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card p-5 fade-up" style={{ animationDelay: '240ms' }}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
                Users by role
              </p>
              {data.users_by_role.length === 0 ? (
                <p className="text-medical-500 text-sm">No data.</p>
              ) : (
                <div className="space-y-3">
                  {data.users_by_role.map((r) => (
                    <Bar key={r.role} label={r.role} value={r.count} max={maxRole} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="glass-card p-5 fade-up" style={{ animationDelay: '300ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Top active problems
            </p>
            {data.top_problems.length === 0 ? (
              <p className="text-medical-500 text-sm">No active problems tracked.</p>
            ) : (
              <div className="space-y-3">
                {data.top_problems.map((p, i) => (
                  <Bar key={i} label={p.description.slice(0, 32)} value={p.count} max={maxProblem} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </Layout>
  )
}
