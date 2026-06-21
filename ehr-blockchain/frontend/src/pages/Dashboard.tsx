import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getPatients, getAllRecords, getAllUsers, getPermissions, getMyRecords } from '../services/api'
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
      
      // For patients: show their own records
      if (user?.role === 'patient') {
        try {
          // Fetch records and permissions directly - no need to wait for patient profile
          const [myRecordsRes, myPermissionsRes] = await Promise.all([
            getMyRecords().catch(() => ({ data: [] })),
            getPermissions().catch(() => ({ data: [] }))
          ])
          
          const records = myRecordsRes.data || []
          const permissions = myPermissionsRes.data || []
          
          const grantedDoctors = permissions.filter((p: any) => 
            p.granted_to_user_id && p.status === 'active'
          ).length
          
          setStats({
            totalPatients: 1,
            totalRecords: records.length,
            totalUsers: grantedDoctors,
            blockchainTxs: records.filter((r: any) => r.blockchain_tx_id || r.record?.blockchain_tx_id).length,
          })
          
          setRecentRecords(records.slice(0, 5).map((r: any) => ({
            record: r.record || r,
            patientName: 'Your Record',
          })))
        } catch (err) {
          console.error('Patient dashboard error:', err)
          setStats({ totalPatients: 0, totalRecords: 0, totalUsers: 0, blockchainTxs: 0 })
          setRecentRecords([])
        }
        
        setLoading(false)
        return
      }
      
      // For staff: show general stats
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
    { label: 'Messages', path: '/messages', roles: ['patient'] },
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
                label={user?.role === 'patient' ? 'My Records' : 'Total Records'}
                value={stats.totalRecords}
                hint={user?.role === 'patient' ? `${stats.totalPatients} profile visits` : `${stats.totalPatients} patients`}
                big
              />
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] text-medical-500 uppercase tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-pulse" />
                Live
              </div>
            </div>

            {/* Staff see general stats - Patients see their own */}
            {user?.role === 'patient' ? (
              <>
                <Card label="Doctors" value={stats.totalUsers} style={{ animationDelay: '120ms' }} />
                <Card label="Verified" value={stats.totalRecords > 0 ? Math.round((stats.blockchainTxs / stats.totalRecords) * 100) + '%' : '0%'} style={{ animationDelay: '150ms' }} />
                <Card label="On Chain" value={stats.blockchainTxs} style={{ animationDelay: '180ms' }} />
              </>
            ) : (
              <>
                <Card label="Patients" value={stats.totalPatients} style={{ animationDelay: '120ms' }} />
                <Card label="Records" value={stats.totalRecords} style={{ animationDelay: '150ms' }} />
                <Card label="Users" value={stats.totalUsers} style={{ animationDelay: '180ms' }} />
                <Card label="TX" value={stats.blockchainTxs} style={{ animationDelay: '210ms' }} />
                <Card label="Verified" value={stats.totalRecords > 0 ? Math.round((stats.blockchainTxs / stats.totalRecords) * 100) + '%' : '0%'} style={{ animationDelay: '230ms' }} />
                <Card label="Active" value={stats.totalUsers} style={{ animationDelay: '250ms' }} />
              </>
            )}
          </div>

{/* Chart + Recent - different for patients vs staff */}
          <div className="grid grid-cols-12 gap-3 mb-6">
            {/* Staff: show records trend - Patients: show their records */}
            {user?.role === 'patient' ? (
              <>
                {/* Patient recent records - full width */}
                <div className="col-span-12 glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-400 font-semibold">My Medical Records</p>
                    <button onClick={() => navigate('/my-records')} className="text-cyan-400 text-[10px] hover:text-cyan-300">
                      View all →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {recentRecords.length === 0 ? (
                      <p className="text-slate-400 text-sm text-center py-4">No medical records yet.</p>
                    ) : (
                      recentRecords.map((item) => (
                        <div 
                          key={item.record?.id}
                          className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-medium truncate">{(item.record as any)?.subjective || (item.record as any)?.objective || (item.record as any)?.assessment || 'Medical record'}</p>
                            <p className="text-slate-400 text-xs mt-1">{(item.record as any)?.created_at ? new Date((item.record as any).created_at).toLocaleDateString() : ''}</p>
                          </div>
                          {item.record?.blockchain_tx_id && (
                            <span className="px-2 py-1 bg-mint-500/20 text-mint-400 text-xs font-semibold rounded-lg">✓ Verified</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Staff: show records trend */}
                <div className="lg:col-span-9 glass-card p-4">
                  <div className="aspect-[5/1] min-h-[90px]">
                    <TinyChart data={monthlyData.map(d => d.records)} labels={monthlyData.map(d => d.month)} color="#22d3ee" />
                  </div>
                </div>

                {/* Recent - 3 cols */}
                <div className="lg:col-span-3 glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-lg uppercase tracking-wider font-bold">Recent</p>
                    <button onClick={() => navigate('/records')} className="text-cyan-400 text-xs hover:text-cyan-300">
                      all →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {recentRecords.length === 0 ? (
                      <p className="text-medical-500 text-xs text-center py-2">No records</p>
                    ) : (
recentRecords.map((item) => (
                        <div 
                          key={item.record?.id}
                          className="flex items-center justify-between p-1.5 bg-white/5 rounded-lg"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-cyan-400 text-xs font-medium truncate">
                              {(item as any)?.patient_name || (item as any)?.patientName || 'Unknown Patient'}
                            </p>
                            <p className="text-white text-xs truncate">{(item.record as any)?.subjective || (item.record as any)?.objective || (item.record as any)?.assessment || 'Record'}</p>
                            <p className="text-medical-500 text-[9px]">{(item.record as any)?.created_at ? new Date((item.record as any).created_at).toLocaleDateString() : ''}</p>
                          </div>
                          {item.record?.blockchain_tx_id && (
                            <span className="px-1 py-0.5 bg-mint-500/20 text-mint-400 text-[9px] rounded">✓</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
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
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(...data, 1)
  const allZero = data.every((v) => v === 0)

  const W = 400, H = 100
  const PAD = { l: 8, r: 8, t: 12, b: 22 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const pts = data.map((v, i) => ({
    x: PAD.l + (i / Math.max(data.length - 1, 1)) * iW,
    y: PAD.t + (1 - v / max) * iH,
    v,
  }))

  if (allZero || data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1.5">
        <div className="text-[11px]" style={{ color: 'rgba(148,163,184,0.4)' }}>——</div>
        <div className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>No data yet</div>
      </div>
    )
  }

  // Catmull-Rom → smooth cubic bezier through every point
  function smoothPath(pts: {x:number; y:number}[]) {
    if (pts.length < 2) return ''
    let d = `M${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }
    return d
  }

  const line = smoothPath(pts)
  const area = `${line} L${pts[pts.length - 1].x} ${PAD.t + iH} L${pts[0].x} ${PAD.t + iH} Z`
  const uid = color.replace('#', '')

  return (
    <div className="relative h-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
        <defs>
          <pattern id={`grid-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148,163,184,0.06)" strokeWidth="0.5" />
          </pattern>
          <pattern id={`dot-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.6" fill="rgba(148,163,184,0.08)" />
          </pattern>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Square grid background */}
        <rect width={W} height={H} fill={`url(#grid-${uid})`} />
        <rect width={W} height={H} fill={`url(#dot-${uid})`} />

        {/* Smooth area fill */}
        <path d={area} fill={`url(#g-${uid})`} />

        {/* Smooth curve line — no sharp edges */}
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />

        {/* Subtle dots on hover only */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 4 : 0} fill={color}
            style={{ transition: 'r 150ms ease', opacity: hover === i ? 1 : 0 }} />
        ))}

        {/* X labels */}
        {labels.map((l, i) => (
          <text key={i} x={pts[i]?.x ?? 0} y={H - 4} fontSize="7"
            fill="rgba(148,163,184,0.45)" textAnchor="middle"
            fontFamily="ui-monospace, monospace">{l}</text>
        ))}

        {/* Hit targets */}
        {pts.map((p, i) => {
          const a = i === 0 ? 0 : (pts[i - 1].x + p.x) / 2
          const b = i === pts.length - 1 ? W : (p.x + (pts[i + 1]?.x ?? W)) / 2
          return <rect key={i} x={a} y={0} width={b - a} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} style={{ cursor: 'crosshair' }} />
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && pts[hover] && (
        <div className="absolute pointer-events-none"
          style={{
            left: `${(pts[hover].x / W) * 100}%`,
            top: `${(pts[hover].y / H) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 10px))',
            transition: 'left 120ms ease, top 120ms ease',
          }}>
          <div className="px-3 py-2 rounded-lg whitespace-nowrap"
            style={{
              background: '#0f172a',
              border: '1px solid rgba(148,163,184,0.1)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            }}>
            <div className="text-[10px] font-medium leading-none" style={{ color }}>{labels[hover]}</div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-[15px] font-semibold tabular-nums leading-none text-white">{pts[hover].v}</span>
              <span className="text-[7px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.45)' }}>records</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}