import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import {
  createAssignment,
  deleteAssignment,
  getPatients,
  getStaff,
  listAssignments,
} from '../services/api'

interface Row {
  id: string
  patient_id: string
  staff_user_id: string
  assigned_at: string
  removed_at: string | null
  staff_email: string | null
  staff_first_name: string | null
  staff_last_name: string | null
  staff_role: string | null
  patient_first_name: string | null
  patient_last_name: string | null
}

interface Patient { id: string; first_name: string | null; last_name: string | null }
interface Staff { id: string; email: string; first_name: string; last_name: string; role: string }

export default function Assignments() {
  const [rows, setRows] = useState<Row[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newPatient, setNewPatient] = useState('')
  const [newStaff, setNewStaff] = useState('')

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [assRes, patRes, stfRes] = await Promise.all([
        listAssignments(),
        getPatients(),
        getStaff(),
      ])
      setRows(assRes.data || [])
      setPatients(patRes.data || [])
      setStaff((stfRes.data || []).filter((s: Staff) => s.role === 'doctor' || s.role === 'nurse'))
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newPatient || !newStaff) return
    try {
      await createAssignment(newPatient, newStaff)
      setNewPatient('')
      setNewStaff('')
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed to create assignment')
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this assignment?')) return
    try {
      await deleteAssignment(id)
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed to remove')
    }
  }

  const active = useMemo(() => rows.filter((r) => !r.removed_at), [rows])
  const history = useMemo(() => rows.filter((r) => r.removed_at), [rows])

  return (
    <Layout>
      <PageHeader
        section="Compliance"
        title="Patient Assignments"
        subtitle="Minimum-necessary: doctors and nurses only see patients they've been assigned to"
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

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">New assignment</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={newPatient}
            onChange={(e) => setNewPatient(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
          >
            <option value="">— select patient —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          <select
            value={newStaff}
            onChange={(e) => setNewStaff(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
          >
            <option value="">— select doctor/nurse —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name} ({s.role})
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={!newPatient || !newStaff}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
          >
            Assign
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '120ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Active ({active.length})
            </p>
            {active.length === 0 ? (
              <p className="text-medical-500 text-sm">No active assignments.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {active.map((r) => (
                  <li key={r.id} className="py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm">
                        {r.staff_first_name} {r.staff_last_name}{' '}
                        <span className="text-medical-500 text-xs">
                          ({r.staff_role}) ← patient{' '}
                        </span>
                        <span className="font-mono text-xs">{r.patient_id.slice(0, 8)}…</span>
                      </p>
                      <p className="text-medical-500 text-[10px] mt-1">
                        Since {new Date(r.assigned_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemove(r.id)}
                      className="shrink-0 text-red-400 hover:text-red-300 text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-card p-5 fade-up" style={{ animationDelay: '180ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              History ({history.length})
            </p>
            {history.length === 0 ? (
              <p className="text-medical-500 text-sm">No removed assignments.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {history.slice(0, 20).map((r) => (
                  <li key={r.id} className="py-3">
                    <p className="text-medical-300 text-sm">
                      {r.staff_first_name} {r.staff_last_name} ← patient{' '}
                      <span className="font-mono text-xs">{r.patient_id.slice(0, 8)}…</span>
                    </p>
                    <p className="text-medical-500 text-[10px]">
                      Assigned {new Date(r.assigned_at).toLocaleDateString()} · removed{' '}
                      {r.removed_at ? new Date(r.removed_at).toLocaleDateString() : '—'}
                    </p>
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
