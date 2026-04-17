import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  getPermissions,
  getStaff,
  getMyPatient,
  grantPermission,
  revokePermission,
} from '../services/api'

interface Permission {
  id: string
  patient_id: string
  granted_to: string
  record_id: string | null
  permission_type: string
  granted_at: string
  expires_at: string | null
  status: string
}

interface Staff {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
}

const DURATION_OPTIONS = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: 'Permanent', days: 0 },
] as const

export default function Permissions() {
  useAuth()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [myPatientId, setMyPatientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [email, setEmail] = useState('')
  const [permissionType, setPermissionType] = useState<'read' | 'write'>('read')
  const [durationDays, setDurationDays] = useState<number>(30)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [permsRes, staffRes, myPatientRes] = await Promise.all([
        getPermissions(),
        getStaff(),
        getMyPatient(),
      ])
      setPermissions(permsRes.data || [])
      setStaff(staffRes.data || [])
      const own = (myPatientRes.data || [])[0]
      setMyPatientId(own?.id || null)
    } catch (err: any) {
      const body = err.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!myPatientId) {
      setError('No patient profile linked to your account.')
      return
    }
    const target = staff.find((s) => s.email.toLowerCase() === email.trim().toLowerCase())
    if (!target) {
      setError('No staff user found with that email.')
      return
    }

    const expires_at =
      durationDays > 0
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined

    setSubmitting(true)
    try {
      await grantPermission({
        patient_id: myPatientId,
        granted_to: target.id,
        permission_type: permissionType,
        expires_at,
      })
      setSuccess(`Granted ${permissionType} access to ${target.first_name} ${target.last_name}`)
      setEmail('')
      await load()
    } catch (err: any) {
      const body = err.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to grant access')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setError('')
    setSuccess('')
    try {
      await revokePermission(id)
      setSuccess('Permission revoked')
      await load()
    } catch (err: any) {
      const body = err.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to revoke permission')
    }
  }

  const staffById = (id: string) => staff.find((s) => s.id === id)

  return (
    <Layout>
      <PageHeader
        section="Access Control"
        title="Access Permissions"
        subtitle="Manage who can read or write your medical records"
      />

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-mint-500/10 border border-mint-500/20 rounded-xl text-mint-400 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleGrant} className="glass-card p-6 mb-6 fade-up" style={{ animationDelay: '80ms' }}>
        <h3 className="text-white font-medium mb-4">Grant Access</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-medical-300 text-sm mb-2">Staff email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@hospital.com"
              className="w-full max-w-md px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-medical-300 text-sm mb-2">Access type</label>
              <select
                value={permissionType}
                onChange={(e) => setPermissionType(e.target.value as 'read' | 'write')}
                className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
              >
                <option value="read">Read</option>
                <option value="write">Write</option>
              </select>
            </div>
            <div>
              <label className="block text-medical-300 text-sm mb-2">Duration</label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.label} value={d.days}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || !myPatientId}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
          >
            {submitting ? 'Granting...' : 'Grant Access'}
          </button>
        </div>
      </form>

      <div className="glass-card p-6 fade-up" style={{ animationDelay: '140ms' }}>
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
            {permissions.map((perm) => {
              const target = staffById(perm.granted_to)
              return (
                <div key={perm.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <div>
                    <p className="text-white">
                      {target ? `${target.first_name} ${target.last_name}` : perm.granted_to.slice(0, 8) + '…'}
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 capitalize">
                        {perm.permission_type}
                      </span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-lg capitalize ${
                        perm.status === 'active'
                          ? 'bg-mint-500/10 text-mint-400 border border-mint-500/20'
                          : 'bg-medical-500/10 text-medical-400 border border-medical-500/20'
                      }`}>
                        {perm.status}
                      </span>
                    </p>
                    <p className="text-medical-500 text-sm">
                      {target?.email && <span>{target.email} · </span>}
                      Granted {new Date(perm.granted_at).toLocaleDateString()}
                      {perm.expires_at && ` · Expires ${new Date(perm.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  {perm.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(perm.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
