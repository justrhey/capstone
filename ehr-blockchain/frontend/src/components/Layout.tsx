import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: '◉', roles: ['patient', 'doctor', 'nurse', 'admin', 'auditor'] },
  { label: 'Patients', path: '/patients', icon: '👥', roles: ['doctor', 'nurse', 'admin'] },
  { label: 'Records', path: '/records', icon: '📋', roles: ['doctor', 'nurse', 'admin'] },
  { label: 'My Records', path: '/my-records', icon: '🏥', roles: ['patient'] },
  { label: 'Permissions', path: '/permissions', icon: '🔑', roles: ['patient'] },
  { label: 'Audit Logs', path: '/audit', icon: '📜', roles: ['admin', 'auditor'] },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen mesh-bg">
      {/* Glass Sidebar */}
      <aside className="w-64 glass-light flex flex-col border-r border-white/10">
        {/* Logo */}
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

        {/* Navigation */}
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
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 glow-cyan" />
                  )}
                </button>
              )
            })}
        </nav>

        {/* User + Logout */}
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="glass-light border-b border-white/10 px-6 py-3 flex justify-between items-center">
          <h2 className="text-white font-medium capitalize">
            {location.pathname.split('/').filter(Boolean).join(' / ') || 'Dashboard'}
          </h2>

          {/* Network Status Widget */}
          <div className="flex items-center gap-4">
            <div className="glass-card px-4 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-mint-400 glow-green animate-pulse" />
              <span className="text-mint-300 text-xs font-medium">Connected</span>
              <span className="text-medical-500 text-[10px] ml-1">Soroban Network</span>
            </div>
            <div className="glass-card px-3 py-2">
              <span className="text-medical-400 text-[10px] font-mono">0x7e4a...f3d2</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}