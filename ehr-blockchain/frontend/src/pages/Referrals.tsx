import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  createReferral,
  getPatients,
  getStaff,
  listReferrals,
  updateReferralStatus,
} from '../services/api'

interface Referral {
  id: string
  patient_id: string
  from_user_id: string
  to_user_id: string
  specialty: string | null
  reason: string
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'
  response_note: string | null
  created_at: string
  updated_at: string
  patient_first_name: string | null
  patient_last_name: string | null
  from_first_name: string | null
  from_last_name: string | null
  to_first_name: string | null
  to_last_name: string | null
  to_role: string | null
}

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
}

interface Staff {
  id: string
  first_name: string
  last_name: string
  role: string
}

function statusTone(s: Referral['status']) {
  switch (s) {
    case 'pending':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    case 'accepted':
      return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
    case 'completed':
      return 'bg-mint-500/10 text-mint-300 border-mint-500/30'
    case 'declined':
    case 'cancelled':
      return 'bg-medical-500/10 text-medical-400 border-white/10'
  }
}

export default function Referrals() {
  const { user } = useAuth()
  const isStaff = user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'admin'

  const [rows, setRows] = useState<Referral[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [patientPick, setPatientPick] = useState('')
  const [staffPick, setStaffPick] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const refs = await listReferrals()
      setRows(refs.data || [])
      if (isStaff) {
        const [pts, stf] = await Promise.all([
          getPatients().catch(() => ({ data: [] })),
          getStaff().catch(() => ({ data: [] })),
        ])
        setPatients(pts.data || [])
        setStaff(
          (stf.data || []).filter(
            (s: Staff) => s.role === 'doctor' || s.role === 'nurse' || s.role === 'admin',
          ),
        )
      }
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load referrals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async () => {
    if (!patientPick || !staffPick || !reason.trim()) return
    setSubmitting(true)
    try {
      await createReferral({
        patient_id: patientPick,
        to_user_id: staffPick,
        specialty: specialty.trim() || undefined,
        reason: reason.trim(),
      })
      setPatientPick('')
      setStaffPick('')
      setSpecialty('')
      setReason('')
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed to create referral')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatus = async (
    r: Referral,
    status: 'accepted' | 'declined' | 'completed' | 'cancelled',
  ) => {
    const note = prompt(`Note for ${status} (optional)`) ?? undefined
    if (status === 'declined' && !confirm('Decline this referral?')) return
    if (status === 'cancelled' && !confirm('Cancel this referral?')) return
    try {
      await updateReferralStatus(r.id, status, note || undefined)
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed')
    }
  }

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])
  const resolved = useMemo(() => rows.filter((r) => r.status !== 'pending'), [rows])

  return (
    <Layout>
      <PageHeader
        section="Care Coordination"
        title="Referrals"
        subtitle={isStaff ? 'Refer patients to colleagues and track responses' : 'Referrals concerning your care'}
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

      {isStaff && (
        <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Send a referral</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-3">
            <select
              value={patientPick}
              onChange={(e) => setPatientPick(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
            >
              <option value="">— patient —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
            <select
              value={staffPick}
              onChange={(e) => setStaffPick(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
            >
              <option value="">— refer to —</option>
              {staff
                .filter((s) => s.id !== user?.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.role})
                  </option>
                ))}
            </select>
            <input
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="Specialty (e.g. Cardiology)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
          </div>
          <div className="flex gap-3 mt-3">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for referral"
              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <button
              onClick={handleCreate}
              disabled={submitting || !patientPick || !staffPick || !reason.trim()}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send'}
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
          <section className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '120ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              Pending ({pending.length})
            </p>
            {pending.length === 0 ? (
              <p className="text-medical-500 text-sm">No pending referrals.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {pending.map((r) => {
                  const isRecipient = r.to_user_id === user?.id
                  const isSender = r.from_user_id === user?.id
                  return (
                    <li key={r.id} className="py-3 flex items-start gap-4">
                      <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${statusTone(r.status)}`}>
                        {r.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">
                          <span className="text-medical-400">
                            {r.from_first_name} {r.from_last_name}
                          </span>
                          <span className="mx-2 text-medical-600">→</span>
                          <span className="text-cyan-300">
                            {r.to_first_name} {r.to_last_name}
                          </span>
                          {r.specialty && (
                            <span className="ml-2 text-medical-500 text-xs">· {r.specialty}</span>
                          )}
                        </p>
                        <p className="text-medical-400 text-xs mt-1">
                          Patient: {r.patient_first_name} {r.patient_last_name}
                        </p>
                        <p className="text-medical-300 text-sm mt-2">{r.reason}</p>
                      </div>
                      <div className="shrink-0 flex gap-2">
                        {isRecipient && (
                          <>
                            <button
                              onClick={() => handleStatus(r, 'accepted')}
                              className="text-mint-400 hover:text-mint-300 text-xs"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleStatus(r, 'declined')}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {isSender && (
                          <button
                            onClick={() => handleStatus(r, 'cancelled')}
                            className="text-medical-400 hover:text-medical-300 text-xs"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="glass-card p-5 fade-up" style={{ animationDelay: '180ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
              History ({resolved.length})
            </p>
            {resolved.length === 0 ? (
              <p className="text-medical-500 text-sm">No resolved referrals.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {resolved.slice(0, 50).map((r) => {
                  const isRecipient = r.to_user_id === user?.id
                  const canComplete = r.status === 'accepted' && (isRecipient || user?.role === 'admin')
                  return (
                    <li key={r.id} className="py-3 flex items-start gap-4">
                      <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${statusTone(r.status)}`}>
                        {r.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-medical-200 text-sm">
                          <span className="text-medical-400">
                            {r.from_first_name} {r.from_last_name}
                          </span>
                          <span className="mx-2 text-medical-600">→</span>
                          <span>
                            {r.to_first_name} {r.to_last_name}
                          </span>
                          {r.specialty && (
                            <span className="ml-2 text-medical-500 text-xs">· {r.specialty}</span>
                          )}
                        </p>
                        <p className="text-medical-500 text-xs mt-1">
                          {r.patient_first_name} {r.patient_last_name} ·{' '}
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-medical-400 text-sm mt-1">{r.reason}</p>
                        {r.response_note && (
                          <p className="text-medical-500 text-xs mt-1 italic">
                            Note: {r.response_note}
                          </p>
                        )}
                      </div>
                      {canComplete && (
                        <button
                          onClick={() => handleStatus(r, 'completed')}
                          className="shrink-0 text-cyan-400 hover:text-cyan-300 text-xs"
                        >
                          Complete
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  )
}
