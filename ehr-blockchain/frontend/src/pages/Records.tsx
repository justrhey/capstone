import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getPatients, getRecordsByPatient, createRecord } from '../services/api'
import Layout from '../components/Layout'

interface RecordData {
  record: {
    id: string
    patient_id: string
    diagnosis: string
    treatment: string
    notes: string
    record_hash: string
    blockchain_tx_id: string | null
    created_at: string
  }
  medications: Array<{ name: string; dosage: string; frequency: string }>
  allergies: Array<{ allergen: string; severity: string }>
  blockchain_verified: boolean
  blockchain_tx_hash: string | null
}

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
}

export default function Records() {
  const [searchParams] = useSearchParams()
  const [records, setRecords] = useState<RecordData[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  
  const [selectedPatient, setSelectedPatient] = useState(searchParams.get('patient') || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [error, setError] = useState('')
  const [submissionBlocked, setSubmissionBlocked] = useState(false)
  const [formData, setFormData] = useState({
    patient_id: '',
    diagnosis: '',
    treatment: '',
    notes: '',
    medications: [{ name: '', dosage: '', frequency: '' }],
    allergies: [{ allergen: '', severity: 'mild' }]
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
        setRecords(recordRes.data)
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
      await createRecord({
        ...formData,
        patient_id: formData.patient_id,
        medications: meds.length > 0 ? meds : undefined,
        allergies: alls.length > 0 ? alls : undefined
      })
      setSubmitSuccess(true)
      setTimeout(() => {
        setShowModal(false)
        setFormData({
          patient_id: '',
          diagnosis: '',
          treatment: '',
          notes: '',
          medications: [{ name: '', dosage: '', frequency: '' }],
          allergies: [{ allergen: '', severity: 'mild' }]
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
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Medical Records</h1>
          <p className="text-medical-400 mt-1">Create and manage medical records</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Record
        </button>
      </div>

      <div className="mb-6">
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
          {records.map((item) => (
            <div key={item.record.id} className="glass-card p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium">{item.record.diagnosis || 'No diagnosis'}</h3>
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
                  </div>
                  <p className="text-medical-400 text-sm mt-1">
                    {new Date(item.record.created_at).toLocaleString()}
                  </p>
                </div>
                {item.blockchain_tx_hash && (
                  <div className="text-right">
                    <p className="text-medical-500 text-xs">TX Hash</p>
                    <p className="text-cyan-300 text-xs font-mono">{item.blockchain_tx_hash.slice(0, 12)}...</p>
                  </div>
                )}
              </div>

              {item.record.treatment && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase mb-1">Treatment</p>
                  <p className="text-white">{item.record.treatment}</p>
                </div>
              )}

              {item.record.notes && (
                <div className="mb-3">
                  <p className="text-medical-500 text-xs uppercase mb-1">Notes</p>
                  <p className="text-medical-300">{item.record.notes}</p>
                </div>
              )}

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
          ))}
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
                <label className="block text-medical-300 text-sm mb-2">Diagnosis</label>
                <input type="text" value={formData.diagnosis} onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Treatment</label>
                <input type="text" value={formData.treatment} onChange={(e) => setFormData({ ...formData, treatment: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
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
    </Layout>
  )
}