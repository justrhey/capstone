import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getPrescriptionReceipt } from '../services/api'

interface Receipt {
  order_id: string
  patient_id: string
  prescriber_user_id: string
  prescriber_name: string
  summary: string
  details: unknown
  issued_at: string
  canonical_payload: string
  signature_algo: string
  signature: string
  verify_instructions: string
}

export default function PrescriptionReceiptPage() {
  const [params, setParams] = useSearchParams()
  const [orderId, setOrderId] = useState(params.get('order') || '')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async (id: string) => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await getPrescriptionReceipt(id)
      setReceipt(res.data as Receipt)
    } catch (e: any) {
      setError(e.response?.data || 'Failed to load receipt')
      setReceipt(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orderId) void load(orderId)
  }, [])

  const apply = () => {
    setParams(orderId ? { order: orderId } : {})
    void load(orderId)
  }

  const download = () => {
    if (!receipt) return
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rx-${receipt.order_id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      <PageHeader
        section="Prescriptions"
        title="Signed Receipt"
        subtitle="HMAC-signed JSON receipt patients can present to any pharmacy"
      />

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">Order ID</p>
        <div className="flex gap-3">
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value.trim())}
            placeholder="Paste a prescription order UUID"
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm font-mono focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={apply}
            disabled={!orderId || loading}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? '…' : 'Fetch'}
          </button>
        </div>
      </div>

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {typeof error === 'string' ? error : 'Failed'}
        </div>
      )}

      {receipt && (
        <section className="glass-card p-5 fade-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Receipt</p>
            <button
              onClick={download}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-xs hover:bg-white/10"
            >
              Download JSON
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Prescriber</p>
              <p className="text-white text-sm">{receipt.prescriber_name}</p>
              <p className="text-medical-500 text-[10px] font-mono mt-1">
                {receipt.prescriber_user_id}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Issued</p>
              <p className="text-white text-sm">
                {new Date(receipt.issued_at).toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Medication</p>
              <p className="text-white text-sm">{receipt.summary}</p>
              {receipt.details ? (
                <pre className="text-medical-400 text-[10px] mt-2 overflow-x-auto">
                  {JSON.stringify(receipt.details, null, 2)}
                </pre>
              ) : null}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Canonical payload</p>
              <p className="text-medical-300 text-[11px] font-mono break-all">
                {receipt.canonical_payload}
              </p>
            </div>
            <div className="bg-mint-500/5 border border-mint-500/20 rounded-xl p-3 md:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-mint-400">
                Signature · {receipt.signature_algo}
              </p>
              <p className="text-mint-300 text-[11px] font-mono break-all">{receipt.signature}</p>
              <p className="text-medical-400 text-xs mt-2">{receipt.verify_instructions}</p>
            </div>
          </div>
        </section>
      )}
    </Layout>
  )
}
