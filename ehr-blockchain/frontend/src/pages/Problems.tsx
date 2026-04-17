import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  createProblem,
  getPatients,
  listPatientProblems,
  updateProblem,
} from '../services/api'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
  user_id: string | null
}

interface Problem {
  id: string
  patient_id: string
  code: string | null
  description: string
  status: 'active' | 'resolved' | 'inactive'
  onset_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export default function Problems() {
  const { user } = useAuth()
  const isStaff = user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'admin'

  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<string>('')
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New-problem form
  const [desc, setDesc] = useState('')
  const [code, setCode] = useState('')
  const [onset, setOnset] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Load patients list (for staff) or auto-pick own patient row.
    const bootstrap = async () => {
      try {
        const res = await getPatients()
        setPatients(res.data || [])
        if ((res.data || []).length > 0 && !selectedPatient) {
          setSelectedPatient(res.data[0].id)
        }
      } catch {
        // Patients may reject for patient role — in that case, load /api/patients/me
        try {
          const { getMyPatient } = await import('../services/api')
          const me = await getMyPatient()
          if (me.data && me.data[0]) {
            setPatients([me.data[0]])
            setSelectedPatient(me.data[0].id)
          }
        } catch {}
      }
    }
    void bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedPatient) return
    void loadProblems(selectedPatient)
  }, [selectedPatient])

  const loadProblems = async (patientId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await listPatientProblems(patientId)
      setProblems(res.data || [])
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load problems')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!selectedPatient || !desc.trim()) return
    setSubmitting(true)
    try {
      await createProblem({
        patient_id: selectedPatient,
        description: desc.trim(),
        code: code.trim() || undefined,
        onset_at: onset || undefined,
      })
      setDesc('')
      setCode('')
      setOnset('')
      void loadProblems(selectedPatient)
    } catch (e: any) {
      alert(e.response?.data || 'Failed to add')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResolve = async (id: string) => {
    if (!confirm('Mark this problem as resolved?')) return
    try {
      await updateProblem(id, { status: 'resolved' })
      if (selectedPatient) void loadProblems(selectedPatient)
    } catch (e: any) {
      alert(e.response?.data || 'Failed to resolve')
    }
  }

  const active = useMemo(() => problems.filter((p) => p.status === 'active'), [problems])
  const history = useMemo(() => problems.filter((p) => p.status !== 'active'), [problems])

  return (
    <Layout>
      <PageHeader
        section="Clinical"
        title="Problem List"
        subtitle="Ongoing diagnoses and conditions tracked across encounters"
      />

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

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {isStaff && selectedPatient && (
        <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '120ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Add problem</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_140px_auto] gap-3">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (e.g. Type 2 diabetes)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ICD-10 (E11.9)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm font-mono focus:outline-none focus:border-cyan-400/50"
            />
            <input
              type="date"
              value={onset}
              onChange={(e) => setOnset(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <button
              onClick={handleAdd}
              disabled={submitting || !desc.trim()}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '180ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Active ({active.length})
            </p>
            {active.length === 0 ? (
              <p className="text-medical-500 text-sm">No active problems.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {active.map((p) => (
                  <li key={p.id} className="py-3 flex items-start gap-4">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border shrink-0 bg-mint-500/10 text-mint-300 border-mint-500/30">
                      active
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm">
                        {p.code && <span className="font-mono text-cyan-300 mr-2">{p.code}</span>}
                        {p.description}
                      </p>
                      <p className="text-medical-500 text-[10px] mt-1">
                        {p.onset_at ? `Onset ${p.onset_at}` : `Added ${new Date(p.created_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    {isStaff && (
                      <button
                        onClick={() => handleResolve(p.id)}
                        className="shrink-0 text-cyan-400 hover:text-cyan-300 text-xs"
                      >
                        Resolve
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-card p-5 fade-up" style={{ animationDelay: '240ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              History ({history.length})
            </p>
            {history.length === 0 ? (
              <p className="text-medical-500 text-sm">No resolved or inactive problems.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {history.map((p) => (
                  <li key={p.id} className="py-3 flex items-start gap-4">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border shrink-0 bg-medical-500/10 text-medical-300 border-white/10">
                      {p.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-medical-200 text-sm">
                        {p.code && <span className="font-mono text-cyan-300/70 mr-2">{p.code}</span>}
                        {p.description}
                      </p>
                      <p className="text-medical-500 text-[10px] mt-1">
                        {p.resolved_at ? `Resolved ${p.resolved_at}` : `Added ${new Date(p.created_at).toLocaleDateString()}`}
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
