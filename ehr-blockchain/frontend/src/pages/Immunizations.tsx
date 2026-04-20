import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  createImmunization,
  getMyPatient,
  getPatients,
  listPatientImmunizations,
} from '../services/api'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
  user_id: string | null
}

interface Immunization {
  id: string
  patient_id: string
  vaccine: string
  dose_number: number | null
  administered_on: string
  administered_by: string | null
  manufacturer: string | null
  lot_number: string | null
  site: string | null
  notes: string | null
  created_at: string
}

export default function Immunizations() {
  const { user } = useAuth()
  const isStaff = user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'admin'
  const isPatient = user?.role === 'patient'

  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<string>('')
  const [rows, setRows] = useState<Immunization[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Add-form (staff)
  const [vaccine, setVaccine] = useState('')
  const [dose, setDose] = useState<string>('')
  const [administered, setAdministered] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [lot, setLot] = useState('')
  const [site, setSite] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      const res = await listPatientImmunizations(patientId)
      setRows(res.data || [])
    } catch (e: any) {
      const b = e.response?.data
      setError(typeof b === 'string' ? b : b?.message || 'Failed to load immunizations')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!selectedPatient || !vaccine.trim() || !administered) return
    setSubmitting(true)
    try {
      await createImmunization({
        patient_id: selectedPatient,
        vaccine: vaccine.trim(),
        dose_number: dose ? Number(dose) : undefined,
        administered_on: administered,
        manufacturer: manufacturer.trim() || undefined,
        lot_number: lot.trim() || undefined,
        site: site.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      setVaccine('')
      setDose('')
      setAdministered('')
      setManufacturer('')
      setLot('')
      setSite('')
      setNotes('')
      void loadList(selectedPatient)
    } catch (e: any) {
      alert(e.response?.data || 'Failed to add immunization')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Clinical"
        title="Immunizations"
        subtitle="Vaccine administration records tied to each patient"
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

      {isStaff && selectedPatient && (
        <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '120ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Record an immunization</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_160px_auto] gap-3">
            <input
              value={vaccine}
              onChange={(e) => setVaccine(e.target.value)}
              placeholder="Vaccine (e.g. COVID-19 mRNA, MMR)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <input
              type="number"
              min={1}
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Dose #"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <input
              type="date"
              value={administered}
              onChange={(e) => setAdministered(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <button
              onClick={handleAdd}
              disabled={submitting || !vaccine.trim() || !administered}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Record'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Manufacturer (optional)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
            <input
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              placeholder="Lot number (optional)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm font-mono focus:outline-none focus:border-cyan-400/50"
            />
            <input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="Site (e.g. Left deltoid)"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
            />
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="mt-3 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm focus:outline-none focus:border-cyan-400/50"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <section className="glass-card p-5 fade-up" style={{ animationDelay: '180ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
            History ({rows.length})
          </p>
          {rows.length === 0 ? (
            <p className="text-medical-500 text-sm">No immunizations on file yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((r) => (
                <li key={r.id} className="py-3 flex items-start gap-4">
                  <div className="shrink-0 text-right w-28">
                    <p className="text-white text-sm font-mono">
                      {new Date(r.administered_on).toLocaleDateString()}
                    </p>
                    {r.dose_number && (
                      <p className="text-cyan-300 text-[10px] font-mono">Dose #{r.dose_number}</p>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{r.vaccine}</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {r.manufacturer && (
                        <span className="text-medical-400 text-xs">{r.manufacturer}</span>
                      )}
                      {r.lot_number && (
                        <span className="text-medical-500 text-xs font-mono">lot {r.lot_number}</span>
                      )}
                      {r.site && <span className="text-medical-500 text-xs">{r.site}</span>}
                    </div>
                    {r.notes && <p className="text-medical-400 text-xs mt-1">{r.notes}</p>}
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
