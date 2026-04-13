import { useState } from 'react'
import api from '../services/api'
import Layout from '../components/Layout'

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
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState('')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSuccess('')
        setLoading(true)

        try {
            await api.post('/api/auth/register', form)
            setSuccess(`Staff account created successfully!`)
            setForm({
                email: '',
                password: '',
                role: 'doctor',
                first_name: '',
                last_name: '',
            })
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create staff account')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Layout>
            <div className="max-w-2xl">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white">Create Staff Account</h1>
                    <p className="text-medical-400 mt-1">Add new doctors, nurses, or auditors to the system</p>
                </div>

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

                <div className="glass-card p-6">
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
                            <label className="block text-medical-300 text-sm mb-2">Password</label>
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 focus:outline-none focus:border-cyan-400/50"
                                required
                            />
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
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-cyan-500 to-mint-500 text-white py-3 rounded-xl font-medium hover:from-cyan-400 hover:to-mint-400 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Staff Account'}
                        </button>
                    </form>
                </div>
            </div>
        </Layout>
    )
}