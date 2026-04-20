import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getPopulationCohorts } from '../services/api'

interface Cohort {
  label: string
  keywords: string[]
  active_patients: number
}

interface Data {
  cohorts: Cohort[]
  vital_flags: {
    systolic_bp_ge_140: number
    heart_rate_ge_100: number
    spo2_lt_92: number
  }
}

export default function PopulationHealth() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getPopulationCohorts()
      setData(res.data as Data)
    } catch (e: any) {
      setError(e.response?.data || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const maxCohort = Math.max(1, ...(data?.cohorts.map((c) => c.active_patients) || [0]))

  return (
    <Layout>
      <PageHeader
        section="Analytics"
        title="Population Health"
        subtitle="Chronic condition cohorts and vital-based risk flags"
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
          {typeof error === 'string' ? error : 'Failed'}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="glass-card p-5 bg-gradient-to-br from-amber-500/10 to-amber-500/0 border border-amber-500/20">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">
                Systolic BP ≥ 140
              </p>
              <p className="text-3xl font-semibold text-white mt-1 tabular-nums">
                {data.vital_flags.systolic_bp_ge_140.toLocaleString()}
              </p>
              <p className="text-medical-500 text-xs mt-1">patients at risk</p>
            </div>
            <div className="glass-card p-5 bg-gradient-to-br from-amber-500/10 to-amber-500/0 border border-amber-500/20">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">
                Heart rate ≥ 100
              </p>
              <p className="text-3xl font-semibold text-white mt-1 tabular-nums">
                {data.vital_flags.heart_rate_ge_100.toLocaleString()}
              </p>
              <p className="text-medical-500 text-xs mt-1">patients tachycardic</p>
            </div>
            <div className="glass-card p-5 bg-gradient-to-br from-red-500/10 to-red-500/0 border border-red-500/20">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">SpO₂ &lt; 92</p>
              <p className="text-3xl font-semibold text-white mt-1 tabular-nums">
                {data.vital_flags.spo2_lt_92.toLocaleString()}
              </p>
              <p className="text-medical-500 text-xs mt-1">patients hypoxemic</p>
            </div>
          </div>

          <section className="glass-card p-5 fade-up">
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Chronic disease cohorts (active problems)
            </p>
            <div className="space-y-3">
              {data.cohorts.map((c) => {
                const pct = Math.max(3, (c.active_patients / maxCohort) * 100)
                return (
                  <div key={c.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm">{c.label}</span>
                      <span className="text-medical-400 text-xs font-mono">
                        {c.active_patients} pts
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-mint-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-medical-600 text-[10px] mt-1">
                      matched by: {c.keywords.join(', ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      ) : null}
    </Layout>
  )
}
