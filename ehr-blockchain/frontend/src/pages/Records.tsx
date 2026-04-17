import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getPatients, getRecordsByPatient, createRecord, updateRecord, deleteRecord, verifyRecord, getRecordReceipt, createOrder, resolveOrder } from '../services/api'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'

interface RecordData {
  record: {
    id: string
    patient_id: string
    subjective: string | null
    objective: string | null
    assessment: string | null
    plan: string | null
    record_hash: string
    blockchain_tx_id: string | null
    created_at: string
  }
  medications: Array<{ name: string; dosage: string; frequency: string }>
  allergies: Array<{ allergen: string; severity: string }>
  vitals: Array<{ kind: string; value: number; unit: string; taken_at: string }>
  orders: Array<{
    id: string
    kind: 'lab' | 'imaging' | 'prescription'
    summary: string
    status: 'ordered' | 'fulfilled' | 'cancelled'
    ordered_at: string
  }>
  blockchain_verified: boolean
  blockchain_tx_hash: string | null
}

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
  user_id: string | null
}

interface RecordWithPatient extends RecordData {
  patientName?: string
}

export default function Records() {
  const [searchParams] = useSearchParams()
  const [records, setRecords] = useState<RecordWithPatient[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RecordWithPatient | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<RecordWithPatient | null>(null)
  
  const { user } = useAuth()
  const canOrder = user?.role === 'doctor' || user?.role === 'nurse'
  const canResolveOrder = user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'admin'
  const [selectedPatient, setSelectedPatient] = useState(searchParams.get('patient') || '')
  const [verifyResults, setVerifyResults] = useState<Record<string, { status: string; loading: boolean }>>({})

  const handleAddOrder = async (recordId: string) => {
    const kindInput = prompt('Order kind — lab, imaging, or prescription:')
    if (!kindInput) return
    const kind = kindInput.trim().toLowerCase() as 'lab' | 'imaging' | 'prescription'
    if (!['lab', 'imaging', 'prescription'].includes(kind)) {
      alert('Kind must be one of: lab, imaging, prescription')
      return
    }
    const summary = prompt(`${kind} order summary (e.g. "CBC with differential" or "Ibuprofen 400mg"):`)
    if (!summary || !summary.trim()) return
    try {
      await createOrder(recordId, { kind, summary: summary.trim() })
      void loadData()
    } catch (e: any) {
      alert(e.response?.data || 'Failed to create order')
    }
  }

  const handleResolveOrder = async (orderId: string, status: 'fulfilled' | 'cancelled') => {
    const note = prompt(`Note for ${status} (optional):`) ?? undefined
    try {
      await resolveOrder(orderId, status, note || undefined)
      void loadData()
    } catch (e: any) {
      alert(e.response?.data || 'Failed')
    }
  }

  const handleDownloadReceipt = async (recordId: string) => {
    try {
      const res = await getRecordReceipt(recordId)
      const json = JSON.stringify(res.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `record-${recordId}-receipt.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      const body = err.response?.data
      const msg = typeof body === 'string' ? body : body?.message || 'Failed to fetch receipt'
      alert(msg)
    }
  }

  const handleVerify = async (recordId: string) => {
    setVerifyResults(prev => ({ ...prev, [recordId]: { status: '', loading: true } }))
    try {
      const res = await verifyRecord(recordId)
      setVerifyResults(prev => ({ ...prev, [recordId]: { status: res.data?.status || 'unknown', loading: false } }))
    } catch (err: any) {
      setVerifyResults(prev => ({ ...prev, [recordId]: { status: 'error', loading: false } }))
    }
  }
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [error, setError] = useState('')
  const [submissionBlocked, setSubmissionBlocked] = useState(false)
  const [formData, setFormData] = useState({
    patient_id: '',
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    medications: [{ name: '', dosage: '', frequency: '' }],
    allergies: [{ allergen: '', severity: 'mild' }],
    vitals: {
      temp_c: '',
      bp_systolic: '',
      bp_diastolic: '',
      hr: '',
      spo2: '',
      weight_kg: '',
    } as Record<string, string>,
  })

  useEffect(() => {
    loadData()
  }, [selectedPatient])

  useEffect(() => {
    if (patientSearch.trim() === '') {
      setFilteredPatients(patients)
    } else {
      const query = patientSearch.toLowerCase()
      const filtered = patients.filter(p => 
        (p.first_name && p.first_name.toLowerCase().includes(query)) ||
        (p.last_name && p.last_name.toLowerCase().includes(query))
      )
      setFilteredPatients(filtered)
    }
  }, [patientSearch, patients])

  const loadData = async () => {
    try {
      const patientRes = await getPatients()
      setPatients(patientRes.data)
      setFilteredPatients(patientRes.data)
      
      if (selectedPatient) {
        const recordRes = await getRecordsByPatient(selectedPatient)
        const patient = patientRes.data.find((p: Patient) => p.id === selectedPatient)
        const patientName = patient ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() : 'Unknown'
        const recordsWithPatient = recordRes.data.map((r: RecordData) => ({
          ...r,
          patientName
        }))
        setRecords(recordsWithPatient)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleViewRecords = (patientId: string) => {
    setSelectedPatient(patientId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Block duplicate submission
    if (submissionBlocked) {
      setError('Record is being created. Please wait...')
      return
    }
    
    setSubmissionBlocked(true)
    setSubmitting(true)
    setSubmitSuccess(false)
    try {
      const meds = formData.medications.filter(m => m.name.trim())
      const alls = formData.allergies.filter(a => a.allergen.trim())

      const vitalSpecs: Array<{ key: string; kind: string; unit: string }> = [
        { key: 'temp_c', kind: 'temperature', unit: '°C' },
        { key: 'bp_systolic', kind: 'bp_systolic', unit: 'mmHg' },
        { key: 'bp_diastolic', kind: 'bp_diastolic', unit: 'mmHg' },
        { key: 'hr', kind: 'heart_rate', unit: 'bpm' },
        { key: 'spo2', kind: 'spo2', unit: '%' },
        { key: 'weight_kg', kind: 'weight', unit: 'kg' },
      ]
      const vitals = vitalSpecs
        .map(s => ({ s, raw: formData.vitals[s.key] }))
        .filter(v => v.raw && v.raw.trim() !== '')
        .map(v => ({ kind: v.s.kind, value: Number(v.raw), unit: v.s.unit }))
        .filter(v => Number.isFinite(v.value))

      await createRecord({
        patient_id: formData.patient_id,
        subjective: formData.subjective,
        objective: formData.objective,
        assessment: formData.assessment,
        plan: formData.plan,
        medications: meds.length > 0 ? meds : undefined,
        allergies: alls.length > 0 ? alls : undefined,
        vitals: vitals.length > 0 ? vitals : undefined,
      })
      setSubmitSuccess(true)
      setTimeout(() => {
        setShowModal(false)
        setFormData({
          patient_id: '',
          subjective: '',
          objective: '',
          assessment: '',
          plan: '',
          medications: [{ name: '', dosage: '', frequency: '' }],
          allergies: [{ allergen: '', severity: 'mild' }],
          vitals: { temp_c: '', bp_systolic: '', bp_diastolic: '', hr: '', spo2: '', weight_kg: '' },
        })
        setSubmitSuccess(false)
        setSubmissionBlocked(false)
        loadData()
      }, 2000)
    } catch (err: any) {
      console.error('Failed to create record:', err)
      setSubmissionBlocked(false)
      setError(err.response?.data?.message || err.response?.data || 'Failed to create record')
    } finally {
      setSubmitting(false)
    }
  }

  const addMedication = () => {
    setFormData({
      ...formData,
      medications: [...formData.medications, { name: '', dosage: '', frequency: '' }]
    })
  }

  const removeMedication = (index: number) => {
    const meds = formData.medications.filter((_, i) => i !== index)
    setFormData({ ...formData, medications: meds.length ? meds : [{ name: '', dosage: '', frequency: '' }] })
  }

  const addAllergy = () => {
    setFormData({
      ...formData,
      allergies: [...formData.allergies, { allergen: '', severity: 'mild' }]
    })
  }

  const removeAllergy = (index: number) => {
    const alls = formData.allergies.filter((_, i) => i !== index)
    setFormData({ ...formData, allergies: alls.length ? alls : [{ allergen: '', severity: 'mild' }] })
  }

  return (
    <Layout>
      <PageHeader
        section="Clinical"
        title="Medical Records"
        subtitle="Create, verify, and manage encrypted medical records"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Record
          </button>
        }
      />

      <div className="mb-6 fade-up" style={{ animationDelay: '80ms' }}>
        {/* Search Bar */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-medical-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search patient by name..."
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            className="w-full max-w-md pl-10 pr-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
          />
        </div>
        
        <label className="block text-medical-300 text-sm mb-2">Select Patient</label>
        <div className="flex gap-2">
          <select
            value={selectedPatient}
            onChange={(e) => {
              setSelectedPatient(e.target.value)
            }}
            className="flex-1 max-w-xs px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
          >
            <option value="">-- Select a patient --</option>
            {filteredPatients.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
          {selectedPatient && (
            <button 
              onClick={() => handleViewRecords(selectedPatient)}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-xl hover:bg-cyan-500/30 transition-all"
            >
              View Records
            </button>
          )}
        </div>
        <p className="text-medical-500 text-xs mt-2">
          Showing {filteredPatients.length} of {patients.length} patients
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !selectedPatient ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-medical-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-medical-400">Select a patient to view records</p>
        </div>
      ) : records.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-medical-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-medical-400">No records for this patient</p>
          <button onClick={() => setShowModal(true)} className="mt-4 text-cyan-400 hover:text-cyan-300">Create the first record</button>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((item) => {
            const v = verifyResults[item.record.id]
            const isTampered = v?.status === 'tampered'
            return (
            <div
              key={item.record.id}
              className={`glass-card p-6 ${isTampered ? 'border-red-500/60 ring-1 ring-red-500/40 glow-cyan' : ''}`}
            >
              {isTampered && (
                <div className="mb-4 -mx-6 -mt-6 px-6 py-3 bg-red-500/15 border-b border-red-500/40 flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-red-300 font-semibold text-sm">Tampered — do not trust</p>
                    <p className="text-red-200/80 text-xs">
                      This record's current hash does not match the latest on-chain version.
                      The DB may have been altered without a corresponding contract update.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-300 text-xs">
                      {item.patientName}
                    </span>
                    <h3 className="text-white font-medium">{item.record.assessment || 'No assessment'}</h3>
                    {item.blockchain_verified ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-mint-500/10 border border-mint-500/20 rounded-full text-mint-400 text-xs">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Verified
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-400 text-xs">Pending</span>
                    )}
                    <span
                      title="SOAP fields are encrypted at rest with AES-256-GCM."
                      className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/5 border border-cyan-500/20 rounded-full text-cyan-300/90 text-[10px] uppercase tracking-wider"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c-1.105 0-2 .895-2 2v2a2 2 0 104 0v-2c0-1.105-.895-2-2-2zM6 8V6a6 6 0 1112 0v2h1a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2h1zm2 0h8V6a4 4 0 10-8 0v2z" />
                      </svg>
                      Encrypted
                    </span>
                  </div>
                  <p className="text-medical-400 text-sm mt-1">
                    {new Date(item.record.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.blockchain_tx_hash && (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${item.blockchain_tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-right mr-4 group"
                      title="View transaction on Stellar Expert"
                    >
                      <p className="text-medical-500 text-xs">TX Hash ↗</p>
                      <p className="text-cyan-300 group-hover:text-cyan-200 text-xs font-mono underline decoration-dotted underline-offset-2">
                        {item.blockchain_tx_hash.slice(0, 12)}...
                      </p>
                    </a>
                  )}
                  {(() => {
                    const v = verifyResults[item.record.id]
                    if (v?.loading) return <span className="text-medical-400 text-xs">Verifying…</span>
                    if (v?.status === 'intact') return <span className="text-mint-400 text-xs">✓ On-chain match</span>
                    if (v?.status === 'tampered') return <span className="text-red-400 text-xs">⚠ Tampered</span>
                    if (v?.status === 'unavailable') return <span className="text-amber-400 text-xs">Chain offline</span>
                    if (v?.status === 'error') return <span className="text-red-400 text-xs">Verify failed</span>
                    return (
                      <button
                        onClick={() => handleVerify(item.record.id)}
                        className="text-cyan-400 hover:text-cyan-300 text-sm"
                      >
                        Verify
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => handleDownloadReceipt(item.record.id)}
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                    title="Download a signed receipt with the hash, contract ID, and canonical payload for independent verification"
                  >
                    Receipt ↓
                  </button>
                  <button onClick={() => setEditingRecord(item)} className="text-yellow-400 hover:text-yellow-300 text-sm">Edit</button>
                  <button onClick={() => setDeletingRecord(item)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                </div>
              </div>

              {item.record.subjective && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase tracking-wider mb-1">S — Subjective</p>
                  <p className="text-medical-100 text-sm">{item.record.subjective}</p>
                </div>
              )}
              {item.record.objective && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase tracking-wider mb-1">O — Objective</p>
                  <p className="text-medical-100 text-sm">{item.record.objective}</p>
                </div>
              )}
              {item.record.assessment && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase tracking-wider mb-1">A — Assessment</p>
                  <p className="text-white text-sm">{item.record.assessment}</p>
                </div>
              )}
              {item.record.plan && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase tracking-wider mb-1">P — Plan</p>
                  <p className="text-medical-100 text-sm">{item.record.plan}</p>
                </div>
              )}

              {item.vitals && item.vitals.length > 0 && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase tracking-wider mb-2">Vitals</p>
                  <div className="flex flex-wrap gap-2">
                    {item.vitals.map((v, i) => (
                      <span key={i} className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-200 text-sm">
                        <span className="text-rose-400/80 text-xs mr-1">{v.kind.replace(/_/g, ' ')}</span>
                        <span className="font-mono">{v.value}</span>
                        <span className="text-medical-400 text-xs ml-1">{v.unit}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-medical-500 text-xs uppercase tracking-wider">Orders</p>
                  {canOrder && (
                    <button
                      onClick={() => handleAddOrder(item.record.id)}
                      className="text-cyan-400 hover:text-cyan-300 text-xs"
                    >
                      + Add order
                    </button>
                  )}
                </div>
                {item.orders && item.orders.length > 0 ? (
                  <ul className="space-y-2">
                    {item.orders.map((o) => {
                      const kindColor =
                        o.kind === 'lab' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                        : o.kind === 'imaging' ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                        : 'bg-mint-500/10 text-mint-300 border-mint-500/20'
                      const statusColor =
                        o.status === 'ordered' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : o.status === 'fulfilled' ? 'bg-mint-500/10 text-mint-300 border-mint-500/30'
                        : 'bg-medical-500/10 text-medical-400 border-white/10'
                      return (
                        <li key={o.id} className="flex items-center gap-3 py-1">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${kindColor}`}>
                            {o.kind}
                          </span>
                          <span className="text-medical-100 text-sm flex-1 min-w-0 truncate">{o.summary}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${statusColor}`}>
                            {o.status}
                          </span>
                          {o.status === 'ordered' && canResolveOrder && (
                            <>
                              <button
                                onClick={() => handleResolveOrder(o.id, 'fulfilled')}
                                className="text-mint-400 hover:text-mint-300 text-xs"
                              >
                                Fulfil
                              </button>
                              <button
                                onClick={() => handleResolveOrder(o.id, 'cancelled')}
                                className="text-red-400 hover:text-red-300 text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-medical-600 text-xs">No orders yet.</p>
                )}
              </div>

              {item.medications.length > 0 && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase mb-2">Medications</p>
                  <div className="flex flex-wrap gap-2">
                    {item.medications.map((med, i) => (
                      <span key={i} className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-300 text-sm">
                        {med.name} ({med.dosage})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.allergies.length > 0 && (
                <div>
                  <p className="text-medical-500 text-xs uppercase mb-2">Allergies</p>
                  <div className="flex flex-wrap gap-2">
                    {item.allergies.map((allergy, i) => (
                      <span key={i} className={`px-3 py-1 rounded-lg text-sm ${allergy.severity === 'severe' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : allergy.severity === 'moderate' ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400' : 'bg-orange-500/10 border border-orange-500/20 text-orange-400'}`}>
                        {allergy.allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-medical-500 text-xs">Record Hash (SHA-256)</p>
                <p className="text-medical-300 text-xs font-mono break-all">{item.record.record_hash}</p>
              </div>
            </div>
          )})}
        </div>
      )}

      {/* Create Record Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-auto py-8">
          <div className="glass-card w-full max-w-2xl p-6 mx-4 my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Create Medical Record</h2>
              <button onClick={() => setShowModal(false)} className="text-medical-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-auto">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-medical-300 text-sm mb-2">Patient</label>
                <select required value={formData.patient_id} onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800">
                  <option value="">-- Select patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">
                  <span className="text-cyan-300 font-semibold">S</span> — Subjective <span className="text-medical-500 text-xs">(patient-reported symptoms, history)</span>
                </label>
                <textarea value={formData.subjective} onChange={(e) => setFormData({ ...formData, subjective: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">
                  <span className="text-cyan-300 font-semibold">O</span> — Objective <span className="text-medical-500 text-xs">(exam findings, vitals narrative)</span>
                </label>
                <textarea value={formData.objective} onChange={(e) => setFormData({ ...formData, objective: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">
                  <span className="text-cyan-300 font-semibold">A</span> — Assessment <span className="text-medical-500 text-xs">(clinical judgment / diagnosis)</span>
                </label>
                <input type="text" value={formData.assessment} onChange={(e) => setFormData({ ...formData, assessment: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">
                  <span className="text-cyan-300 font-semibold">P</span> — Plan <span className="text-medical-500 text-xs">(treatment, follow-up)</span>
                </label>
                <textarea value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Vitals (optional)</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    ['temp_c', 'Temp', '°C', '36.8'],
                    ['bp_systolic', 'BP sys', 'mmHg', '120'],
                    ['bp_diastolic', 'BP dia', 'mmHg', '80'],
                    ['hr', 'Heart rate', 'bpm', '72'],
                    ['spo2', 'SpO₂', '%', '98'],
                    ['weight_kg', 'Weight', 'kg', '65'],
                  ] as const).map(([key, label, unit, placeholder]) => (
                    <div key={key}>
                      <label className="block text-medical-400 text-xs mb-1">
                        {label} <span className="text-medical-600">({unit})</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        value={formData.vitals[key]}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            vitals: { ...formData.vitals, [key]: e.target.value },
                          })
                        }
                        placeholder={placeholder}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-medical-600 focus:outline-none focus:border-cyan-400/50 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-medical-300 text-sm">Medications</label>
                  <button type="button" onClick={addMedication} className="text-cyan-400 text-sm">+ Add</button>
                </div>
                {formData.medications.map((med, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input type="text" placeholder="Name" value={med.name} onChange={(e) => {
                      const meds = [...formData.medications]
                      meds[i].name = e.target.value
                      setFormData({ ...formData, medications: meds })
                    }} className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <input type="text" placeholder="Dosage" value={med.dosage} onChange={(e) => {
                      const meds = [...formData.medications]
                      meds[i].dosage = e.target.value
                      setFormData({ ...formData, medications: meds })
                    }} className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <input type="text" placeholder="Freq" value={med.frequency} onChange={(e) => {
                      const meds = [...formData.medications]
                      meds[i].frequency = e.target.value
                      setFormData({ ...formData, medications: meds })
                    }} className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    {formData.medications.length > 1 && (
                      <button type="button" onClick={() => removeMedication(i)} className="text-red-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-medical-300 text-sm">Allergies</label>
                  <button type="button" onClick={addAllergy} className="text-cyan-400 text-sm">+ Add</button>
                </div>
                {formData.allergies.map((allergy, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input type="text" placeholder="Allergen" value={allergy.allergen} onChange={(e) => {
                      const alls = [...formData.allergies]
                      alls[i].allergen = e.target.value
                      setFormData({ ...formData, allergies: alls })
                    }} className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <select value={allergy.severity} onChange={(e) => {
                      const alls = [...formData.allergies]
                      alls[i].severity = e.target.value
                      setFormData({ ...formData, allergies: alls })
                    }} className="w-28 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                    {formData.allergies.length > 1 && (
                      <button type="button" onClick={() => removeAllergy(i)} className="text-red-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button 
                  type="submit" 
                  disabled={submitting || submissionBlocked}
                  className="w-full bg-gradient-to-r from-cyan-500 to-mint-500 text-white py-3 rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Storing on Blockchain...
                    </>
                  ) : submitSuccess ? (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Verified - Record Created!
                    </>
                  ) : (
                    'Create Record (Blockchain Verified)'
                  )}
                </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <EditRecordModal 
          record={editingRecord} 
          onSave={async (data) => {
            await updateRecord(editingRecord.record.id, data)
            setEditingRecord(null)
            loadData()
          }} 
          onCancel={() => setEditingRecord(null)} 
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingRecord && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card w-full max-w-md p-6 mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Delete Medical Record</h2>
              <button onClick={() => setDeletingRecord(null)} className="text-medical-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-medical-300 mb-6">
              Are you sure you want to delete this medical record for <span className="text-white font-medium">{deletingRecord.patientName}</span>? 
              This action cannot be undone. The blockchain verification will also be removed.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setDeletingRecord(null)} className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all">
                Cancel
              </button>
              <button onClick={async () => {
                await deleteRecord(deletingRecord.record.id)
                setDeletingRecord(null)
                loadData()
              }} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function EditRecordModal({ record, onSave, onCancel }: { record: RecordWithPatient; onSave: (data: any) => Promise<void>; onCancel: () => void }) {
  const [formData, setFormData] = useState({
    subjective: record.record.subjective || '',
    objective: record.record.objective || '',
    assessment: record.record.assessment || '',
    plan: record.record.plan || '',
    medications: record.medications.length > 0 ? record.medications : [{ name: '', dosage: '', frequency: '' }],
    allergies: record.allergies.length > 0 ? record.allergies : [{ allergen: '', severity: 'mild' }]
  })
  const [saving, setSaving] = useState(false)

  const addMedication = () => {
    setFormData({ ...formData, medications: [...formData.medications, { name: '', dosage: '', frequency: '' }] })
  }

  const removeMedication = (index: number) => {
    const meds = formData.medications.filter((_, i) => i !== index)
    setFormData({ ...formData, medications: meds.length ? meds : [{ name: '', dosage: '', frequency: '' }] })
  }

  const addAllergy = () => {
    setFormData({ ...formData, allergies: [...formData.allergies, { allergen: '', severity: 'mild' }] })
  }

  const removeAllergy = (index: number) => {
    const alls = formData.allergies.filter((_, i) => i !== index)
    setFormData({ ...formData, allergies: alls.length ? alls : [{ allergen: '', severity: 'mild' }] })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const meds = formData.medications.filter(m => m.name.trim())
      const alls = formData.allergies.filter(a => a.allergen.trim())
      await onSave({
        subjective: formData.subjective,
        objective: formData.objective,
        assessment: formData.assessment,
        plan: formData.plan,
        medications: meds.length > 0 ? meds : undefined,
        allergies: alls.length > 0 ? alls : undefined
      })
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-auto py-8">
      <div className="glass-card w-full max-w-2xl p-6 mx-4 my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Edit Medical Record</h2>
          <button onClick={onCancel} className="text-medical-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-auto">
          <div>
            <label className="block text-medical-300 text-sm mb-2"><span className="text-cyan-300 font-semibold">S</span> — Subjective</label>
            <textarea value={formData.subjective} onChange={(e) => setFormData({ ...formData, subjective: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
          </div>
          <div>
            <label className="block text-medical-300 text-sm mb-2"><span className="text-cyan-300 font-semibold">O</span> — Objective</label>
            <textarea value={formData.objective} onChange={(e) => setFormData({ ...formData, objective: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
          </div>
          <div>
            <label className="block text-medical-300 text-sm mb-2"><span className="text-cyan-300 font-semibold">A</span> — Assessment</label>
            <input type="text" value={formData.assessment} onChange={(e) => setFormData({ ...formData, assessment: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
          </div>
          <div>
            <label className="block text-medical-300 text-sm mb-2"><span className="text-cyan-300 font-semibold">P</span> — Plan</label>
            <textarea value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-medical-300 text-sm">Medications</label>
              <button type="button" onClick={addMedication} className="text-cyan-400 text-sm">+ Add</button>
            </div>
            {formData.medications.map((med, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input type="text" placeholder="Name" value={med.name} onChange={(e) => {
                  const meds = [...formData.medications]
                  meds[i].name = e.target.value
                  setFormData({ ...formData, medications: meds })
                }} className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                <input type="text" placeholder="Dosage" value={med.dosage} onChange={(e) => {
                  const meds = [...formData.medications]
                  meds[i].dosage = e.target.value
                  setFormData({ ...formData, medications: meds })
                }} className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                <input type="text" placeholder="Freq" value={med.frequency} onChange={(e) => {
                  const meds = [...formData.medications]
                  meds[i].frequency = e.target.value
                  setFormData({ ...formData, medications: meds })
                }} className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                {formData.medications.length > 1 && (
                  <button type="button" onClick={() => removeMedication(i)} className="text-red-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-medical-300 text-sm">Allergies</label>
              <button type="button" onClick={addAllergy} className="text-cyan-400 text-sm">+ Add</button>
            </div>
            {formData.allergies.map((allergy, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input type="text" placeholder="Allergen" value={allergy.allergen} onChange={(e) => {
                  const alls = [...formData.allergies]
                  alls[i].allergen = e.target.value
                  setFormData({ ...formData, allergies: alls })
                }} className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                <select value={allergy.severity} onChange={(e) => {
                  const alls = [...formData.allergies]
                  alls[i].severity = e.target.value
                  setFormData({ ...formData, allergies: alls })
                }} className="w-28 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
                {formData.allergies.length > 1 && (
                  <button type="button" onClick={() => removeAllergy(i)} className="text-red-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button type="button" onClick={onCancel} className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}