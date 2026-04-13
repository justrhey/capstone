import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

interface Permission {
  id: string
  granted_to: string
  record_id: string
  granted_at: string
  expires_at: string | null
  status: string
}

export default function Permissions() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async () => {
    setLoading(false)
    setPermissions([])
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Access Permissions</h1>
        <p className="text-medical-400 mt-1">Manage who can access your medical records</p>
      </div>

      <div className="glass-card p-6 mb-6">
        <h3 className="text-white font-medium mb-4">Grant Access</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-medical-300 text-sm mb-2">Email address to grant access</label>
            <input type="email" placeholder="doctor@hospital.com" className="w-full max-w-md px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50" />
          </div>
          <div>
            <label className="block text-medical-300 text-sm mb-2">Access duration</label>
            <select className="w-full max-w-md px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50">
              <option>1 week</option>
              <option>1 month</option>
              <option>3 months</option>
              <option>6 months</option>
              <option>1 year</option>
              <option>Permanent</option>
            </select>
          </div>
          <button className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium">
            Grant Access
          </button>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-white font-medium mb-4">Active Permissions</h3>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : permissions.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-medical-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l11-11a6 6 0 017.743 5.743L11 11V7a2 2 0 00-2-2h-2m-4 5.5v3a2 2 0 002 2h2.5" />
            </svg>
            <p className="text-medical-400">No active permissions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {permissions.map((perm) => (
              <div key={perm.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div>
                  <p className="text-white">{perm.granted_to}</p>
                  <p className="text-medical-500 text-sm">Granted: {new Date(perm.granted_at).toLocaleDateString()}</p>
                </div>
                <button className="text-red-400 hover:text-red-300 text-sm">Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}