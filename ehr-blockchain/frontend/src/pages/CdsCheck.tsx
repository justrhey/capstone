import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { cdsCheck, getPatients } from '../services/api'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
}

interface Alert {
  severity: 'info' | 'warning' | 'critical'
  kind: string
  message: string
  involves: string[]
}

function severityTone(s: string) {
  switch (s) {
    case 'critical':
      return 'bg-red-500/10 text-red-300 border-red-500/40'
    case 'warning':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    default:
      return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
  }
}

export default function CdsCheck() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState('')
  const [medsText, setMedsText] = useState('')
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [meta, setMeta] = useState<{ existing_meds: number; allergies: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getPatients()
      .then((r) => setPatients(r.data || []))
      .catch(() => setPatients([]))
  }, [])

  const handleCheck = async () => {
    const meds = medsText
      .split('\n')
      .map((m) => m.trim())
      .filter(Boolean)
    if (!patientId || meds.length === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await cdsCheck({ patient_id: patientId, new_meds: meds })
      setAlerts(res.data?.alerts || [])
      setMeta(res.data?.checked_against || null)
    } catch (e: any) {
      setError(e.response?.data || 'CDS check failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Clinical"
        title="Decision Support"
        subtitle="Drug-allergy and drug-drug interaction screening before prescribing"
      />

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Check interactions</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3">
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
          >
            <option value="">— select patient —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCheck}
            disabled={loading || !patientId || medsText.trim().length === 0}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Run check'}
          </button>
        </div>
        <textarea
          value={medsText}
          onChange={(e) => setMedsText(e.target.value)}
          placeholder={'Proposed medications, one per line\ne.g.\nAmoxicillin 500mg\nAspirin 81mg'}
          rows={5}
          className="mt-3 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50 font-mono"
        />
      </div>

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {typeof error === 'string' ? error : 'Check failed'}
        </div>
      )}

      {alerts !== null && (
        <section className="glass-card p-5 fade-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">
              Alerts ({alerts.length})
            </p>
            {meta && (
              <p className="text-medical-500 text-[10px]">
                Checked against {meta.existing_meds} existing med(s), {meta.allergies} allergy record(s)
              </p>
            )}
          </div>
          {alerts.length === 0 ? (
            <div className="p-4 bg-mint-500/5 border border-mint-500/20 rounded-xl">
              <p className="text-mint-300 text-sm">No interactions flagged.</p>
              <p className="text-medical-500 text-xs mt-1">
                This rule set is small and demonstrative — always use clinical judgement.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a, i) => (
                <li key={i} className={`p-4 rounded-xl border ${severityTone(a.severity)}`}>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border border-current">
                      {a.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{a.message}</p>
                      <p className="text-[10px] mt-1 opacity-70 font-mono">
                        {a.kind} · involves: {a.involves.join(' + ')}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Layout>
  )
}
