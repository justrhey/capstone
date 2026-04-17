import { useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { verifyLatestOnChain, uuidToBytes32Hex } from '../services/soroban'

interface Receipt {
  record_id: string
  patient_id: string
  version: number
  record_hash: string
  canonical_payload: string
  hash_algorithm: string
  contract_id: string
  network: string
  network_passphrase: string
  rpc_url: string
  tx_hash: string | null
  ledger_timestamp: number | null
  issued_at: string
  verify_instructions: string
}

type Check =
  | { kind: 'idle' }
  | { kind: 'checking'; step: 'hash' | 'chain' }
  | { kind: 'ok'; recomputed: string; chainStatus: string; rpc: string }
  | { kind: 'mismatch'; expected: string; recomputed: string }
  | { kind: 'error'; message: string }

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  const bytes = new Uint8Array(buf)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function VerifyReceipt() {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [check, setCheck] = useState<Check>({ kind: 'idle' })
  const [rawText, setRawText] = useState('')

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      setRawText(text)
      const parsed = JSON.parse(text) as Receipt
      setReceipt(parsed)
      setCheck({ kind: 'idle' })
    } catch (e: any) {
      setCheck({ kind: 'error', message: `Not a valid receipt JSON: ${e.message}` })
    }
  }

  const onPaste = () => {
    try {
      const parsed = JSON.parse(rawText) as Receipt
      setReceipt(parsed)
      setCheck({ kind: 'idle' })
    } catch (e: any) {
      setCheck({ kind: 'error', message: `Not valid JSON: ${e.message}` })
    }
  }

  const runCheck = async () => {
    if (!receipt) return
    // Step 1: re-derive the hash in the browser from the canonical payload.
    setCheck({ kind: 'checking', step: 'hash' })
    let recomputed: string
    try {
      recomputed = await sha256Hex(receipt.canonical_payload)
    } catch (e: any) {
      setCheck({ kind: 'error', message: e.message || 'Local hash failed' })
      return
    }
    if (recomputed !== receipt.record_hash) {
      setCheck({ kind: 'mismatch', expected: receipt.record_hash, recomputed })
      return
    }

    // Step 2: call Soroban RPC directly (no EHR backend). The receipt carries
    // the RPC URL, network passphrase, and contract ID, so the verifier trusts
    // only Stellar — not us.
    setCheck({ kind: 'checking', step: 'chain' })
    try {
      const recordIdHex32 = uuidToBytes32Hex(receipt.record_id)
      const verdict = await verifyLatestOnChain({
        rpcUrl: receipt.rpc_url,
        networkPassphrase: receipt.network_passphrase,
        contractId: receipt.contract_id,
        recordIdHex32,
        recordHashHex: receipt.record_hash,
      })
      setCheck({ kind: 'ok', recomputed, chainStatus: verdict, rpc: receipt.rpc_url })
    } catch (e: any) {
      setCheck({ kind: 'error', message: e.message || 'Chain verification failed' })
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Independent Verify"
        title="Verify a Receipt"
        subtitle="Drop a record receipt JSON here to recompute its hash and cross-check against the blockchain"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 fade-up" style={{ animationDelay: '80ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Step 1 · Load receipt</p>
          <label className="block">
            <div className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center hover:border-cyan-400/40 transition-colors cursor-pointer">
              <svg className="w-8 h-8 mx-auto text-medical-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
              </svg>
              <p className="text-medical-300 text-sm">Click to upload a receipt file</p>
              <p className="text-medical-500 text-xs mt-1">.json</p>
            </div>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
              }}
            />
          </label>

          <p className="text-medical-500 text-xs uppercase tracking-wider mt-5 mb-2">Or paste JSON</p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder='{"record_id":"…", …}'
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-xs resize-none focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={onPaste}
            disabled={!rawText.trim()}
            className="mt-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-medical-200 hover:bg-white/10 disabled:opacity-50"
          >
            Parse
          </button>
        </div>

        <div className="glass-card p-6 fade-up" style={{ animationDelay: '140ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Step 2 · Inspect</p>
          {receipt ? (
            <dl className="space-y-2 text-sm">
              <Row label="Record ID" value={receipt.record_id} mono />
              <Row label="Version" value={receipt.version === 0 ? 'check chain for current' : String(receipt.version)} />
              <Row label="Hash (SHA-256)" value={receipt.record_hash} mono truncate />
              <Row label="Contract" value={receipt.contract_id} mono truncate />
              <Row label="Network" value={receipt.network} />
              <Row label="Issued" value={new Date(receipt.issued_at).toLocaleString()} />
              {receipt.tx_hash && <Row label="TX hash" value={receipt.tx_hash} mono truncate />}
              <div className="pt-3 border-t border-white/5">
                <p className="text-medical-500 text-xs uppercase tracking-wider">Canonical payload</p>
                <pre className="text-medical-200 text-xs mt-1 whitespace-pre-wrap break-words bg-white/5 p-3 rounded-lg border border-white/5 font-mono">
{receipt.canonical_payload}
                </pre>
                <p className="text-amber-300/80 text-[10px] mt-1.5">⚠ This is your medical data in plaintext. Store the receipt securely.</p>
              </div>
            </dl>
          ) : (
            <p className="text-medical-500 text-sm">No receipt loaded yet.</p>
          )}
        </div>

        <div className="glass-card p-6 fade-up lg:col-span-2" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Step 3 · Verify</p>
              <p className="text-white text-sm mt-0.5">Recompute the hash locally, then cross-check the blockchain</p>
            </div>
            <button
              onClick={runCheck}
              disabled={!receipt || check.kind === 'checking'}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {check.kind === 'checking'
                ? check.step === 'hash'
                  ? 'Hashing…'
                  : 'Calling Soroban RPC…'
                : 'Run check'}
            </button>
          </div>

          {check.kind === 'idle' && (
            <p className="text-medical-500 text-sm">Load a receipt and click Run check.</p>
          )}
          {check.kind === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {check.message}
            </div>
          )}
          {check.kind === 'mismatch' && (
            <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl">
              <p className="text-red-300 font-semibold">Hash mismatch — receipt is inconsistent</p>
              <p className="text-red-200/80 text-xs mt-2">
                Recomputing SHA-256 of the canonical payload did not produce the hash stated in the receipt.
                This means either the receipt was tampered with, or the canonical payload was edited after the receipt was issued.
              </p>
              <div className="mt-3 text-xs font-mono space-y-1">
                <p><span className="text-medical-500">expected </span><span className="text-red-300">{check.expected}</span></p>
                <p><span className="text-medical-500">got      </span><span className="text-red-300">{check.recomputed}</span></p>
              </div>
            </div>
          )}
          {check.kind === 'ok' && (
            <div
              className={`p-4 rounded-xl border ${
                check.chainStatus === 'intact'
                  ? 'bg-mint-500/10 border-mint-500/40'
                  : check.chainStatus === 'tampered'
                    ? 'bg-red-500/10 border-red-500/40'
                    : 'bg-amber-500/10 border-amber-400/40'
              }`}
            >
              <p
                className={`font-semibold ${
                  check.chainStatus === 'intact'
                    ? 'text-mint-300'
                    : check.chainStatus === 'tampered'
                      ? 'text-red-300'
                      : 'text-amber-300'
                }`}
              >
                Local hash ✓ · chain says <span className="font-mono">{check.chainStatus}</span>
              </p>
              <ul className="text-medical-300 text-xs mt-2 space-y-1">
                <li>
                  <span className="text-medical-500">Browser SHA-256 of canonical_payload → matches receipt hash.</span>
                </li>
                <li>
                  <span className="text-medical-500">Soroban RPC </span>
                  <span className="font-mono">{check.rpc}</span>
                  <span className="text-medical-500">
                    {' '}returned <span className="font-mono">verify_latest = {check.chainStatus === 'intact' ? 'true' : 'false'}</span>.
                  </span>
                </li>
              </ul>
              <p className="text-mint-200/80 text-[10px] mt-3">
                Fully trustless: no EHR backend was called. The verification chain is: receipt JSON → browser SHA-256 → public Stellar Soroban RPC.
              </p>
            </div>
          )}
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
