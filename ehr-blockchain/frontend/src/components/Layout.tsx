import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', roles: ['patient', 'doctor', 'nurse', 'admin', 'auditor'] },
  { label: 'Patients', path: '/patients', icon: 'patients', roles: ['doctor', 'nurse', 'admin'] },
  { label: 'Records', path: '/records', icon: 'records', roles: ['doctor', 'nurse', 'admin'] },
  { label: 'My Records', path: '/my-records', icon: 'records', roles: ['patient'] },
  { label: 'Permissions', path: '/permissions', icon: 'key', roles: ['patient'] },
  { label: 'Audit Logs', path: '/audit', icon: 'audit', roles: ['admin', 'auditor'] },
  { label: 'Create Staff', path: '/create-staff', icon: 'user-plus', roles: ['admin'] },
]

const icons: Record<string, React.ReactNode> = {
  dashboard: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
  patients: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  records: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  key: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l11-11a6 6 0 017.743 5.743L11 11V7a2 2 0 00-2-2h-2m-4 5.5v3a2 2 0 002 2h2.5" /></svg>,
  audit: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM7 21h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" /></svg>,
  'user-plus': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 16a5 5 0 015-5h4a5 5 0 015 5v4a5 5 0 01-5 5H8a5 5 0 01-5-5v-4z" /></svg>,
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getPageTitle = () => {
    const path = location.pathname.split('/').filter(Boolean).join(' / ')
    return path.charAt(0).toUpperCase() + path.slice(1) || 'Dashboard'
  }

  return (
    <div className="flex h-screen mesh-bg">
      <aside className="w-64 glass-light flex flex-col border-r border-white/10">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-mint-400 flex items-center justify-center glow-cyan">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">EHR System</h1>
              <p className="text-medical-400 text-[10px]">Blockchain Health Records</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter((item) => user && item.roles.includes(user.role))
            .map((item) => {
              const isActive = location.pathname === item.path
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/20 to-mint-500/10 text-cyan-300 border border-cyan-400/20 glow-cyan'
                      : 'text-medical-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {icons[item.icon]}
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 glow-cyan" />
                  )}
                </button>
              )
            })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="glass-card p-3 mb-3">
            <p className="text-white text-sm font-medium truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-medical-400 text-xs capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="glass-light border-b border-white/10 px-6 py-3 flex justify-between items-center">
          <h2 className="text-white font-medium capitalize">
            {getPageTitle()}
          </h2>

          <div className="flex items-center gap-4">
            <div className="glass-card px-4 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-mint-400 glow-green animate-pulse" />
              <span className="text-mint-300 text-xs font-medium">Connected</span>
              <span className="text-medical-500 text-[10px] ml-1">Soroban Network</span>
            </div>
            <div className="glass-card px-3 py-2">
              <span className="text-medical-400 text-[10px] font-mono">Testnet</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}