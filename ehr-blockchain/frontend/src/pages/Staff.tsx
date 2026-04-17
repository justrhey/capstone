import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getAllUsers } from '../services/api'

interface StaffUser {
  id: string
  email: string
  role: string
  first_name: string
  last_name: string
  created_at: string
}

const STAFF_ROLES = ['doctor', 'nurse', 'auditor'] as const
type StaffRole = typeof STAFF_ROLES[number] | 'all'

const roleBadge: Record<string, string> = {
  doctor: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
  nurse: 'bg-mint-500/20 text-mint-300 border-mint-400/30',
  auditor: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
}

export default function Staff() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StaffRole>('all')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getAllUsers()
      const staffOnly = (res.data || []).filter((u: StaffUser) =>
        (STAFF_ROLES as readonly string[]).includes(u.role),
      )
      setUsers(staffOnly)
    } catch (err: any) {
      const body = err.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to load staff')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (filter !== 'all' && u.role !== filter) return false
      if (!q) return true
      return (
        u.email.toLowerCase().includes(q) ||
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q)
      )
    })
  }, [users, search, filter])

  const countBy = (role: StaffRole) =>
    role === 'all' ? users.length : users.filter((u) => u.role === role).length

  return (
    <Layout>
      <PageHeader
        section="Directory"
        title="Staff"
        subtitle="Doctors, nurses, and auditors with access to the system"
        actions={
          <button
            onClick={load}
            className="px-4 py-2 bg-white/5 border border-white/10 text-medical-300 rounded-xl hover:bg-white/10 transition-all text-sm"
          >
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 fade-up" style={{ animationDelay: '80ms' }}>
        {(['all', ...STAFF_ROLES] as StaffRole[]).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`glass-card p-4 text-left transition-all ${
              filter === r ? 'border-cyan-400/40 glow-cyan' : 'hover:border-white/20'
            }`}
          >
            <p className="text-medical-400 text-xs capitalize">{r === 'all' ? 'All Staff' : `${r}s`}</p>
            <p className="text-2xl font-bold text-white mt-1">{countBy(r)}</p>
          </button>
        ))}
      </div>

      <div className="glass-card p-4 mb-4 fade-up" style={{ animationDelay: '140ms' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
        />
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="glass-card overflow-hidden fade-up" style={{ animationDelay: '200ms' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-medical-400">
            {users.length === 0 ? 'No staff accounts yet.' : 'No staff match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr className="text-left text-medical-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="px-4 py-3 text-medical-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium border capitalize ${
                        roleBadge[u.role] || 'bg-white/5 text-medical-300 border-white/10'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-medical-400 font-mono text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}
