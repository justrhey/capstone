import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

interface AuditLog {
  id: string
  user_id: string
  action: string
  target_record_id: string | null
  details: string | null
  blockchain_tx_id: string | null
  created_at: string
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadLogs()
  }, [filter])

  const loadLogs = async () => {
    try {
      // Placeholder - would call API
      setLogs([])
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
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
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-medical-400 mt-1">Track all access and modifications</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
          >
            <option value="all">All Actions</option>
            <option value="create">Created</option>
            <option value="read">Viewed</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-medical-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM7 21h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
          </svg>
          <p className="text-medical-400">No audit logs yet</p>
          <p className="text-medical-500 text-sm mt-1">Actions will appear here when records are accessed</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Timestamp</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">User</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Action</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Details</th>
                <th className="text-left text-medical-400 text-xs font-medium uppercase tracking-wider px-6 py-4">TX Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-medical-300 text-sm">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-cyan-300 font-mono text-sm">{log.user_id.slice(0, 8)}...</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-xs border ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-medical-300 text-sm">
                    {log.details || '-'}
                  </td>
                  <td className="px-6 py-4">
                    {log.blockchain_tx_id ? (
                      <span className="text-medical-400 font-mono text-xs">{log.blockchain_tx_id.slice(0, 12)}...</span>
                    ) : (
                      <span className="text-medical-500">-</span>
                    )}
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