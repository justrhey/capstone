import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

const roleStats: Record<string, { label: string; value: string; icon: string }[]> = {
  patient: [
    { label: 'My Records', value: '--', icon: '📋' },
    { label: 'Active Permissions', value: '--', icon: '🔑' },
    { label: 'Recent Access', value: '--', icon: '👁️' },
  ],
  doctor: [
    { label: 'Total Patients', value: '--', icon: '👥' },
    { label: 'Records Created', value: '--', icon: '📝' },
    { label: "Today's Access", value: '--', icon: '📅' },
  ],
  nurse: [
    { label: 'Assigned Patients', value: '--', icon: '🏥' },
    { label: 'Pending Records', value: '--', icon: '⏳' },
  ],
  admin: [
    { label: 'Total Users', value: '--', icon: '👤' },
    { label: 'Total Records', value: '--', icon: '📊' },
    { label: 'System Status', value: 'Online', icon: '✅' },
  ],
  auditor: [
    { label: 'Audit Entries', value: '--', icon: '📜' },
    { label: 'Flagged Events', value: '--', icon: '⚠️' },
  ],
}

export default function Dashboard() {
  const { user } = useAuth()
  const stats = roleStats[user?.role || 'patient'] || []

  return (
    <Layout>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome, {user?.first_name} {user?.last_name}
        </h1>
        <p className="text-medical-400 mt-1">
          {user?.role === 'patient'
            ? 'Manage your health records and access permissions'
            : user?.role === 'doctor'
            ? 'View patients and manage medical records'
            : user?.role === 'admin'
            ? 'System administration and user management'
            : 'Dashboard overview'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card p-6 hover:border-cyan-400/20 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-medical-400 text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <span className="text-3xl">{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Blockchain Verification Panel */}
      <div className="glass-card p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-mint-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-mint-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium">Blockchain Verified</h3>
            <p className="text-medical-400 text-xs">All records are cryptographically secured on-chain</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-mint-400 glow-green animate-pulse" />
            <span className="text-mint-400 text-xs font-medium">Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/5">
          <div>
            <p className="text-medical-500 text-xs">Network</p>
            <p className="text-cyan-300 text-sm font-mono mt-1">Stellar Soroban</p>
          </div>
          <div>
            <p className="text-medical-500 text-xs">Latest Block</p>
            <p className="text-cyan-300 text-sm font-mono mt-1">#1,284,392</p>
          </div>
          <div>
            <p className="text-medical-500 text-xs">Last Sync</p>
            <p className="text-cyan-300 text-sm font-mono mt-1">2s ago</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <h2 className="text-white font-medium mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <div className="flex-1">
                <p className="text-medical-300 text-sm">No recent activity</p>
              </div>
              <span className="text-medical-500 text-xs font-mono">0x0000...0000</span>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}