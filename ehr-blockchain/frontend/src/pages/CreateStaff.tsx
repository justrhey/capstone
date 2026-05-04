import { useMemo, useState } from 'react'
import { createStaff } from '../services/api'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { passwordStrength } from '../utils/password'

const STAFF_ROLES = [
    { value: 'doctor', label: 'Doctor' },
    { value: 'nurse', label: 'Nurse' },
    { value: 'auditor', label: 'Auditor' },
]

export default function CreateStaff() {
    const [form, setForm] = useState({
        email: '',
        password: '',
        role: 'doctor',
        first_name: '',
        last_name: '',
        phone: '',
    })
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState('')
    const strength = useMemo(() => passwordStrength(form.password), [form.password])
    const passwordsMatch = form.password.length > 0 && form.password === confirmPassword
    const canSubmit = !loading && strength.isAcceptable && passwordsMatch

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSuccess('')
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
            await createStaff(form as any)
            setSuccess(`Staff account created successfully!`)
            setForm({
                email: '',
                password: '',
                role: 'doctor',
                first_name: '',
                last_name: '',
                phone: '',
            })
            setConfirmPassword('')
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create staff account')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Layout>
            <div className="max-w-2xl">
                <PageHeader
                    section="Admin"
                    title="Create Staff Account"
                    subtitle="Add new doctors, nurses, or auditors to the system"
                />

                {success && (
                    <div className="mb-6 p-4 bg-mint-500/10 border border-mint-500/20 rounded-xl text-mint-400">
                        {success}
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                        {error}
                    </div>
                )}

                <div className="glass-card p-6 fade-up" style={{ animationDelay: '80ms' }}>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-medical-300 text-sm mb-2">First Name</label>
                                <input
                                    type="text"
                                    name="first_name"
                                    value={form.first_name}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
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
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
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
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Phone</label>
                            <input
                                type="tel"
                                name="phone"
                                value={form.phone}
                                onChange={handleChange}
                                placeholder="+63 9XX XXX XXXX"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
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
                                placeholder="8+ chars, mixed case, number"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
                                required
                            />
                            {form.password.length > 0 && (
                                <div className="mt-2">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div
                                                key={i}
                                                className="h-1 flex-1 rounded-full transition-colors"
                                                style={{
                                                    background:
                                                        i <= strength.score
                                                            ? strength.score <= 1
                                                                ? '#ef4444'
                                                                : strength.score === 2
                                                                ? '#f59e0b'
                                                                : '#10b981'
                                                            : 'rgba(255,255,255,0.08)',
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <p
                                        className="text-xs mt-1.5 font-mono tracking-wide"
                                        style={{
                                            color:
                                                strength.score <= 1
                                                    ? '#f87171'
                                                    : strength.score === 2
                                                    ? '#fbbf24'
                                                    : '#34d399',
                                        }}
                                    >
                                        {strength.label}
                                        {strength.suggestions.length > 0 && (
                                            <span className="text-medical-400">
                                                {' '}— add {strength.suggestions.join(', ')}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Confirm password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-type password"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
                                required
                            />
                            {confirmPassword.length > 0 && !passwordsMatch && (
                                <p className="text-xs mt-1.5 text-red-400">Passwords do not match.</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-medical-300 text-sm mb-2">Role</label>
                            <select
                                name="role"
                                value={form.role}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
                            >
                                {STAFF_ROLES.map((role) => (
                                    <option key={role.value} value={role.value}>
                                        {role.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="w-full bg-gradient-to-r from-cyan-500 to-mint-500 text-white py-3 rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating...' : 'Create Staff Account'}
                        </button>
                    </form>
                </div>
            </div>
        </Layout>
    )
}