import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import GlobalSearch from './GlobalSearch'
import { LOCALES } from '../i18n/translations'
import { useTranslation } from '../i18n/useTranslation'

type NavItem = { label: string; path: string; icon: string; roles: string[] }
type NavGroup = { heading: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', roles: ['patient', 'doctor', 'nurse', 'admin', 'auditor'] },
    ],
  },
  {
    heading: 'Clinical',
    items: [
      { label: 'Patients', path: '/patients', icon: 'patients', roles: ['doctor', 'nurse', 'admin'] },
      { label: 'Records', path: '/records', icon: 'records', roles: ['doctor', 'nurse', 'admin'] },
      { label: 'Problem List', path: '/problems', icon: 'records', roles: ['patient', 'doctor', 'nurse', 'admin'] },
      { label: 'Medications', path: '/medications', icon: 'pill', roles: ['patient', 'doctor', 'nurse', 'admin'] },
      { label: 'Immunizations', path: '/immunizations', icon: 'syringe', roles: ['patient', 'doctor', 'nurse', 'admin'] },
      { label: 'Appointments', path: '/appointments', icon: 'calendar', roles: ['patient', 'doctor', 'nurse', 'admin'] },
      { label: 'Referrals', path: '/referrals', icon: 'handoff', roles: ['patient', 'doctor', 'nurse', 'admin'] },
      { label: 'CDS Check', path: '/cds', icon: 'alert', roles: ['doctor', 'nurse'] },
      { label: 'Attachments', path: '/attachments', icon: 'paperclip', roles: ['patient', 'doctor', 'nurse', 'admin'] },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Messages', path: '/messages', icon: 'chat', roles: ['patient', 'doctor', 'nurse', 'admin'] },
    ],
  },
  {
    heading: 'My Health',
    items: [
      { label: 'My Records', path: '/my-records', icon: 'records', roles: ['patient'] },
      { label: 'Access History', path: '/access-history', icon: 'audit', roles: ['patient'] },
      { label: 'Permissions', path: '/permissions', icon: 'key', roles: ['patient'] },
    ],
  },
  {
    heading: 'Analytics',
    items: [
      { label: 'Reports', path: '/reports', icon: 'chart', roles: ['admin', 'auditor'] },
      { label: 'Population Health', path: '/population', icon: 'chart', roles: ['admin', 'auditor'] },
    ],
  },
  {
    heading: 'Trust & Audit',
    items: [
      { label: 'Audit Logs', path: '/audit', icon: 'audit', roles: ['admin', 'auditor'] },
      { label: 'Blockchain', path: '/blockchain', icon: 'chain', roles: ['admin', 'auditor'] },
      { label: 'Verify Receipt', path: '/verify-receipt', icon: 'shield', roles: ['patient', 'doctor', 'nurse', 'admin', 'auditor'] },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Staff', path: '/staff', icon: 'staff', roles: ['admin'] },
      { label: 'Create Staff', path: '/create-staff', icon: 'user-plus', roles: ['admin'] },
      { label: 'Assignments', path: '/admin/assignments', icon: 'patients', roles: ['admin'] },
      { label: 'Erasure Queue', path: '/admin/erasure', icon: 'audit', roles: ['admin'] },
      { label: 'FHIR Outbound', path: '/fhir-push', icon: 'export', roles: ['admin'] },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Settings', path: '/settings', icon: 'settings', roles: ['patient', 'doctor', 'nurse', 'admin', 'auditor'] },
    ],
  },
]

const icons: Record<string, React.ReactNode> = {
  dashboard: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
  patients: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  records: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  key: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l11-11a6 6 0 017.743 5.743L11 11V7a2 2 0 00-2-2h-2m-4 5.5v3a2 2 0 002 2h2.5" /></svg>,
  audit: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  'user-plus': <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>,
  staff: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  pill: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.5 20.5a7 7 0 01-7-7V10a3.5 3.5 0 017 0v10.5zM13.5 3.5a7 7 0 017 7V14a3.5 3.5 0 01-7 0V3.5zM3.5 10l7 7M13.5 7l7 7" /></svg>,
  syringe: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 2l4 4M17 3l4 4-2 2-4-4 2-2zM15 5l4 4-8 8H7v-4l8-8zM11 13l2 2M9 15l2 2" /></svg>,
  calendar: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  handoff: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" /></svg>,
  alert: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" /></svg>,
  paperclip: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.17 7l-6.59 6.59a2 2 0 102.83 2.83l8-8a4 4 0 10-5.66-5.66l-8.5 8.5a6 6 0 108.49 8.49L20 15" /></svg>,
  chat: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" /></svg>,
  chart: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 3v18h18M7 14l4-4 4 4 5-5" /></svg>,
  chain: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.72-1.71" /></svg>,
  shield: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  export: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v4a1 1 0 001 1h14a1 1 0 001-1v-4M16 8l-4-4-4 4m4-4v12" /></svg>,
  settings: <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, locale, setLocale } = useTranslation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getPageTitle = () => {
    if (location.pathname === '/dashboard') return t('Dashboard')
    for (const g of navGroups) {
      for (const i of g.items) {
        if (i.path === location.pathname) return t(i.label)
      }
    }
    const path = location.pathname.split('/').filter(Boolean).join(' / ')
    return path.charAt(0).toUpperCase() + path.slice(1) || 'Dashboard'
  }

  const visibleGroups = navGroups
    .map((g) => ({
      heading: g.heading,
      items: g.items.filter((i) => user && i.roles.includes(user.role)),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        className="w-[232px] flex flex-col"
        style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--hairline)' }}
      >
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[22px] leading-none font-semibold" style={{ color: 'var(--brand)' }}>
              EHR
            </span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--ink-muted)' }}>
              v1.0
            </span>
          </div>
          <p className="chart-label mt-1.5">Blockchain Health Records</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <p className="chart-label px-2 mb-1.5">{group.heading}</p>
              <div className="space-y-[1px]">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] transition-colors duration-100 text-left"
                      style={{
                        background: isActive ? 'var(--surface)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                        fontWeight: isActive ? 500 : 400,
                        borderRadius: '2px',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'
                          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)'
                        }
                      }}
                    >
                      <span style={{ color: isActive ? 'var(--accent)' : 'var(--ink-muted)' }}>
                        {icons[item.icon] || icons.records}
                      </span>
                      <span className="truncate">{t(item.label)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div
              className="w-8 h-8 flex items-center justify-center text-[11px] font-medium shrink-0"
              style={{
                background: 'var(--surface)',
                color: 'var(--ink)',
                border: '1px solid var(--hairline-2)',
                borderRadius: '2px',
              }}
            >
              {user?.first_name?.[0]?.toUpperCase() || '?'}
              {user?.last_name?.[0]?.toUpperCase() || ''}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-[10px] font-mono capitalize" style={{ color: 'var(--ink-muted)' }}>
                {user?.role}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-2.5 py-1.5 text-[12px] transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--ink-muted)',
              border: '1px solid var(--hairline-2)',
              borderRadius: '2px',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--danger)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-muted)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--hairline-2)'
            }}
          >
            {t('Sign Out')}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="px-6 py-3 flex justify-between items-center"
          style={{ background: 'var(--sidebar)', borderBottom: '1px solid var(--hairline)' }}
        >
          <h2 className="font-serif text-[18px]" style={{ color: 'var(--ink)' }}>
            {getPageTitle()}
          </h2>

          <div className="flex items-center gap-3">
            {user && ['doctor', 'nurse', 'admin', 'auditor'].includes(user.role) && (
              <GlobalSearch />
            )}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as typeof locale)}
              title="Language"
              className="text-[11px] px-2 py-1.5"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline-2)',
                color: 'var(--ink-2)',
                borderRadius: '2px',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline-2)',
                borderRadius: '2px',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
              <span style={{ color: 'var(--ink-2)' }}>{t('Connected')}</span>
              <span className="font-mono text-[10px] ml-1" style={{ color: 'var(--ink-muted)' }}>
                TESTNET
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
