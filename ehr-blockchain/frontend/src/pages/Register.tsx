import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Register() {
    const [form, setForm] = useState({
        email: '',
        password: '',
        role: 'patient',
        first_name: '',
        last_name: '',
    })
    const [consentChecked, setConsentChecked] = useState(false)
    const [consentVersion, setConsentVersion] = useState<string>('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        // Fetch the current privacy-notice version from the backend so the
        // value we submit is guaranteed to match what the server expects.
        api.get('/api/auth/consent-version')
            .then((r) => setConsentVersion(r.data?.current || ''))
            .catch(() => setConsentVersion(''))
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        if (!consentChecked) {
            setError('You must accept the privacy notice to register.')
            return
        }
        if (!consentVersion) {
            setError('Could not load the current privacy notice. Please retry.')
            return
        }
        setLoading(true)

        try {
            const res = await api.post('/api/auth/register', { ...form, consent_version: consentVersion })
            login(res.data.token, res.data.user)
            navigate('/dashboard')
        } catch (err: any) {
            const status = err.response?.status
            let errMsg = ''
            
            if (status === 409) {
                errMsg = 'Email already registered. Please use a different email.'
            } else if (status === 400) {
                errMsg = err.response?.data?.message || 'Invalid input. Please check your details.'
            } else {
                errMsg = err.response?.data?.message || 'Registration failed. Please try again.'
            }
            
            setError(errMsg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center mesh-bg relative overflow-hidden">
            <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-slow" />
            <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-mint-500/10 rounded-full blur-3xl animate-pulse-slow" />

            <div className="relative z-10 w-full max-w-md mx-4">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-mint-400 glow-cyan mb-4">
                        <span className="text-white font-bold text-2xl">E</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white">Create Account</h1>
                    <p className="text-medical-400 mt-2">Join the Blockchain EHR Network</p>
                </div>

                <div className="glass-card p-8">
                    <h2 className="text-xl font-semibold text-white mb-6">Registration</h2>

                    {error && (
                        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-sm flex items-center gap-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-medical-300 text-sm mb-2">First Name</label>
                                <input
                                    type="text"
                                    name="first_name"
                                    value={form.first_name}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-medical-300 text-sm mb-2">Last Name</label>
                                <input
                                    type="text"
                                    name="last_name"
                                    value={form.last_name}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Email</label>
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Password</label>
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Role</label>
                            <select
                                name="role"
                                value={form.role}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all appearance-none [&>option]:bg-slate-800"
                            >
                                <option value="patient">Patient</option>
                            </select>
                        </div>

                        <div className="pt-2">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={consentChecked}
                                    onChange={(e) => setConsentChecked(e.target.checked)}
                                    className="mt-1 w-4 h-4 accent-cyan-500"
                                />
                                <span className="text-medical-300 text-sm">
                                    I acknowledge that my health records will be encrypted at rest,
                                    anchored on the Stellar blockchain for integrity, and audit-logged. I have read
                                    the{' '}
                                    <a
                                        href="#privacy-notice"
                                        className="text-cyan-400 hover:text-cyan-300 underline decoration-dotted"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            alert(
                                                'Privacy Notice ' + consentVersion + '\n\n' +
                                                'Your medical records are:\n' +
                                                '• Encrypted with AES-256-GCM before storage.\n' +
                                                '• SHA-256 hash anchored on Stellar Testnet.\n' +
                                                '• Access-gated by role-based + blockchain-enforced permissions.\n' +
                                                '• Immutably audit-logged.\n\n' +
                                                'You may revoke consent at any time from Settings. ' +
                                                'Revoking does not delete existing records; request erasure separately.'
                                            )
                                        }}
                                    >
                                        Privacy Notice {consentVersion && <>({consentVersion})</>}
                                    </a>{' '}
                                    and accept.
                                </span>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !consentChecked || !consentVersion}
                            className="w-full bg-gradient-to-r from-cyan-500 to-mint-500 text-white py-3 rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50 glow-cyan"
                        >
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-medical-400">
                        Already have an account?{' '}
                        <Link to="/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                            Sign In
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}