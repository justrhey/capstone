import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  bookAppointment,
  getStaff,
  listAppointments,
  updateAppointmentStatus,
} from '../services/api'

interface Appointment {
  id: string
  patient_id: string
  staff_user_id: string
  start_at: string
  duration_minutes: number
  reason: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes: string | null
  patient_first_name: string | null
  patient_last_name: string | null
  staff_first_name: string | null
  staff_last_name: string | null
  staff_role: string | null
}

interface StaffRow {
  id: string
  first_name: string
  last_name: string
  role: string
}

function statusTone(s: Appointment['status']) {
  switch (s) {
    case 'scheduled':
      return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
    case 'completed':
      return 'bg-mint-500/10 text-mint-300 border-mint-500/30'
    case 'cancelled':
      return 'bg-medical-500/10 text-medical-400 border-white/10'
    case 'no_show':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
  }
}

export default function Appointments() {
  const { user } = useAuth()
  const isPatient = user?.role === 'patient'
  const isStaff = user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'admin'

  const [rows, setRows] = useState<Appointment[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Booking form
  const [staffPick, setStaffPick] = useState('')
  const [startAt, setStartAt] = useState('')
  const [duration, setDuration] = useState(30)
  const [reason, setReason] = useState('')
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [apptRes, staffRes] = await Promise.all([
        listAppointments(),
        getStaff().catch(() => ({ data: [] })),
      ])
      setRows(apptRes.data || [])
      setStaff((staffRes.data || []).filter((s: StaffRow) => s.role === 'doctor' || s.role === 'nurse'))
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load appointments')
    } finally {
      setLoading(false)
    }
  }

  const handleBook = async () => {
    if (!staffPick || !startAt) return
    setBooking(true)
    try {
      const iso = new Date(startAt).toISOString()
      await bookAppointment({
        staff_user_id: staffPick,
        start_at: iso,
        duration_minutes: duration,
        reason: reason.trim() || undefined,
      })
      setStaffPick('')
      setStartAt('')
      setReason('')
      setDuration(30)
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed to book')
    } finally {
      setBooking(false)
    }
  }

  const handleStatus = async (a: Appointment, status: 'completed' | 'cancelled' | 'no_show') => {
    const note = prompt(`Note for ${status} (optional)`) ?? undefined
    if (status !== 'cancelled' && !confirm(`Mark as ${status}?`)) return
    try {
      await updateAppointmentStatus(a.id, status, note || undefined)
      void load()
    } catch (e: any) {
      alert(e.response?.data || 'Failed')
    }
  }

  const upcoming = useMemo(
    () => rows.filter((r) => r.status === 'scheduled'),
    [rows]
  )
  const history = useMemo(
    () => rows.filter((r) => r.status !== 'scheduled'),
    [rows]
  )

  return (
    <Layout>
      <PageHeader
        section="Scheduling"
        title="Appointments"
        subtitle={isPatient ? 'Book a visit and track your upcoming appointments' : 'Your scheduled appointments'}
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

      {isPatient && (
        <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Book an appointment</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_auto] gap-3">
            <select
              value={staffPick}
              onChange={(e) => setStaffPick(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
            >
              <option value="">— select doctor/nurse —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.role})
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50"
              title="Duration in minutes"
            />
            <button
              onClick={handleBook}
              disabled={booking || !staffPick || !startAt}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {booking ? 'Booking…' : 'Book'}
            </button>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for visit (optional)"
            className="mt-3 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
          />
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
              Upcoming ({upcoming.length})
            </p>
            {upcoming.length === 0 ? (
              <p className="text-medical-500 text-sm">No upcoming appointments.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {upcoming.map((a) => (
                  <li key={a.id} className="py-3 flex items-start gap-4">
                    <div className="shrink-0 text-right w-24">
                      <p className="text-white text-sm font-mono">
                        {new Date(a.start_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-medical-400 text-xs font-mono">
                        {new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-medical-600 text-[10px]">{a.duration_minutes} min</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm">
                        {isPatient
                          ? `${a.staff_first_name} ${a.staff_last_name} (${a.staff_role})`
                          : `${a.patient_first_name} ${a.patient_last_name}`}
                      </p>
                      {a.reason && (
                        <p className="text-medical-400 text-xs mt-1">{a.reason}</p>
                      )}
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${statusTone(a.status)}`}>
                      {a.status}
                    </span>
                    <div className="shrink-0 flex gap-2">
                      {isStaff && (
                        <>
                          <button
                            onClick={() => handleStatus(a, 'completed')}
                            className="text-mint-400 hover:text-mint-300 text-xs"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => handleStatus(a, 'no_show')}
                            className="text-amber-400 hover:text-amber-300 text-xs"
                          >
                            No-show
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleStatus(a, 'cancelled')}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
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
              <p className="text-medical-500 text-sm">No past appointments yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {history.slice(0, 30).map((a) => (
                  <li key={a.id} className="py-3 flex items-start gap-4">
                    <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${statusTone(a.status)}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-medical-200 text-sm">
                        {new Date(a.start_at).toLocaleString()} ·{' '}
                        {isPatient
                          ? `${a.staff_first_name} ${a.staff_last_name}`
                          : `${a.patient_first_name} ${a.patient_last_name}`}
                      </p>
                      {a.reason && (
                        <p className="text-medical-500 text-xs mt-1">{a.reason}</p>
                      )}
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
