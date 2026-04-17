import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getAuditLogs } from '../services/api'

interface AuditLog {
  id: string
  user_id: string
  action: string
  resource_type: string | null
  resource_id: string | null
  ip_address: string | null
  created_at: string
}

const actionCategory = (action: string): 'create' | 'read' | 'update' | 'delete' | 'other' => {
  if (action.includes('created')) return 'create'
  if (action.includes('updated')) return 'update'
  if (action.includes('deleted') || action.includes('revoked')) return 'delete'
  if (action.includes('viewed') || action.includes('accessed') || action.includes('read')) return 'read'
  return 'other'
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'create' | 'read' | 'update' | 'delete'>('all')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getAuditLogs()
      setLogs(res.data || [])
    } catch (err: any) {
      const body = err.response?.data
      setError(typeof body === 'string' ? body : body?.message || 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter((l) => actionCategory(l.action) === filter)
  }, [logs, filter])

  const getActionColor = (action: string) => {
    switch (actionCategory(action)) {
      case 'create':
        return 'bg-mint-500/10 text-mint-400 border-mint-500/20'
      case 'read':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
      case 'update':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
      case 'delete':
        return 'bg-red-500/10 text-red-400 border-red-500/20'
      default:
        return 'bg-medical-500/10 text-medical-400 border-medical-500/20'
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Compliance"
        title="Audit Logs"
        subtitle="Every mutation is recorded with user, resource, and source IP"
        actions={
          <>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
            >
              <option value="all">All Actions</option>
              <option value="create">Created</option>
              <option value="read">Viewed</option>
              <option value="update">Updated</option>
              <option value="delete">Deleted</option>
            </select>
            <button
              onClick={load}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-sm hover:bg-white/10"
            >
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm fade-up">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-medical-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM7 21h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
          </svg>
          <p className="text-medical-400">
            {logs.length === 0 ? 'No audit logs yet' : 'No logs match this filter'}
          </p>
          <p className="text-medical-500 text-sm mt-1">Actions will appear here when records are accessed</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden fade-up" style={{ animationDelay: '80ms' }}>
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Timestamp</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">User</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Action</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Resource</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-medical-300 text-sm">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-cyan-300 font-mono text-sm">{log.user_id.slice(0, 8)}…</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-xs border ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-medical-300 text-sm">
                    {log.resource_type ? (
                      <span>
                        {log.resource_type}
                        {log.resource_id && (
                          <span className="text-medical-500 font-mono text-xs ml-2">
                            {log.resource_id.slice(0, 8)}…
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-medical-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-medical-400 font-mono text-xs">
                    {log.ip_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
