import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [otp, setOtp] = useState('')
    const [otpRequired, setOtpRequired] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await api.post('/api/auth/login', {
                email,
                password,
                otp: otp || undefined,
            })
            const data = res.data
            if (data.token && data.user) {
                login(data.token, data.user)
                navigate('/dashboard')
            } else {
                setError('Invalid response from server')
                setLoading(false)
            }
        } catch (err: any) {
            const status = err.response?.status
            const body = err.response?.data
            const rawBody = typeof body === 'string' ? body : ''
            let errMsg = ''

            if (status === 401 && rawBody.includes('OTP required')) {
                setOtpRequired(true)
                errMsg = 'Enter the 6-digit code from your authenticator app.'
            } else if (status === 401 && rawBody.includes('Invalid OTP')) {
                setOtpRequired(true)
                errMsg = 'That code did not verify. Try again (codes rotate every 30s).'
            } else if (status === 401) {
                errMsg = 'Invalid email or password.'
            } else if (status === 403) {
                errMsg = 'Account is disabled. Contact administrator.'
            } else if (status === 404) {
                errMsg = 'User not found.'
            } else if (status === 0) {
                errMsg = 'Cannot connect to server.'
            } else {
                errMsg =
                    typeof body === 'string'
                        ? body
                        : body?.message || err.message || 'Login failed'
            }

            setError(errMsg)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
            {/* Left pane: wordmark + attribution */}
            <div className="hidden lg:flex flex-col justify-between w-[44%] p-10" style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--hairline)' }}>
                <div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="font-serif text-[44px] font-semibold leading-none" style={{ color: 'var(--brand)', fontVariationSettings: "'opsz' 144" }}>
                            EHR
                        </span>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>v1.0</span>
                    </div>
                    <p className="chart-label mt-2">Blockchain Health Records</p>
                </div>

                <div className="space-y-6 max-w-md">
                    <p className="font-serif text-[22px] leading-[1.35]" style={{ color: 'var(--ink)', fontVariationSettings: "'opsz' 72" }}>
                        Clinical records notarized to the Stellar ledger. Every write is hashed, every read is logged.
                    </p>
                    <div className="grid grid-cols-3 gap-6 pt-4" style={{ borderTop: '1px solid var(--hairline)' }}>
                        <div>
                            <p className="chart-label">Encryption</p>
                            <p className="text-[13px] mt-1 font-mono" style={{ color: 'var(--ink-2)' }}>AES-256-GCM</p>
                        </div>
                        <div>
                            <p className="chart-label">Anchor</p>
                            <p className="text-[13px] mt-1 font-mono" style={{ color: 'var(--ink-2)' }}>SHA-256</p>
                        </div>
                        <div>
                            <p className="chart-label">Network</p>
                            <p className="text-[13px] mt-1 font-mono" style={{ color: 'var(--ink-2)' }}>Soroban</p>
                        </div>
                    </div>
                </div>

                <p className="text-[11px] font-mono" style={{ color: 'var(--ink-faint)' }}>
                    © {new Date().getFullYear()} · HIPAA / GDPR / DPA-aligned
                </p>
            </div>

            {/* Right pane: the form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-[380px]">
                    <div className="lg:hidden mb-8">
                        <span className="font-serif text-[36px] font-semibold" style={{ color: 'var(--brand)' }}>EHR</span>
                        <p className="chart-label mt-1">Blockchain Health Records</p>
                    </div>

                    <p className="chart-label mb-2">Authentication</p>
                    <h2 className="font-serif text-[26px] leading-tight mb-1" style={{ color: 'var(--ink)', fontVariationSettings: "'opsz' 72" }}>
                        Sign in to your chart
                    </h2>
                    <p className="text-[13px] mb-8" style={{ color: 'var(--ink-muted)' }}>
                        Access is logged to the audit trail on every session.
                    </p>

                    {error && (
                        <div
                            className="mb-5 px-3 py-2.5 text-[12px] flex items-start gap-2"
                            style={{
                                background: 'rgba(224, 101, 93, 0.08)',
                                border: '1px solid rgba(224, 101, 93, 0.32)',
                                borderRadius: '3px',
                                color: '#e0655d',
                            }}
                        >
                            <svg className="w-4 h-4 mt-[1px] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="chart-label block mb-1.5">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-3 py-2.5 text-[14px]"
                                placeholder="you@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="chart-label block mb-1.5">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2.5 text-[14px]"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {otpRequired && (
                            <div>
                                <label className="chart-label block mb-1.5">Authenticator code</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2.5 font-mono tracking-[0.4em] text-center text-[16px]"
                                    style={{ borderColor: 'var(--accent)' }}
                                    placeholder="000000"
                                    autoFocus
                                />
                                <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--ink-muted)' }}>
                                    Codes rotate every 30 seconds.
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (otpRequired && otp.length < 6)}
                            className="w-full py-2.5 text-[14px] font-medium transition-colors"
                            style={{
                                background: loading || (otpRequired && otp.length < 6) ? 'var(--ink-faint)' : 'var(--accent)',
                                color: '#ffffff',
                                borderRadius: '3px',
                                cursor: loading || (otpRequired && otp.length < 6) ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!loading && !(otpRequired && otp.length < 6)) {
                                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dark)'
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!loading && !(otpRequired && otp.length < 6)) {
                                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'
                                }
                            }}
                        >
                            {loading ? 'Signing in…' : otpRequired ? 'Verify & sign in' : 'Sign in'}
                        </button>
                    </form>

                    <div className="mt-6 pt-5 flex items-center gap-2 text-[11px] font-mono" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}>
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: 'var(--success)' }}
                        />
                        <span>Secured by Stellar Soroban · Testnet</span>
                    </div>
                </div>
            </div>
        </div>
    )
}