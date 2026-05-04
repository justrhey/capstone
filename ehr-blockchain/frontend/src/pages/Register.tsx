import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { passwordStrength } from '../utils/password'

export default function Register() {
    const [form, setForm] = useState({
        email: '',
        password: '',
        role: 'patient',
        first_name: '',
        last_name: '',
        phone: '',
        date_of_birth: '',
        sex: '',
    })
    const [confirmPassword, setConfirmPassword] = useState('')
    const [consentChecked, setConsentChecked] = useState(false)
    const [consentVersion, setConsentVersion] = useState<string>('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const strength = useMemo(() => passwordStrength(form.password), [form.password])
    const passwordsMatch = form.password.length > 0 && form.password === confirmPassword
    const canSubmit = consentChecked && consentVersion && strength.isAcceptable && passwordsMatch && !loading
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
        if (!strength.isAcceptable) {
            setError('Password is too weak. Add ' + strength.suggestions.join(', ') + '.')
            return
        }
        if (!passwordsMatch) {
            setError('Passwords do not match.')
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
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
            <div className="w-full max-w-[440px] px-6 py-12">
                <div className="mb-8">
                    <div className="flex items-baseline gap-2.5">
                        <span className="font-serif text-[36px] font-semibold leading-none" style={{ color: 'var(--brand)' }}>EHR</span>
                        <span className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>v1.0</span>
                    </div>
                    <p className="chart-label mt-2">Blockchain Health Records</p>
                </div>

                <p className="chart-label mb-2">Registration</p>
                <h2 className="font-serif text-[26px] leading-tight mb-1" style={{ color: 'var(--ink)', fontVariationSettings: "'opsz' 72" }}>
                    Create a patient account
                </h2>
                <p className="text-[13px] mb-7" style={{ color: 'var(--ink-muted)' }}>
                    Staff accounts are provisioned by an administrator.
                </p>

                {error && (
                    <div
                        className="mb-5 px-3 py-2.5 text-[12px] flex items-start gap-2"
                        style={{ background: 'rgba(224, 101, 93, 0.08)', border: '1px solid rgba(224, 101, 93, 0.32)', borderRadius: '3px', color: '#e0655d' }}
                    >
                        <svg className="w-4 h-4 mt-[1px] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="chart-label block mb-1.5">First name</label>
                            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" placeholder="Jane" required />
                        </div>
                        <div>
                            <label className="chart-label block mb-1.5">Last name</label>
                            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" placeholder="Doe" required />
                        </div>
                    </div>

                    <div>
                        <label className="chart-label block mb-1.5">Email</label>
                        <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" placeholder="you@example.com" required />
                    </div>

                    <div>
                        <label className="chart-label block mb-1.5">Phone</label>
                        <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" placeholder="+63 9XX XXX XXXX" required />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="chart-label block mb-1.5">Date of birth</label>
                            <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" required />
                        </div>
                        <div>
                            <label className="chart-label block mb-1.5">Sex</label>
                            <select name="sex" value={form.sex} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" required>
                                <option value="" disabled>Select…</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="chart-label block mb-1.5">Password</label>
                        <input type="password" name="password" value={form.password} onChange={handleChange} className="w-full px-3 py-2.5 text-[14px]" placeholder="8+ chars, mixed case, number" required />
                        {form.password.length > 0 && (
                            <div className="mt-1.5">
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div
                                            key={i}
                                            className="h-[3px] flex-1 rounded-full transition-colors"
                                            style={{
                                                background:
                                                    i <= strength.score
                                                        ? strength.score <= 1
                                                            ? '#e0655d'
                                                            : strength.score === 2
                                                            ? '#ca8a04'
                                                            : '#10b981'
                                                        : 'var(--hairline)',
                                            }}
                                        />
                                    ))}
                                </div>
                                <p
                                    className="text-[11px] mt-1 font-mono tracking-wide"
                                    style={{
                                        color:
                                            strength.score <= 1
                                                ? '#e0655d'
                                                : strength.score === 2
                                                ? '#ca8a04'
                                                : '#10b981',
                                    }}
                                >
                                    {strength.label}
                                    {strength.suggestions.length > 0 && (
                                        <span style={{ color: 'var(--ink-muted)' }}>
                                            {' '}— add {strength.suggestions.join(', ')}
                                        </span>
                                    )}
                                </p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="chart-label block mb-1.5">Confirm password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-3 py-2.5 text-[14px]"
                            placeholder="Re-type password"
                            required
                        />
                        {confirmPassword.length > 0 && !passwordsMatch && (
                            <p className="text-[11px] mt-1" style={{ color: '#e0655d' }}>
                                Passwords do not match.
                            </p>
                        )}
                    </div>

                    <div className="pt-1">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={consentChecked}
                                onChange={(e) => setConsentChecked(e.target.checked)}
                                className="mt-1 w-3.5 h-3.5"
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            <span className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                                I acknowledge that my health records will be encrypted at rest, anchored on the Stellar
                                blockchain for integrity, and audit-logged. I have read the{' '}
                                <a
                                    href="#privacy-notice"
                                    className="underline decoration-dotted"
                                    style={{ color: 'var(--accent)' }}
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
                                    Privacy Notice {consentVersion && <span className="font-mono">({consentVersion})</span>}
                                </a>{' '}
                                and accept its terms.
                            </span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full py-2.5 text-[14px] font-medium transition-colors"
                        style={{
                            background: !canSubmit ? 'var(--ink-faint)' : 'var(--accent)',
                            color: '#ffffff',
                            borderRadius: '3px',
                            cursor: !canSubmit ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={(e) => {
                            if (canSubmit) {
                                (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dark)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (canSubmit) {
                                (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'
                            }
                        }}
                    >
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>

                <p className="mt-6 pt-5 text-[12px]" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}>
                    Already have an account?{' '}
                    <Link to="/login" className="underline" style={{ color: 'var(--accent)' }}>
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    )
}