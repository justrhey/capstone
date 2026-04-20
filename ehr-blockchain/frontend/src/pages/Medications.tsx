import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { getMyPatient, getPatients, listPatientMedications } from '../services/api'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
  user_id: string | null
}

interface MedicationRow {
  id: string
  record_id: string
  name: string
  dosage: string
  frequency: string
  created_at: string
}

export default function Medications() {
  const { user } = useAuth()
  const isPatient = user?.role === 'patient'

  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<string>('')
  const [rows, setRows] = useState<MedicationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const bootstrap = async () => {
      if (isPatient) {
        try {
          const me = await getMyPatient()
          const arr = Array.isArray(me.data) ? me.data : [me.data]
          if (arr[0]) {
            setPatients([arr[0]])
            setSelectedPatient(arr[0].id)
          }
        } catch {
          setError('Could not load your patient record')
        }
      } else {
        try {
          const res = await getPatients()
          setPatients(res.data || [])
          if ((res.data || []).length > 0) setSelectedPatient(res.data[0].id)
        } catch (e: any) {
          setError(e.response?.data || 'Failed to load patients')
        }
      }
    }
    void bootstrap()
  }, [isPatient])

  useEffect(() => {
    if (selectedPatient) void loadList(selectedPatient)
  }, [selectedPatient])

  const loadList = async (patientId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await listPatientMedications(patientId)
      setRows(res.data || [])
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load medications')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.dosage.toLowerCase().includes(q) ||
        r.frequency.toLowerCase().includes(q),
    )
  }, [rows, filter])

  return (
    <Layout>
      <PageHeader
        section="Clinical"
        title="Medications"
        subtitle="Every prescription across the patient's encounter history"
      />

      {!isPatient && (
        <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">Patient</p>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
          >
            <option value="">— select —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '120ms' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, dosage, or frequency…"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <section className="glass-card p-5 fade-up" style={{ animationDelay: '180ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
            Medications ({filtered.length}{filter && ` / ${rows.length}`})
          </p>
          {filtered.length === 0 ? (
            <p className="text-medical-500 text-sm">
              {rows.length === 0
                ? 'No medications recorded on any encounter yet.'
                : 'No medications match that filter.'}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {filtered.map((m) => (
                <li key={m.id} className="py-3 flex items-start gap-4">
                  <div className="shrink-0 text-right w-28">
                    <p className="text-medical-400 text-xs font-mono">
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{m.name}</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="text-cyan-300 text-xs">{m.dosage}</span>
                      <span className="text-medical-400 text-xs">{m.frequency}</span>
                    </div>
                  </div>
                  <a
                    href={`/records`}
                    className="shrink-0 text-medical-500 hover:text-cyan-300 text-[10px] font-mono"
                    title={`From record ${m.record_id}`}
                  >
                    {m.record_id.slice(0, 8)}…
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Layout>
  )
}
