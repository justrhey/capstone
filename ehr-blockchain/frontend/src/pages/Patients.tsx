import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatients, createPatientWithAccount, getAllUsers, updatePatient, deletePatient, activateBreakGlass } from '../services/api'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string
  sex: string
  blood_type: string | null
  contact_number: string | null
  address: string | null
  created_at: string
  user_id: string | null
}

interface User {
  id: string
  email: string
}

function EditPatientForm({ patient, onSave, onCancel }: { patient: Patient; onSave: (data: any) => Promise<void>; onCancel: () => void }) {
  const [formData, setFormData] = useState({
    first_name: patient.first_name || '',
    last_name: patient.last_name || '',
    date_of_birth: patient.date_of_birth,
    sex: patient.sex,
    blood_type: patient.blood_type || '',
    contact_number: patient.contact_number || '',
    address: patient.address || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        ...formData,
        blood_type: formData.blood_type || undefined,
        contact_number: formData.contact_number || undefined,
        address: formData.address || undefined,
      })
    } catch (err: any) {
      const body = err.response?.data
      const msg = typeof body === 'string' ? body : body?.message || 'Failed to update patient'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-medical-300 text-sm mb-2">First Name</label>
          <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
        </div>
        <div>
          <label className="block text-medical-300 text-sm mb-2">Last Name</label>
          <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
        </div>
      </div>
      <div>
        <label className="block text-medical-300 text-sm mb-2">Date of Birth</label>
        <input type="date" required value={formData.date_of_birth} onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-medical-300 text-sm mb-2">Sex</label>
          <select value={formData.sex} onChange={(e) => setFormData({ ...formData, sex: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-medical-300 text-sm mb-2">Blood Type</label>
          <select value={formData.blood_type} onChange={(e) => setFormData({ ...formData, blood_type: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800">
            <option value="">Unknown</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-medical-300 text-sm mb-2">Contact Number</label>
        <input type="tel" value={formData.contact_number} onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} placeholder="e.g. +63 912 345 6789" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
      </div>
      <div>
        <label className="block text-medical-300 text-sm mb-2">Address</label>
        <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} placeholder="Street, City, Postal Code" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
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
  )
}

export default function Patients() {
  const { user } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState({ first_name: '', last_name: '', date_of_birth: '', sex: 'male', email: '', password: '', blood_type: '', contact_number: '', address: '' })
  const [creating, setCreating] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPatients(patients)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = patients.filter(p => 
        (p.first_name && p.first_name.toLowerCase().includes(query)) ||
        (p.last_name && p.last_name.toLowerCase().includes(query))
      )
      setFilteredPatients(filtered)
    }
  }, [searchQuery, patients])

  useEffect(() => {
    loadPatients()
  }, [])

  const loadPatients = async () => {
    try {
      const [patientRes, userRes] = await Promise.all([
        getPatients(),
        getAllUsers()
      ])
      setPatients(patientRes.data)
      setUsers(userRes.data)
    } catch (err) {
      console.error('Failed to load patients:', err)
    } finally {
      setLoading(false)
    }
  }

  const getUserEmail = (userId: string | null) => {
    if (!userId) return null
    const user = users.find(u => u.id.toLowerCase() === userId.toLowerCase())
    return user?.email || null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setSuccessMsg('')
    try {
      await createPatientWithAccount({
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth,
        sex: formData.sex,
        email: formData.email,
        password: formData.password,
        blood_type: formData.blood_type || undefined,
        contact_number: formData.contact_number || undefined,
        address: formData.address || undefined,
      })
      setSuccessMsg(`Patient account created! Login: ${formData.email}`)
      setTimeout(() => {
        setShowModal(false)
        setFormData({ first_name: '', last_name: '', date_of_birth: '', sex: 'male', email: '', password: '', blood_type: '', contact_number: '', address: '' })
        setSuccessMsg('')
        loadPatients()
      }, 2000)
    } catch (err: any) {
      console.error('Failed to create patient:', err)
      const status = err.response?.status
      let errMsg = ''
      
      if (status === 409) {
        errMsg = err.response?.data || 'Email already registered. Please use a different email.'
      } else if (status === 500) {
        errMsg = 'Server error. Please try again later.'
      } else {
        errMsg = err.response?.data?.message || err.response?.data || 'Failed to create patient account'
      }
      alert(typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg)
} finally {
      setCreating(false)
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Directory"
        title="Patients"
        subtitle="Manage patient records and linked accounts"
        actions={
          <>
            {(user?.role === 'doctor' || user?.role === 'nurse') && (
              <button
                onClick={async () => {
                  const reason = prompt(
                    'Break-glass emergency access\n\nEvery read during the next 30 minutes will be logged as an elevated audit event and flagged on the admin dashboard. Proceed only in clinical emergencies.\n\nReason (≥8 characters):'
                  )
                  if (!reason || reason.trim().length < 8) return
                  try {
                    await activateBreakGlass(reason.trim())
                    alert('Break-glass activated for 30 minutes. All reads are elevated-logged.')
                  } catch (e: any) {
                    alert(e.response?.data || 'Failed to activate')
                  }
                }}
                className="px-4 py-2 bg-amber-500/10 border border-amber-400/30 text-amber-200 rounded-xl hover:bg-amber-500/20 text-sm"
                title="Emergency access — bypasses normal grant checks. Logged at high severity."
              >
                ⚡ Break-glass
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Patient
            </button>
          </>
        }
      />

      {/* Search Bar */}
      <div className="mb-4 fade-up" style={{ animationDelay: '80ms' }}>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-medical-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search patients by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md pl-10 pr-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-medical-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-medical-400">No patients yet</p>
          <button onClick={() => setShowModal(true)} className="mt-4 text-cyan-400 hover:text-cyan-300">Add your first patient</button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Name</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Account</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Date of Birth</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Sex</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Blood Type</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Contact</th>
                <th className="text-right text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-white/5">
              {filteredPatients.map((patient) => {
                const accountEmail = getUserEmail(patient.user_id)
                return (
                <tr key={patient.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-white font-medium">{patient.first_name} {patient.last_name}</span>
                  </td>
                  <td className="px-6 py-4">
                    {accountEmail ? (
                      <span className="px-2 py-1 bg-mint-500/10 border border-mint-500/20 rounded text-mint-400 text-sm">{accountEmail}</span>
                    ) : (
                      <span className="text-medical-500 text-sm">No account</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white">{patient.date_of_birth}</td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-medical-300">{patient.sex}</span>
                  </td>
                  <td className="px-6 py-4">
                    {patient.blood_type ? (
                      <span className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded text-rose-300 text-xs font-mono">{patient.blood_type}</span>
                    ) : (
                      <span className="text-medical-500 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-medical-300 text-sm">
                    {patient.contact_number || <span className="text-medical-500">—</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => navigate(`/records?patient=${patient.id}`)} className="text-cyan-400 hover:text-cyan-300 mr-4">View Records</button>
                    <button onClick={() => setEditingPatient(patient)} className="text-yellow-400 hover:text-yellow-300 mr-4">Edit</button>
                    <button onClick={() => setDeletingPatient(patient)} className="text-red-400 hover:text-red-300">Delete</button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Patient Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card w-full max-w-md p-6 mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Create Patient with Account</h2>
              <button onClick={() => setShowModal(false)} className="text-medical-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {successMsg && (
                <div className="p-4 bg-mint-500/10 border border-mint-500/20 rounded-xl text-mint-400">
                  {successMsg}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-medical-300 text-sm mb-2">First Name</label>
                  <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
                </div>
                <div>
                  <label className="block text-medical-300 text-sm mb-2">Last Name</label>
                  <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
                </div>
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Date of Birth</label>
                <input type="date" required value={formData.date_of_birth} onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Sex</label>
                <select value={formData.sex} onChange={(e) => setFormData({ ...formData, sex: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-medical-300 text-sm mb-2">Blood Type</label>
                  <select value={formData.blood_type} onChange={(e) => setFormData({ ...formData, blood_type: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800">
                    <option value="">Unknown</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-medical-300 text-sm mb-2">Contact Number</label>
                  <input type="tel" value={formData.contact_number} onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} placeholder="e.g. +63 912 345 6789" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
                </div>
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Address</label>
                <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} placeholder="Street, City, Postal Code" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 resize-none" />
              </div>
              <div className="border-t border-white/10 pt-4 mt-4">
                <h3 className="text-white font-medium mb-4">Patient Login Account</h3>
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Email Address</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Password</label>
                <input type="password" required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" placeholder="Min 8 characters" minLength={8} />
              </div>
              <button type="submit" disabled={creating} className="w-full bg-gradient-to-r from-cyan-500 to-mint-500 text-white py-3 rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Patient & Account'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {editingPatient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card w-full max-w-md p-6 mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Edit Patient</h2>
              <button onClick={() => setEditingPatient(null)} className="text-medical-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <EditPatientForm patient={editingPatient} onSave={async (data) => {
              await updatePatient(editingPatient.id, data)
              setEditingPatient(null)
              loadPatients()
            }} onCancel={() => setEditingPatient(null)} />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPatient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card w-full max-w-md p-6 mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Delete Patient</h2>
              <button onClick={() => setDeletingPatient(null)} className="text-medical-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-medical-300 mb-6">
              Are you sure you want to delete <span className="text-white font-medium">{deletingPatient.first_name} {deletingPatient.last_name}</span>? 
              This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setDeletingPatient(null)} className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all">
                Cancel
              </button>
              <button onClick={async () => {
                try {
                  await deletePatient(deletingPatient.id)
                  setDeletingPatient(null)
                  loadPatients()
                } catch (err: any) {
                  const body = err.response?.data
                  const msg = typeof body === 'string' ? body : (body?.message || err.message || 'Failed to delete patient')
                  alert(msg)
                }
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