import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatients, createPatientWithAccount, getAllUsers } from '../services/api'
import Layout from '../components/Layout'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string
  sex: string
  created_at: string
  user_id: string | null
}

interface User {
  id: string
  email: string
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState({ first_name: '', last_name: '', date_of_birth: '', sex: 'male', email: '', password: '' })
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
        password: formData.password
      })
      setSuccessMsg(`Patient account created! Login: ${formData.email}`)
      setTimeout(() => {
        setShowModal(false)
        setFormData({ first_name: '', last_name: '', date_of_birth: '', sex: 'male', email: '', password: '' })
        setSuccessMsg('')
        loadPatients()
      }, 2000)
    } catch (err: any) {
      console.error('Failed to create patient:', err)
      alert(err.response?.data?.message || 'Failed to create patient account')
} finally {
      setCreating(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Patients</h1>
          <p className="text-medical-400 mt-1">Manage patient records</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Patient
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
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
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Created</th>
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
                  <td className="px-6 py-4 text-medical-400 text-sm">
                    {new Date(patient.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => navigate(`/records?patient=${patient.id}`)} className="text-cyan-400 hover:text-cyan-300 mr-4">View Records</button>
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
              <div className="border-t border-white/10 pt-4 mt-4">
                <h3 className="text-white font-medium mb-4">Patient Login Account</h3>
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Email Address</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
              </div>
              <div>
                <label className="block text-medical-300 text-sm mb-2">Password</label>
                <input type="password" required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" placeholder="Min 6 characters" />
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
    </Layout>
  )
}