import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK = 'Stellar Testnet'
const STELLAR_EXPERT = 'https://stellar.expert/explorer/testnet'

const CONTRACTS = {
  recordRegistry: {
    label: 'Record Registry',
    id: 'CCL5QJQHIY2WP637HMJQ5NGIHDFK7ET2FPSDZAPPNDQSUC63HO23VNDD',
  },
  accessManager: {
    label: 'Access Manager',
    id: 'CAQF6LCVGDOZXHXZMADFHB6EL5ELRGJAHZKFPLVEJM75PRIKQCD7XUJ2',
  },
  auditTrail: {
    label: 'Audit Trail',
    id: 'CAIXRA5QQTJOF5HFMBLZA3BXFKMTIM7JVJBKYPLKDO2HJOMSSPGLOMKN',
  },
} as const

/** UUID → 32-byte hex, matching backend `uuid_to_bytes32_hex`. UUID bytes in the
 * first 16, zero-padded tail. */
function uuidToBytes32Hex(uuid: string): string {
  const hex = uuid.replace(/-/g, '').toLowerCase()
  if (hex.length !== 32 || !/^[0-9a-f]+$/.test(hex)) {
    return '00'.repeat(32)
  }
  return hex + '00'.repeat(16)
}

/** Raw JSON-RPC call to Soroban RPC. Exposed to show the reader that we are
 * hitting public Stellar infrastructure directly, not our own backend. */
async function rpcCall(method: string, params: any): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`)
  return res.json()
}

type TabKey = 'records' | 'grants' | 'audit'

export default function BlockchainExplorer() {
  const [latestLedger, setLatestLedger] = useState<number | null>(null)
  const [ledgerTime, setLedgerTime] = useState<string>('')
  const [health, setHealth] = useState<'checking' | 'ok' | 'error'>('checking')
  const [healthError, setHealthError] = useState<string>('')

  const [tab, setTab] = useState<TabKey>('records')
  const [patientId, setPatientId] = useState('')
  const [recordId, setRecordId] = useState('')

  useEffect(() => {
    void refresh()
  }, [])

  const refresh = async () => {
    setHealth('checking')
    setHealthError('')
    try {
      const r = await rpcCall('getLatestLedger', {})
      if (r.error) throw new Error(r.error.message || 'RPC error')
      const seq = r.result?.sequence as number | undefined
      setLatestLedger(seq ?? null)
      setLedgerTime(new Date().toISOString())
      setHealth('ok')
    } catch (e: any) {
      setHealth('error')
      setHealthError(e.message || 'Network error')
    }
  }

  const patientHex = patientId ? uuidToBytes32Hex(patientId) : ''
  const recordHex = recordId ? uuidToBytes32Hex(recordId) : ''

  return (
    <Layout>
      <PageHeader
        section="Chain State"
        title="Blockchain Explorer"
        subtitle="Read contract state directly from Stellar Testnet — no EHR backend calls"
        actions={
          <button
            onClick={refresh}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-sm hover:bg-white/10"
          >
            Refresh ledger
          </button>
        }
      />

      {/* Chain status strip */}
      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Network</p>
            <p className="text-white text-sm mt-0.5">{NETWORK}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">RPC</p>
            <p className="text-cyan-300 text-xs font-mono mt-0.5 truncate" title={RPC_URL}>
              {RPC_URL.replace('https://', '')}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Latest ledger</p>
            <p className="text-white text-sm font-mono mt-0.5">
              {latestLedger !== null ? `#${latestLedger.toLocaleString()}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Status</p>
            <div className="flex items-center gap-2 mt-0.5">
              {health === 'checking' && <span className="text-medical-300 text-sm">Checking…</span>}
              {health === 'ok' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-mint-400 glow-green" />
                  <span className="text-mint-300 text-sm">Live</span>
                  <span className="text-medical-500 text-[10px] ml-2">{ledgerTime.slice(11, 19)}Z</span>
                </>
              )}
              {health === 'error' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-red-300 text-sm">Unreachable</span>
                </>
              )}
            </div>
          </div>
        </div>
        {health === 'error' && healthError && (
          <p className="text-red-300/80 text-xs mt-3">{healthError}</p>
        )}
      </div>

      {/* Contract catalogue */}
      <div className="glass-card p-0 mb-6 overflow-hidden fade-up" style={{ animationDelay: '120ms' }}>
        <div className="px-5 py-3 border-b border-white/5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Deployed contracts</p>
          <p className="text-white text-sm mt-0.5">Click any contract to open it on Stellar Expert</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">
          {(Object.entries(CONTRACTS) as [keyof typeof CONTRACTS, (typeof CONTRACTS)[keyof typeof CONTRACTS]][]).map(
            ([key, c]) => (
              <a
                key={key}
                href={`${STELLAR_EXPERT}/contract/${c.id}`}
                target="_blank"
                rel="noreferrer"
                className="group px-5 py-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 glow-cyan" />
                  <span className="text-white text-sm">{c.label}</span>
                  <span className="ml-auto text-medical-500 group-hover:text-cyan-300">↗</span>
                </div>
                <p className="text-medical-300/80 text-[11px] font-mono mt-2 break-all">
                  {c.id.slice(0, 14)}…{c.id.slice(-8)}
                </p>
              </a>
            )
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="glass-card p-0 fade-up" style={{ animationDelay: '180ms' }}>
        <div className="flex border-b border-white/5">
          {(['records', 'grants', 'audit'] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm capitalize border-b-2 -mb-[2px] transition-colors ${
                tab === t
                  ? 'border-cyan-400 text-cyan-200'
                  : 'border-transparent text-medical-400 hover:text-medical-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'records' && (
            <TabPanel
              title="Record versions for a patient"
              description="Lists every record hash anchored for this patient, including tombstoned versions."
              contract={CONTRACTS.recordRegistry}
              method="get_patient_records"
              idLabel="Patient UUID"
              idValue={patientId}
              onIdChange={setPatientId}
              idHex={patientHex}
              extraDeepLink={
                patientHex
                  ? `${STELLAR_EXPERT}/contract/${CONTRACTS.recordRegistry.id}#storage`
                  : undefined
              }
            />
          )}
          {tab === 'grants' && (
            <TabPanel
              title="Active access grants for a patient"
              description="Lists every on-chain permission tuple for this patient. Expired/revoked grants are still here for audit."
              contract={CONTRACTS.accessManager}
              method="get_patient_permissions"
              idLabel="Patient UUID"
              idValue={patientId}
              onIdChange={setPatientId}
              idHex={patientHex}
              extraDeepLink={
                patientHex
                  ? `${STELLAR_EXPERT}/contract/${CONTRACTS.accessManager.id}#storage`
                  : undefined
              }
            />
          )}
          {tab === 'audit' && (
            <TabPanel
              title="Immutable audit trail for a record"
              description="Lists every on-chain log_access event. Sequence strictly monotonic; timestamps are the authoritative ledger time."
              contract={CONTRACTS.auditTrail}
              method="get_audit_log"
              idLabel="Record UUID"
              idValue={recordId}
              onIdChange={setRecordId}
              idHex={recordHex}
              extraDeepLink={
                recordHex
                  ? `${STELLAR_EXPERT}/contract/${CONTRACTS.auditTrail.id}#storage`
                  : undefined
              }
            />
          )}
        </div>
      </div>

      <p className="text-medical-500 text-xs mt-4 fade-up" style={{ animationDelay: '240ms' }}>
        This page is intentionally backend-agnostic: the ledger sequence is fetched from{' '}
        <span className="text-cyan-300">{RPC_URL}</span> over JSON-RPC, and every "View on Stellar Expert"
        link takes you to a public explorer. A rogue EHR backend cannot forge or hide state on this screen.
      </p>
    </Layout>
  )
}

function TabPanel({
  title,
  description,
  contract,
  method,
  idLabel,
  idValue,
  onIdChange,
  idHex,
  extraDeepLink,
}: {
  title: string
  description: string
  contract: { label: string; id: string }
  method: string
  idLabel: string
  idValue: string
  onIdChange: (v: string) => void
  idHex: string
  extraDeepLink?: string
}) {
  const cliCommand = idHex
    ? `soroban contract invoke \\
  --id ${contract.id} \\
  --network testnet \\
  --source-account admin \\
  -- ${method} --${idLabel.toLowerCase().replace(/\s+uuid$/, '_id')} ${idHex}`
    : ''

  return (
    <div>
      <p className="text-white font-medium">{title}</p>
      <p className="text-medical-400 text-sm mt-1">{description}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">
            {idLabel}
          </label>
          <input
            type="text"
            value={idValue}
            onChange={(e) => onIdChange(e.target.value)}
            placeholder="3775a7d5-fa17-4fc2-bc6a-a1af10af3a14"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-600 focus:outline-none focus:border-cyan-400/50 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">
            BytesN&lt;32&gt; argument
          </label>
          <p className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-cyan-300 font-mono text-[11px] break-all min-h-[38px]">
            {idHex || <span className="text-medical-600">— enter a UUID above —</span>}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`${STELLAR_EXPERT}/contract/${contract.id}`}
          target="_blank"
          rel="noreferrer"
          className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-medical-200 hover:bg-white/10"
        >
          View {contract.label} on Stellar Expert ↗
        </a>
        {extraDeepLink && (
          <a
            href={extraDeepLink}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-sm hover:bg-cyan-500/25"
          >
            Inspect storage ↗
          </a>
        )}
      </div>

      {cliCommand && (
        <div className="mt-4">
          <label className="block text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">
            Or invoke directly with the Soroban CLI
          </label>
          <pre className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-200 text-[11px] font-mono overflow-auto whitespace-pre">
{cliCommand}
          </pre>
        </div>
      )}
    </div>
  )
}
