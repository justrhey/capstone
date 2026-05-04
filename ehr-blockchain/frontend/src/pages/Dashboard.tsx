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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Records Trend</p>
                  </div>
                  <div className="aspect-[10/3] min-h-[200px]">
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
                          key={item.record?.id}
                          className="flex items-center justify-between p-1.5 bg-white/5 rounded-lg"
                        >
<div className="min-w-0 flex-1">
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
  const total = data.reduce((a, b) => a + b, 0)
  const peakIdx = data.indexOf(Math.max(...data))

  const W = 400
  const H = 120
  const PAD_L = 6
  const PAD_R = 26
  const PAD_T = 10
  const PAD_B = 16
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const points = data.map((v, i) => ({
    x: PAD_L + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD_T + (1 - v / max) * innerH,
    v,
  }))

  if (allZero || data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-7 h-7 rounded-full mb-1.5 flex items-center justify-center"
          style={{ background: 'rgba(148, 163, 184, 0.06)', border: '1px dashed rgba(148, 163, 184, 0.18)' }}>
          <span className="text-[10px]" style={{ color: 'rgba(148, 163, 184, 0.55)' }}>—</span>
        </div>
        <div className="text-[9px] tracking-[0.24em] uppercase font-semibold" style={{ color: 'rgba(148, 163, 184, 0.5)' }}>
          No activity
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: 'rgba(148, 163, 184, 0.35)' }}>
          Records will appear here as they accrue
        </div>
      </div>
    )
  }

  const linePath = points.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x} ${PAD_T + innerH} L${points[0].x} ${PAD_T + innerH} Z`
  const pathLen = points.reduce((acc, p, i) => {
    if (i === 0) return 0
    return acc + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y)
  }, 0) || 1

  const uid = `chart-${color.replace('#', '')}`
  const gridLines = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="relative h-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="55%" stopColor={color} stopOpacity="0.07" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.65" />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Hairline grid */}
        {gridLines.map((t, i) => {
          const y = PAD_T + t * innerH
          const isMid = t === 0.5
          return (
            <line
              key={i}
              x1={PAD_L}
              y1={y}
              x2={PAD_L + innerW}
              y2={y}
              stroke="rgba(148, 163, 184, 0.09)"
              strokeWidth="1"
              strokeDasharray={isMid ? '0' : '1 5'}
            />
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${uid}-area)`} opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.9s" begin="0.2s" fill="freeze" />
        </path>

        {/* Soft glow underline */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeOpacity="0.32"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${uid}-glow)`}
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen}
        >
          <animate attributeName="stroke-dashoffset" from={pathLen} to="0" dur="1.2s" begin="0s" fill="freeze" />
        </path>

        {/* Crisp line */}
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${uid}-line)`}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen}
        >
          <animate attributeName="stroke-dashoffset" from={pathLen} to="0" dur="1.2s" begin="0s" fill="freeze" />
        </path>

        {/* Hover guideline */}
        {hover !== null && points[hover] && (
          <>
            <line
              x1={points[hover].x}
              y1={PAD_T}
              x2={points[hover].x}
              y2={PAD_T + innerH}
              stroke={color}
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <line
              x1={PAD_L}
              y1={points[hover].y}
              x2={PAD_L + innerW}
              y2={points[hover].y}
              stroke={color}
              strokeOpacity="0.18"
              strokeWidth="1"
              strokeDasharray="1 4"
            />
          </>
        )}

        {/* Y-axis ticks (right side) */}
        <text
          x={W - 4}
          y={PAD_T + 2.5}
          fontSize="6"
          fill="rgba(148, 163, 184, 0.72)"
          textAnchor="end"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="0.06em"
        >
          {max}
        </text>
        <text
          x={W - 4}
          y={PAD_T + innerH * 0.5 + 2}
          fontSize="5.5"
          fill="rgba(148, 163, 184, 0.42)"
          textAnchor="end"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="0.06em"
        >
          {Math.round(max / 2)}
        </text>
        <text
          x={W - 4}
          y={PAD_T + innerH + 2}
          fontSize="5.5"
          fill="rgba(148, 163, 184, 0.42)"
          textAnchor="end"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="0.06em"
        >
          0
        </text>

        {/* Dots */}
        {points.map((p, i) => {
          const isPeak = i === peakIdx && p.v > 0
          const isActive = hover === i
          return (
            <g key={i} opacity="0">
              <animate attributeName="opacity" from="0" to="1" dur="0.32s" begin={`${0.85 + i * 0.06}s`} fill="freeze" />
              {isPeak && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6.5}
                  fill={color}
                  fillOpacity="0.12"
                  style={{
                    transformOrigin: `${p.x}px ${p.y}px`,
                    animation: 'none',
                  }}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? 5.5 : 3.5}
                fill={color}
                fillOpacity={isActive ? 0.28 : 0.16}
                style={{ transition: 'r 180ms ease, fill-opacity 180ms ease' }}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? 2.4 : 1.8}
                fill="#0f172a"
                stroke={color}
                strokeWidth={isActive ? 1.25 : 1}
                style={{ transition: 'r 180ms ease, stroke-width 180ms ease' }}
              />
            </g>
          )
        })}

        {/* X-axis labels */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={points[i]?.x ?? 0}
            y={H - 5}
            fontSize="6.5"
            fill={hover === i ? color : 'rgba(148, 163, 184, 0.55)'}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            letterSpacing="0.16em"
            style={{ transition: 'fill 160ms ease', textTransform: 'uppercase', fontWeight: hover === i ? 600 : 500 }}
          >
            {l}
          </text>
        ))}

        {/* Invisible hit-targets — last so they sit on top */}
        {points.map((p, i) => {
          const prevMid = i === 0 ? 0 : (points[i - 1].x + p.x) / 2
          const nextMid = i === points.length - 1 ? W : (p.x + points[i + 1].x) / 2
          return (
            <rect
              key={i}
              x={prevMid}
              y={0}
              width={nextMid - prevMid}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: 'crosshair' }}
            />
          )
        })}
      </svg>

      {/* Header overlay: total */}
      <div className="absolute top-0 left-0 flex items-baseline gap-1.5 pointer-events-none">
        <span className="text-[8px] tracking-[0.24em] uppercase font-semibold"
          style={{ color: 'rgba(148, 163, 184, 0.55)' }}>
          6mo Σ
        </span>
        <span className="text-[11px] font-semibold tabular-nums leading-none" style={{ color }}>
          {total.toLocaleString()}
        </span>
        {peakIdx >= 0 && data[peakIdx] > 0 && (
          <span className="text-[7.5px] tracking-[0.2em] uppercase font-medium ml-1.5"
            style={{ color: 'rgba(148, 163, 184, 0.4)' }}>
            peak · {labels[peakIdx]}
          </span>
        )}
      </div>

      {/* Tooltip */}
      {hover !== null && points[hover] && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${(points[hover].x / W) * 100}%`,
            top: `${(points[hover].y / H) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 14px))',
            transition: 'left 140ms ease, top 140ms ease',
          }}
        >
          <div
            className="px-2 py-1 rounded-[5px] whitespace-nowrap relative"
            style={{
              background: 'rgba(15, 23, 42, 0.94)',
              border: `1px solid ${color}55`,
              backdropFilter: 'blur(6px)',
              boxShadow: `0 6px 18px rgba(0, 0, 0, 0.45), 0 0 0 1px ${color}1a, inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div className="text-[7px] tracking-[0.22em] uppercase font-semibold leading-none"
              style={{ color: 'rgba(148, 163, 184, 0.65)' }}>
              {labels[hover]}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <div className="text-[11px] font-semibold leading-none tabular-nums" style={{ color: '#fff' }}>
                {points[hover].v.toLocaleString()}
              </div>
              <div className="text-[7px] tracking-[0.16em] uppercase leading-none"
                style={{ color: 'rgba(148, 163, 184, 0.5)' }}>
                rec
              </div>
            </div>
            {/* Tooltip arrow */}
            <div
              className="absolute left-1/2 -translate-x-1/2 w-1 h-1 rotate-45"
              style={{
                bottom: '-2px',
                background: 'rgba(15, 23, 42, 0.94)',
                borderRight: `1px solid ${color}55`,
                borderBottom: `1px solid ${color}55`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}