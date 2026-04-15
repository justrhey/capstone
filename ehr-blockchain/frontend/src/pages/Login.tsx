import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            console.log('Attempting login with:', email)
            const res = await api.post('/api/auth/login', { email, password })
            console.log('Login response:', res.data)
            const data = res.data
            if (data.token && data.user) {
                login(data.token, data.user)
                navigate('/dashboard')
            } else {
                setError('Invalid response from server')
                setLoading(false)
            }
        } catch (err: any) {
            console.error('Login error:', err)
            const status = err.response?.status
            let errMsg = ''
            
            if (status === 401) {
                errMsg = 'Invalid email or password. Please try again.'
            } else if (status === 403) {
                errMsg = 'Account is disabled. Contact administrator.'
            } else if (status === 404) {
                errMsg = 'User not found.'
            } else if (status === 0) {
                errMsg = 'Cannot connect to server. Please check your connection.'
            } else {
                errMsg = err.response?.data?.message || err.response?.data || err.message || 'Login failed'
            }
            
            setError(errMsg)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center mesh-bg relative overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-slow" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-mint-500/10 rounded-full blur-3xl animate-pulse-slow" />

            <div className="relative z-10 w-full max-w-md mx-4">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-mint-400 glow-cyan mb-4">
                        <span className="text-white font-bold text-2xl">E</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white">EHR System</h1>
                    <p className="text-medical-400 mt-2">Blockchain-Based Electronic Health Records</p>
                </div>

                <div className="glass-card p-8">
                    <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm flex items-center gap-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
                                placeholder="you@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-cyan-500 to-mint-500 text-white py-3 rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50 glow-cyan"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <div className="mt-6 flex items-center justify-center gap-2 text-medical-500 text-xs">
                    <svg className="w-4 h-4 text-mint-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Secured by Stellar Soroban Blockchain</span>
                </div>
            </div>
        </div>
    )
}