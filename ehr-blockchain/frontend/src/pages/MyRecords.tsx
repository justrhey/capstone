import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPatients, getRecordsByPatient } from '../services/api'
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

export default function MyRecords() {
  const { user } = useAuth()
  const [records, setRecords] = useState<RecordData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.id) {
      loadRecords()
    }
  }, [user?.id])

  const loadRecords = async () => {
    if (!user?.id) return
    
    try {
      setError('')
      const res = await getPatients()
      const patients = res.data
      
      const userId = user.id.toLowerCase()
      const myPatients = patients.filter((p: any) => p.user_id?.toLowerCase() === userId)
      
      if (myPatients.length === 0) {
        setError('No patient profile linked to your account. Please contact admin.')
        setLoading(false)
        return
      }
      
      const myPatient = myPatients[0]
      const recordRes = await getRecordsByPatient(myPatient.id)
      setRecords(recordRes.data)
    } catch (err) {
      console.error('Failed to load records:', err)
      setError('Failed to load records')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">My Medical Records</h1>
        <p className="text-medical-400 mt-1">View your health records</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-red-400 text-lg mb-2">Access Restricted</p>
          <p className="text-medical-400">{error}</p>
        </div>
      ) : records.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-medical-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-medical-400">No medical records found</p>
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
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}