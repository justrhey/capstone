import { useState, useEffect, type ReactNode, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getPatients,
  getMyPatient,
  getAllRecords,
  getAllUsers,
  getRecordsByPatient,
  getAuditLogs,
  getPermissions,
  listTamperedRecords,
  listIncidents,
  resolveIncident,
  listActiveBreakGlass,
} from '../services/api'
import Layout from '../components/Layout'

interface AuditLog {
  id: string
  user_id: string
  action: string
  resource_type: string | null
  resource_id: string | null
  ip_address: string | null
  created_at: string
}

interface Incident {
  id: string
  kind: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  user_id: string | null
  ip_address: string | null
  details: string | null
  created_at: string
  resolved_at: string | null
}

const CONTRACTS = [
  {
    label: 'Record Registry',
    purpose: 'SHA-256 hashes',
    id: 'CCL5QJQHIY2WP637HMJQ5NGIHDFK7ET2FPSDZAPPNDQSUC63HO23VNDD',
  },
  {
    label: 'Access Manager',
    purpose: 'Time-bound grants',
    id: 'CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2',
  },
  {
    label: 'Audit Trail',
    purpose: 'Access events',
    id: 'CAIXRA5QQTJOF5HFMBLZA3BXFKMTIM7JVJBKYPLKDO2HJOMSSPGLOMKN',
  },
] as const

const ICONS = {
  users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
  patients: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />,
  records: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  key: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />,
  pulse: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  audit: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />,
  shield: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  profile: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
} as const

type IconKey = keyof typeof ICONS

function Icon({ name, className = 'w-5 h-5' }: { name: IconKey; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {ICONS[name]}
    </svg>
  )
}

function roleTagline(role?: string) {
  switch (role) {
    case 'admin':
      return 'System administration overview'
    case 'doctor':
      return 'Patients & records at a glance'
    case 'nurse':
      return 'Assigned patients & records'
    case 'auditor':
      return 'Access trail & compliance'
    case 'patient':
      return 'Your records, access, and blockchain trust'
    default:
      return 'Dashboard overview'
  }
}

function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={style}
      className={`glass-card p-5 hover:border-cyan-400/30 transition-colors ${className}`}
    >
      {children}
    </div>
  )
}

function KPI({
  label,
  value,
  icon,
  accent = 'cyan',
  big = false,
  hint,
}: {
  label: string
  value: string | number
  icon: IconKey
  accent?: 'cyan' | 'mint' | 'rose' | 'amber'
  big?: boolean
  hint?: string
}) {
  const accentMap: Record<string, string> = {
    cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20',
    mint: 'text-mint-300 bg-mint-500/10 border-mint-400/20',
    rose: 'text-rose-300 bg-rose-500/10 border-rose-400/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-400/20',
  }
  return (
    <div className="flex items-start justify-between h-full">
      <div className="flex-1 min-w-0">
        <p className="text-medical-500 text-[11px] uppercase tracking-[0.18em]">{label}</p>
        <p className={`text-white font-semibold leading-none ${big ? 'text-5xl mt-4' : 'text-3xl mt-2'}`}>
          {value}
        </p>
        {hint && <p className="text-medical-400 text-xs mt-3">{hint}</p>}
      </div>
      <div className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${accentMap[accent]}`}>
        <Icon name={icon} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState({
    totalPatients: 0,
    totalRecords: 0,
    totalUsers: 0,
    activePermissions: 0,
    auditCount: 0,
    tamperedCount: 0,
    chainUnreachable: false,
  })
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [breakGlassActive, setBreakGlassActive] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadStats()
  }, [user?.role])

  const loadStats = async () => {
    try {
      if (user?.role === 'admin' || user?.role === 'doctor' || user?.role === 'nurse') {
        const [patientsRes, recordsRes, usersRes, auditRes, tamperRes, incidentsRes] = await Promise.all([
          getPatients(),
          getAllRecords(),
          getAllUsers().catch(() => ({ data: [] })),
          getAuditLogs().catch(() => ({ data: [] })),
          (user?.role === 'admin' ? listTamperedRecords() : Promise.resolve({ data: { count: 0, chain_unreachable: false } })).catch(() => ({ data: { count: 0, chain_unreachable: false } })),
          (user?.role === 'admin' ? listIncidents(true) : Promise.resolve({ data: { incidents: [], unresolved_count: 0 } })).catch(() => ({ data: { incidents: [], unresolved_count: 0 } })),
        ])
        setStats({
          totalPatients: patientsRes.data?.length || 0,
          totalRecords: recordsRes.data?.length || 0,
          totalUsers: usersRes.data?.length || 0,
          activePermissions: 0,
          auditCount: auditRes.data?.length || 0,
          tamperedCount: tamperRes.data?.count || 0,
          chainUnreachable: !!tamperRes.data?.chain_unreachable,
        })
        setRecentActivity((auditRes.data || []).slice(0, 8))
        setIncidents(incidentsRes.data?.incidents || [])
        try {
          const bgRes = await listActiveBreakGlass()
          setBreakGlassActive(bgRes.data?.active_count || 0)
        } catch { /* non-admin auditor case */ }
      } else if (user?.role === 'auditor') {
        const [auditRes, tamperRes, incidentsRes] = await Promise.all([
          getAuditLogs().catch(() => ({ data: [] })),
          listTamperedRecords().catch(() => ({ data: { count: 0, chain_unreachable: false } })),
          listIncidents(true).catch(() => ({ data: { incidents: [], unresolved_count: 0 } })),
        ])
        setStats(prev => ({
          ...prev,
          auditCount: auditRes.data?.length || 0,
          tamperedCount: tamperRes.data?.count || 0,
          chainUnreachable: !!tamperRes.data?.chain_unreachable,
        }))
        setRecentActivity((auditRes.data || []).slice(0, 8))
        setIncidents(incidentsRes.data?.incidents || [])
        try {
          const bgRes = await listActiveBreakGlass()
          setBreakGlassActive(bgRes.data?.active_count || 0)
        } catch { /* non-admin auditor case */ }
      } else if (user?.role === 'patient') {
        const [myPatientRes, permsRes] = await Promise.all([
          getMyPatient(),
          getPermissions().catch(() => ({ data: [] })),
        ])
        const myPatients = myPatientRes.data || []

        let myRecordsCount = 0
        for (const patient of myPatients) {
          const recordRes = await getRecordsByPatient(patient.id)
          myRecordsCount += recordRes.data?.length || 0
        }

        const activePermissions = (permsRes.data || []).filter((p: any) => p.status === 'active').length

        setStats({
          totalPatients: myPatients.length,
          totalRecords: myRecordsCount,
          totalUsers: 0,
          activePermissions,
          auditCount: 0,
          tamperedCount: 0,
          chainUnreachable: false,
        })
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoading(false)
    }
  }

  // Quick-action chips per role
  const quickActions: Array<{ label: string; path: string }> =
    user?.role === 'admin'
      ? [
          { label: 'Create staff', path: '/create-staff' },
          { label: 'Patients', path: '/patients' },
          { label: 'Audit logs', path: '/audit' },
        ]
      : user?.role === 'doctor' || user?.role === 'nurse'
        ? [
            { label: 'Patients', path: '/patients' },
            { label: 'Records', path: '/records' },
          ]
        : user?.role === 'auditor'
          ? [{ label: 'Audit logs', path: '/audit' }]
          : user?.role === 'patient'
            ? [
                { label: 'My records', path: '/my-records' },
                { label: 'Permissions', path: '/permissions' },
              ]
            : []

  // Role-specific bento: [hero, two secondary, optional tertiary]
  type Bento = {
    hero: { label: string; value: string | number; icon: IconKey; accent: 'cyan' | 'mint' | 'rose' | 'amber'; hint?: string }
    secondary: Array<{ label: string; value: string | number; icon: IconKey; accent: 'cyan' | 'mint' | 'rose' | 'amber' }>
  }

  const bento: Bento =
    user?.role === 'admin'
      ? {
          hero: { label: 'Total Users', value: stats.totalUsers, icon: 'users', accent: 'cyan', hint: `${stats.totalPatients} patients · ${stats.totalRecords} records` },
          secondary: [
            { label: 'Patients', value: stats.totalPatients, icon: 'patients', accent: 'mint' },
            { label: 'Records', value: stats.totalRecords, icon: 'records', accent: 'cyan' },
            { label: 'Audit events', value: stats.auditCount, icon: 'audit', accent: 'amber' },
            { label: 'System', value: 'Online', icon: 'shield', accent: 'mint' },
          ],
        }
      : user?.role === 'doctor' || user?.role === 'nurse'
        ? {
            hero: { label: 'Records', value: stats.totalRecords, icon: 'records', accent: 'cyan', hint: `${stats.totalPatients} patients in the system` },
            secondary: [
              { label: 'Patients', value: stats.totalPatients, icon: 'patients', accent: 'mint' },
              { label: 'Audit events', value: stats.auditCount, icon: 'audit', accent: 'amber' },
            ],
          }
        : user?.role === 'auditor'
          ? {
              hero: { label: 'Audit events', value: stats.auditCount, icon: 'audit', accent: 'amber', hint: 'Mutations across the system' },
              secondary: [{ label: 'Flagged events', value: 0, icon: 'shield', accent: 'rose' }],
            }
          : {
              hero: { label: 'My records', value: stats.totalRecords, icon: 'records', accent: 'cyan', hint: stats.totalPatients > 0 ? 'Patient profile linked' : 'No profile linked yet' },
              secondary: [
                { label: 'Active permissions', value: stats.activePermissions, icon: 'key', accent: 'mint' },
                { label: 'Linked profile', value: stats.totalPatients > 0 ? 'Yes' : 'No', icon: 'profile', accent: 'cyan' },
              ],
            }

  return (
    <Layout>
      {/* Header: welcome + quick actions, asymmetric */}
      <div className="fade-up accent-rail pl-5 mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-medical-500 text-[11px] uppercase tracking-[0.3em]">
              {user?.role}
            </p>
            <h1 className="text-3xl font-semibold text-white mt-1">
              {user?.first_name} {user?.last_name}
            </h1>
            <p className="text-medical-400 text-sm mt-1.5">{roleTagline(user?.role)}</p>
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
                  <span className="ml-2 text-cyan-400">↗</span>
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
          {/* Tamper alert banner — admin/auditor only */}
          {(user?.role === 'admin' || user?.role === 'auditor') && stats.tamperedCount > 0 && (
            <div
              className="fade-up mb-6 glass-card p-5 border-red-500/60 ring-1 ring-red-500/40 flex items-start gap-4"
              style={{ animationDelay: '40ms' }}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-red-300">Tamper alert</p>
                <p className="text-white font-semibold mt-0.5">
                  {stats.tamperedCount} record{stats.tamperedCount === 1 ? '' : 's'} fail on-chain verification
                </p>
                <p className="text-red-200/80 text-xs mt-1">
                  Current DB hash no longer matches the latest on-chain version.
                  Investigate immediately — review audit logs for recent record edits and check the Stellar Expert explorer for the corresponding contract.
                </p>
                <button
                  onClick={() => navigate('/records')}
                  className="mt-3 px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg text-xs hover:bg-red-500/30"
                >
                  Review records →
                </button>
              </div>
            </div>
          )}

          {/* SEC-3: active break-glass sessions — admin/auditor only */}
          {(user?.role === 'admin' || user?.role === 'auditor') && breakGlassActive > 0 && (
            <div
              className="fade-up mb-6 glass-card p-5 border-amber-400/50 ring-1 ring-amber-400/40 flex items-start gap-4"
              style={{ animationDelay: '30ms' }}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl border border-amber-400/40 bg-amber-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300">Break-glass active</p>
                <p className="text-white font-semibold mt-0.5">
                  {breakGlassActive} session{breakGlassActive === 1 ? '' : 's'} in emergency mode
                </p>
                <p className="text-amber-200/80 text-xs mt-1">
                  Permission checks are bypassed for these sessions. Every read is elevated-logged as <code>break_glass_read</code>.
                </p>
              </div>
            </div>
          )}

          {/* Security incidents — admin/auditor only */}
          {(user?.role === 'admin' || user?.role === 'auditor') && incidents.length > 0 && (
            <div className="fade-up mb-6 glass-card p-5" style={{ animationDelay: '50ms' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Security incidents</p>
                  <p className="text-white text-sm mt-0.5">
                    {incidents.length} unresolved
                  </p>
                </div>
                <button
                  onClick={() => loadStats()}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-medical-300 hover:bg-white/10"
                >
                  Refresh
                </button>
              </div>
              <ul className="divide-y divide-white/5">
                {incidents.slice(0, 5).map((inc) => {
                  const tone =
                    inc.severity === 'critical' || inc.severity === 'high'
                      ? { bar: 'bg-red-400', pill: 'bg-red-500/15 text-red-300 border-red-500/30' }
                      : inc.severity === 'medium'
                        ? { bar: 'bg-amber-400', pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
                        : { bar: 'bg-cyan-400', pill: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' }
                  return (
                    <li key={inc.id} className="py-3 flex items-start gap-3">
                      <span className={`w-1.5 h-1.5 mt-2 rounded-full shrink-0 ${tone.bar}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border ${tone.pill}`}>
                            {inc.severity}
                          </span>
                          <span className="text-white text-sm font-medium">{inc.kind}</span>
                          {inc.ip_address && (
                            <span className="text-medical-500 text-xs font-mono">{inc.ip_address}</span>
                          )}
                        </div>
                        {inc.details && (
                          <p className="text-medical-400 text-xs mt-1">{inc.details}</p>
                        )}
                        <p className="text-medical-600 text-[10px] mt-1">
                          {new Date(inc.created_at).toLocaleString()}
                        </p>
                      </div>
                      {user?.role === 'admin' && (
                        <button
                          onClick={async () => {
                            const note = prompt('Resolution note (optional):') ?? undefined
                            try {
                              await resolveIncident(inc.id, note)
                              void loadStats()
                            } catch (e: any) {
                              alert(e.response?.data || 'Failed to resolve')
                            }
                          }}
                          className="shrink-0 text-mint-400 hover:text-mint-300 text-xs"
                        >
                          Resolve
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Chain-unreachable notice (informational, not alerting) */}
          {(user?.role === 'admin' || user?.role === 'auditor') && stats.chainUnreachable && stats.tamperedCount === 0 && (
            <div className="fade-up mb-6 glass-card p-4 border-amber-400/30 flex items-center gap-3" style={{ animationDelay: '40ms' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <p className="text-amber-200/90 text-sm">
                Some records could not be verified — the Soroban CLI or RPC was unreachable.
                Tamper detection is paused for those records.
              </p>
            </div>
          )}

          {/* Bento grid: hero + secondary + activity rail */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            {/* Hero metric */}
            <div
              className="bento-hero glass-card p-6 col-span-12 lg:col-span-5 lg:row-span-2 fade-up"
              style={{ animationDelay: '60ms' }}
            >
              <KPI
                label={bento.hero.label}
                value={bento.hero.value}
                icon={bento.hero.icon}
                accent={bento.hero.accent}
                hint={bento.hero.hint}
                big
              />
              <div className="mt-8 pt-5 border-t border-white/5 flex items-center gap-2 text-[11px] text-medical-500 uppercase tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-pulse" />
                Live
                <span className="ml-auto text-medical-600 font-mono normal-case">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Secondary cards */}
            {bento.secondary.slice(0, 4).map((s, i) => (
              <Card
                key={s.label}
                className="col-span-6 lg:col-span-3 fade-up"
                style={{ animationDelay: `${120 + i * 60}ms` }}
              >
                <KPI label={s.label} value={s.value} icon={s.icon} accent={s.accent} />
              </Card>
            ))}
          </div>

          {/* Contracts strip (horizontal, with live status dots) */}
          <Card className="mb-6 p-0 overflow-hidden fade-up" style={{ animationDelay: '320ms' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Soroban Contracts</p>
                <p className="text-white text-sm mt-0.5">Stellar Testnet · deployed</p>
              </div>
              <div className="flex items-center gap-2 text-mint-300 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-mint-400 glow-green" />
                Connected
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">
              {CONTRACTS.map((c, i) => (
                <a
                  key={c.id}
                  href={`https://stellar.expert/explorer/testnet/contract/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group px-5 py-4 hover:bg-white/5 transition-colors"
                  style={{ animationDelay: `${360 + i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 glow-cyan" />
                    <span className="text-white text-sm">{c.label}</span>
                    <span className="ml-auto text-medical-500 group-hover:text-cyan-300 transition-colors">↗</span>
                  </div>
                  <p className="text-medical-500 text-[11px] mt-1">{c.purpose}</p>
                  <p className="text-medical-300/80 text-[11px] font-mono mt-2 truncate">
                    {c.id.slice(0, 14)}…{c.id.slice(-8)}
                  </p>
                </a>
              ))}
            </div>
          </Card>

          {/* Activity rail: wide on md+ */}
          <Card className="fade-up" style={{ animationDelay: '480ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Recent activity</p>
                <p className="text-white text-sm mt-0.5">Most recent audit entries</p>
              </div>
              {user?.role === 'admin' || user?.role === 'auditor' ? (
                <button
                  onClick={() => navigate('/audit')}
                  className="text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  View all →
                </button>
              ) : null}
            </div>

            {recentActivity.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-medical-500 text-sm">No recent activity for your role.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {recentActivity.map((log) => (
                  <li key={log.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-medical-100 text-sm truncate">{log.action}</p>
                      <p className="text-medical-500 text-[11px] mt-0.5">
                        {log.resource_type && <span>{log.resource_type}</span>}
                        {log.resource_id && (
                          <span className="font-mono ml-2">{log.resource_id.slice(0, 8)}…</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-medical-400 text-[11px] font-mono">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-medical-600 text-[10px] mt-0.5">
                        {new Date(log.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Layout>
  )
}
