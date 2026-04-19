import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { acceptConsent, getConsentVersion, requestErasure, revokeConsent, totpEnroll, totpConfirm, totpDisable, listMySessions, revokeMySession } from '../services/api'

interface SessionRow {
  id: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
  revoked_at: string | null
  last_seen_at: string | null
}

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [currentVersion, setCurrentVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [enrollSecret, setEnrollSecret] = useState('')
  const [enrollUrl, setEnrollUrl] = useState('')
  const [enrollCode, setEnrollCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const totpEnabled = user?.totp_enabled === true

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  useEffect(() => {
    listMySessions()
      .then((r) => {
        setSessions(r.data?.sessions || [])
        setCurrentSessionId(r.data?.current_session_id || null)
      })
      .catch(() => {})
  }, [])

  const handleRevokeSession = async (id: string) => {
    if (id === currentSessionId) {
      if (!confirm('Revoke the session you are currently using? You will be signed out.')) return
    } else {
      if (!confirm('Revoke this session?')) return
    }
    try {
      await revokeMySession(id)
      if (id === currentSessionId) {
        logout()
        navigate('/login')
        return
      }
      const r = await listMySessions()
      setSessions(r.data?.sessions || [])
    } catch (e: any) {
      alert(e.response?.data || 'Failed to revoke session')
    }
  }

  const handleEnroll = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await totpEnroll()
      setEnrollSecret(res.data.secret_base32)
      setEnrollUrl(res.data.otpauth_url)
    } catch (e: any) {
      const body = e.response?.data
      setMessage({ kind: 'err', text: typeof body === 'string' ? body : body?.message || 'Enrollment failed' })
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    if (enrollCode.length < 6) return
    setBusy(true)
    setMessage(null)
    try {
      await totpConfirm(enrollCode)
      setMessage({ kind: 'ok', text: '2FA enabled. Reloading…' })
      setEnrollSecret('')
      setEnrollUrl('')
      setEnrollCode('')
      setTimeout(() => window.location.reload(), 800)
    } catch (e: any) {
      const body = e.response?.data
      setMessage({ kind: 'err', text: typeof body === 'string' ? body : body?.message || 'Confirmation failed' })
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    if (disableCode.length < 6) return
    if (!confirm('Disable 2FA for your account?')) return
    setBusy(true)
    setMessage(null)
    try {
      await totpDisable(disableCode)
      setMessage({ kind: 'ok', text: '2FA disabled. Reloading…' })
      setTimeout(() => window.location.reload(), 800)
    } catch (e: any) {
      const body = e.response?.data
      setMessage({ kind: 'err', text: typeof body === 'string' ? body : body?.message || 'Disable failed' })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    getConsentVersion()
      .then((r) => setCurrentVersion(r.data?.current || ''))
      .catch(() => setCurrentVersion(''))
  }, [])

  const consentCurrent = user?.consent_current === true

  const handleAccept = async () => {
    if (!currentVersion) return
    setBusy(true)
    setMessage(null)
    try {
      await acceptConsent(currentVersion)
      setMessage({ kind: 'ok', text: `Consent recorded for version ${currentVersion}. Reloading…` })
      // Force a reload so the AuthContext picks up the updated user.
      setTimeout(() => window.location.reload(), 800)
    } catch (e: any) {
      const body = e.response?.data
      setMessage({
        kind: 'err',
        text: typeof body === 'string' ? body : body?.message || 'Failed to record consent',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm(
      'Revoke privacy consent?\n\n' +
      'You will be logged out. Your existing records will NOT be deleted — request erasure separately if needed.\n\n' +
      'On next login you will need to re-accept the current privacy notice.'
    )) return
    setBusy(true)
    setMessage(null)
    try {
      await revokeConsent()
      logout()
      navigate('/login')
    } catch (e: any) {
      const body = e.response?.data
      setMessage({
        kind: 'err',
        text: typeof body === 'string' ? body : body?.message || 'Failed to revoke consent',
      })
      setBusy(false)
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Account"
        title="Settings"
        subtitle="Your profile, privacy consent, and account actions"
      />

      {message && (
        <div
          className={`fade-up mb-4 p-4 rounded-xl text-sm ${
            message.kind === 'ok'
              ? 'bg-mint-500/10 border border-mint-500/30 text-mint-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-5 md:col-span-2 fade-up" style={{ animationDelay: '150ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">Two-factor authentication</p>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-1.5 h-1.5 rounded-full ${totpEnabled ? 'bg-mint-400' : 'bg-medical-500'}`} />
            <p className="text-white text-sm">{totpEnabled ? 'Enabled (TOTP)' : 'Not enabled'}</p>
          </div>
          <p className="text-medical-400 text-sm">
            Use a TOTP app (Google Authenticator, 1Password, Authy). After you enable 2FA,
            every login will ask for a 6-digit code.
          </p>

          {!totpEnabled && !enrollSecret && (
            <button
              onClick={handleEnroll}
              disabled={busy}
              className="mt-3 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Enable 2FA'}
            </button>
          )}

          {!totpEnabled && enrollSecret && (
            <div className="mt-3 space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-medical-300 text-xs uppercase tracking-wider mb-1">Step 1: add to your app</p>
                <p className="text-cyan-300 text-xs font-mono break-all">{enrollUrl}</p>
                <p className="text-medical-400 text-xs mt-2">
                  Or type this base32 secret manually:
                </p>
                <p className="text-white text-sm font-mono tracking-wider mt-1">{enrollSecret}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-medical-300 text-xs uppercase tracking-wider mb-2">Step 2: confirm a code</p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))}
                  className="w-40 px-3 py-2 bg-white/5 border border-cyan-400/40 rounded-xl text-white font-mono tracking-[0.4em] text-center focus:outline-none focus:border-cyan-400"
                  placeholder="123456"
                  autoFocus
                />
                <button
                  onClick={handleConfirm}
                  disabled={busy || enrollCode.length < 6}
                  className="ml-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Confirm'}
                </button>
                <button
                  onClick={() => { setEnrollSecret(''); setEnrollUrl(''); setEnrollCode('') }}
                  className="ml-2 px-3 py-2 text-medical-400 hover:text-medical-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {totpEnabled && (
            <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-medical-300 text-xs uppercase tracking-wider mb-2">Disable 2FA</p>
              <p className="text-medical-500 text-xs mb-2">
                You must enter a current code so a stolen session can't disable this silently.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                className="w-40 px-3 py-2 bg-white/5 border border-red-400/40 rounded-xl text-white font-mono tracking-[0.4em] text-center focus:outline-none focus:border-red-400"
                placeholder="123456"
              />
              <button
                onClick={handleDisable}
                disabled={busy || disableCode.length < 6}
                className="ml-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl hover:bg-red-500/20 disabled:opacity-50"
              >
                {busy ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
          )}
        </div>

        <div className="glass-card p-5 md:col-span-2 fade-up" style={{ animationDelay: '170ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Active sessions</p>
          {sessions.length === 0 ? (
            <p className="text-medical-500 text-sm">No sessions recorded yet.</p>
          ) : (
            <ul className="divide-y divide-white/5 max-h-48 overflow-y-auto">
              {sessions.map((s) => {
                const isCurrent = s.id === currentSessionId
                const isRevoked = !!s.revoked_at
                return (
                  <li key={s.id} className="py-2 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs flex items-center gap-2">
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border bg-mint-500/10 text-mint-300 border-mint-500/30">
                            this device
                          </span>
                        )}
                        {isRevoked && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] uppercase tracking-wider border bg-medical-500/10 text-medical-400 border-white/10">
                            revoked
                          </span>
                        )}
                        <span className="font-mono text-xs truncate" title={s.user_agent || ''}>
                          {s.user_agent ? s.user_agent.slice(0, 60) : 'unknown device'}
                        </span>
                      </p>
                      <p className="text-medical-500 text-[10px] mt-1">
                        {s.ip_address && <>IP <span className="font-mono">{s.ip_address}</span> · </>}
                        started {new Date(s.created_at).toLocaleString()}
                        {s.revoked_at && <> · revoked {new Date(s.revoked_at).toLocaleString()}</>}
                      </p>
                    </div>
                    {!isRevoked && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="shrink-0 text-red-400 hover:text-red-300 text-xs"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {user?.role === 'patient' && (
          <div className="glass-card p-5 md:col-span-2 fade-up" style={{ animationDelay: '180ms' }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">Right to erasure</p>
            <p className="text-medical-300 text-sm">
              Request deletion of your account and patient profile. An admin reviews the
              request; on approval your data is soft-deleted and no longer visible in the
              system.
            </p>
            <p className="text-amber-300/80 text-xs mt-2">
              Existing on-chain record hashes are immutable and cannot be removed. Off-chain PHI is suppressed from all reads.
            </p>
            <button
              onClick={async () => {
                const reason = prompt('Optional: reason for erasure request') ?? undefined
                if (reason === undefined) return
                try {
                  await requestErasure(reason || undefined)
                  setMessage({ kind: 'ok', text: 'Erasure request submitted. An admin will review it.' })
                } catch (e: any) {
                  const body = e.response?.data
                  setMessage({
                    kind: 'err',
                    text: typeof body === 'string' ? body : body?.message || 'Failed to submit request',
                  })
                }
              }}
              className="mt-3 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl hover:bg-red-500/20"
            >
              Request erasure…
            </button>
          </div>
        )}

        <div className="glass-card p-5 fade-up" style={{ animationDelay: '60ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Profile</p>
          <dl className="space-y-2 text-sm">
            <Row label="Name" value={`${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || '—'} />
            <Row label="Email" value={user?.email ?? '—'} mono />
            <Row label="Role" value={user?.role ?? '—'} />
            <Row label="User ID" value={user?.id ?? '—'} mono truncate />
          </dl>
        </div>

        <div className="glass-card p-5 fade-up" style={{ animationDelay: '120ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Privacy consent</p>
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                consentCurrent ? 'bg-mint-400' : 'bg-red-400'
              }`}
            />
            <p className="text-white text-sm">
              {consentCurrent
                ? 'Accepted current privacy notice'
                : 'Consent required — notice updated or revoked'}
            </p>
          </div>
          <p className="text-medical-400 text-xs">
            Current policy version:{' '}
            <span className="text-cyan-300 font-mono">{currentVersion || '…'}</span>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {!consentCurrent && (
              <button
                onClick={handleAccept}
                disabled={busy || !currentVersion}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Accept current notice'}
              </button>
            )}
            <button
              onClick={handleRevoke}
              disabled={busy}
              className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl hover:bg-red-500/20 disabled:opacity-50"
            >
              Revoke consent
            </button>
          </div>
          <p className="text-medical-500 text-[10px] mt-3">
            Revoking consent logs you out and clears your acceptance. Existing records are not deleted —
            request erasure separately.
          </p>
        </div>
      </div>
    </Layout>
  )
}

function Row({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-medical-500 text-xs uppercase tracking-wider shrink-0">{label}</dt>
      <dd className={`text-medical-100 text-right min-w-0 ${mono ? 'font-mono text-xs' : ''} ${truncate ? 'truncate' : 'break-all'}`}>{value}</dd>
    </div>
  )
}
