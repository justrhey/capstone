import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getPatients, getAllRecords, getAllUsers } from '../services/api'
import Layout from '../components/Layout'

interface Stats {
  totalPatients: number
  totalRecords: number
  totalUsers: number
  blockchainTxs: number
}

interface MonthlyData {
  month: string
  patients: number
  records: number
}

interface RecentRecord {
  record: { id: string; diagnosis: string; created_at: string; patient_id?: string; blockchain_tx_id?: string | null }
  patientName: string
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    totalRecords: 0,
    totalUsers: 0,
    blockchainTxs: 0,
  })
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [user?.role])

  const loadData = async () => {
    try {
      setLoading(true)
      const [patientsRes, recordsRes, usersRes] = await Promise.all([
        getPatients(),
        getAllRecords(),
        getAllUsers(),
      ])

      const patients = patientsRes.data || []
      const records = recordsRes.data || []
      const users = usersRes.data || []
      const blockchainTxs = records.filter((r: any) => r.blockchain_tx_id).length

      const now = new Date()
      const months: MonthlyData[] = []
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)
        
        months.push({
          month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          patients: patients.filter((p: any) => {
            const d = new Date(p.created_at)
            return d >= monthStart && d <= monthEnd
          }).length,
          records: records.filter((r: any) => {
            const d = new Date(r.record?.created_at)
            return d >= monthStart && d <= monthEnd
          }).length,
        })
      }

      const recent = records.slice(0, 5).map((r: any) => ({
        record: r.record,
        patientName: r.patientName || 'Unknown',
      }))

      setStats({
        totalPatients: patients.length,
        totalRecords: records.length,
        totalUsers: users.length,
        blockchainTxs,
      })
      setMonthlyData(months)
      setRecentRecords(recent)
    } catch (err) {
      console.error('Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    { label: 'Patients', path: '/patients', roles: ['admin', 'doctor', 'nurse'] },
    { label: 'Records', path: '/records', roles: ['admin', 'doctor', 'nurse'] },
    { label: 'Create Staff', path: '/create-staff', roles: ['admin'] },
    { label: 'Audit Logs', path: '/audit', roles: ['admin', 'auditor'] },
    { label: 'My Records', path: '/my-records', roles: ['patient'] },
    { label: 'Permissions', path: '/permissions', roles: ['patient'] },
  ].filter(a => a.roles.includes(user?.role || ''))

  const roleTitle = {
    admin: 'Administrator',
    doctor: 'Doctor',
    nurse: 'Nurse',
    auditor: 'Auditor',
    patient: 'Patient',
  }[user?.role || ''] || 'User'

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-medical-500 text-xs uppercase tracking-widest">
              {user?.role}
            </p>
            <h1 className="text-3xl font-bold text-white mt-1">
              {user?.first_name} {user?.last_name}
            </h1>
            <p className="text-medical-400 text-sm mt-1.5">{roleTitle} dashboard</p>
          </div>
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((a) => (
                <button
                  key={a.path}
                  onClick={() => navigate(a.path)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-medical-200 text-sm hover:bg-white/10 hover:border-cyan-400/30 transition-colors"
                >
                  {a.label}
                  <span className="ml-2 text-cyan-400">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Bento grid - symmetrical 12 cols */}
          <div className="grid grid-cols-12 gap-3 mb-6">
            {/* Hero - 3 cols, spans 2 rows */}
            <div className="bento-hero glass-card p-4 col-span-12 lg:col-span-3 lg:row-span-2 fade-up" style={{ animationDelay: '60ms' }}>
              <KPI
                label="Total Records"
                value={stats.totalRecords}
                hint={`${stats.totalPatients} patients`}
                big
              />
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] text-medical-500 uppercase tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-pulse" />
                Live
              </div>
            </div>

            {/* 3 cards - 3 cols each = 9 cols = perfect symmetry */}
            <Card label="Patients" value={stats.totalPatients} style={{ animationDelay: '120ms' }} />
            <Card label="Records" value={stats.totalRecords} style={{ animationDelay: '150ms' }} />
            <Card label="Users" value={stats.totalUsers} style={{ animationDelay: '180ms' }} />
            <Card label="TX" value={stats.blockchainTxs} style={{ animationDelay: '210ms' }} />
            <Card label="Verified" value={stats.totalRecords > 0 ? Math.round((stats.blockchainTxs / stats.totalRecords) * 100) + '%' : '0%'} style={{ animationDelay: '230ms' }} />
            <Card label="Active" value={stats.totalUsers} style={{ animationDelay: '250ms' }} />
          </div>

{/* Chart + Recent - symmetrical */}
          <div className="grid grid-cols-12 gap-3 mb-6">
            {/* Chart - 9 cols */}
            <div className="lg:col-span-9 glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Records Trend</p>
              </div>
              <div className="h-28">
                <TinyChart data={monthlyData.map(d => d.records)} labels={monthlyData.map(d => d.month)} color="#22d3ee" />
              </div>
            </div>

            {/* Recent - 3 cols */}
            <div className="lg:col-span-3 glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Recent</p>
                <button onClick={() => navigate('/records')} className="text-cyan-400 text-[10px] hover:text-cyan-300">
                  all →
                </button>
              </div>
              <div className="space-y-1.5">
                {recentRecords.length === 0 ? (
                  <p className="text-medical-500 text-xs text-center py-2">No records</p>
                ) : (
                  recentRecords.map((item) => (
                    <div 
                      key={item.record.id}
                      className="flex items-center justify-between p-1.5 bg-white/5 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-xs truncate">{item.record.diagnosis || 'No diagnosis'}</p>
                        <p className="text-medical-500 text-[9px]">{new Date(item.record.created_at).toLocaleDateString()}</p>
                      </div>
                      {item.record.blockchain_tx_id && (
                        <span className="px-1 py-0.5 bg-mint-500/20 text-mint-400 text-[9px] rounded">✓</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-mint-400" />
              <span className="text-medical-500">Database</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-mint-400" />
              <span className="text-medical-500">Blockchain</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-medical-500">Role:</span>
              <span className="text-cyan-400 capitalize">{user?.role}</span>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}

function Card({ label, value, style }: { 
  label: string
  value: string | number
  style?: React.CSSProperties
}) {
  return (
    <div className="col-span-6 lg:col-span-3 glass-card p-5 fade-up" style={style}>
      <p className="text-medical-500 text-xs uppercase tracking-[0.18em]">{label}</p>
      <p className="text-white text-3xl font-semibold mt-2">{value}</p>
    </div>
  )
}

function KPI({ label, value, hint, big = false }: {
  label: string
  value: string | number
  hint?: string
  big?: boolean
}) {
  return (
    <div className="flex items-start justify-between h-full">
      <div className="flex-1 min-w-0">
        <p className="text-medical-500 text-[11px] uppercase tracking-[0.18em]">{label}</p>
        <p className={`text-white font-semibold leading-none ${big ? 'text-5xl mt-4' : 'text-3xl mt-2'}`}>
          {value}
        </p>
        {hint && <p className="text-medical-400 text-xs mt-3">{hint}</p>}
      </div>
    </div>
  )
}

function TinyChart({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
  const max = Math.max(...data, 1)
  const height = 120
  const width = 400
  const padding = 10

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1 || 1)) * (width - padding * 2),
    y: height - padding - (v / max) * (height - padding * 2)
  }))

  const linePath = points.map((p, i) => i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />)}
      {labels.map((l, i) => <text key={i} x={points[i]?.x || 0} y={height-2} fontSize="9" fill="#64748b" textAnchor="middle">{l}</text>)}
    </svg>
  )
}