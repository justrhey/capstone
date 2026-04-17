import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface User {
    id: string
    email: string
    role: string
    first_name: string
    last_name: string
    consent_current?: boolean
    totp_enabled?: boolean
}

interface AuthContextType {
    user: User | null
    token: string | null
    login: (token: string, user: User) => void
    logout: () => void
    isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const IDLE_TIMEOUT_MS = 60_000
const REFRESH_INTERVAL_MS = 10 * 60_000 // 10 minutes; JWT exp is 15

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)

    useEffect(() => {
        const storedToken = localStorage.getItem('token')
        const storedUser = localStorage.getItem('user')
        if (storedToken && storedUser) {
            setToken(storedToken)
            setUser(JSON.parse(storedUser))
        }
    }, [])

    const login = (newToken: string, newUser: User) => {
        setToken(newToken)
        setUser(newUser)
        localStorage.setItem('token', newToken)
        localStorage.setItem('user', JSON.stringify(newUser))
    }

    const logout = useCallback(() => {
        setToken(null)
        setUser(null)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
    }, [])

    // Auto-logout on 25s of idle when authenticated
    useEffect(() => {
        if (!token) return

        let timer = window.setTimeout(logout, IDLE_TIMEOUT_MS)
        const reset = () => {
            window.clearTimeout(timer)
            timer = window.setTimeout(logout, IDLE_TIMEOUT_MS)
        }
        const events: Array<keyof WindowEventMap> = [
            'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click',
        ]
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
        return () => {
            window.clearTimeout(timer)
            events.forEach((e) => window.removeEventListener(e, reset))
        }
    }, [token, logout])

    // Backend-signalled session expiry (401 from axios interceptor)
    useEffect(() => {
        const handler = () => logout()
        window.addEventListener('auth:expired', handler)
        return () => window.removeEventListener('auth:expired', handler)
    }, [logout])

    // Silent JWT refresh while the session is active. Keeps the session alive past
    // the 15-minute JWT expiry without a re-login, as long as the user stays
    // active (idle timeout above will still end truly idle sessions).
    useEffect(() => {
        if (!token) return

        const tick = async () => {
            try {
                const { refreshToken: callRefresh } = await import('../services/api')
                const res = await callRefresh()
                const next = res.data?.token
                if (next) {
                    setToken(next)
                    localStorage.setItem('token', next)
                }
            } catch {
                // Silent — 401 interceptor will handle hard failures.
            }
        }

        const interval = window.setInterval(tick, REFRESH_INTERVAL_MS)
        return () => window.clearInterval(interval)
    }, [token])

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) throw new Error('useAuth must be used within AuthProvider')
    return context
}