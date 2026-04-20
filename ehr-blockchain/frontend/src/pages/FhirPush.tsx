import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { getPatients, stageFhirPush } from '../services/api'

interface Patient {
  id: string
  first_name: string | null
  last_name: string | null
}

export default function FhirPush() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState('')
  const [endpoint, setEndpoint] = useState('https://')
  const [staging, setStaging] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getPatients()
      .then((r) => setPatients(r.data || []))
      .catch(() => setPatients([]))
  }, [])

  const handleStage = async () => {
    if (!patientId || !/^https?:\/\//.test(endpoint)) return
    setStaging(true)
    setError('')
    try {
      const res = await stageFhirPush({ patient_id: patientId, endpoint })
      setResult(res.data)
    } catch (e: any) {
      setError(e.response?.data || 'Stage failed')
    } finally {
      setStaging(false)
    }
  }

  const saveBundle = () => {
    if (!result?.bundle) return
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], {
      type: 'application/fhir+json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bundle.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      <PageHeader
        section="Integrations"
        title="FHIR Outbound"
        subtitle="Stage a patient Bundle for push to an external FHIR server"
      />

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-400/50 [&>option]:bg-slate-800"
          >
            <option value="">— select patient —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://fhir-receiver.example.com/Bundle"
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm font-mono focus:outline-none focus:border-cyan-400/50"
          />
        </div>
        <button
          onClick={handleStage}
          disabled={staging || !patientId || !/^https?:\/\//.test(endpoint)}
          className="mt-3 px-4 py-2 bg-gradient-to-r from-cyan-500 to-mint-500 text-white rounded-xl font-medium disabled:opacity-50"
        >
          {staging ? 'Staging…' : 'Stage bundle'}
        </button>
        <p className="text-medical-600 text-[10px] mt-2">
          Server does not perform the outbound call. Download the bundle and paste the curl command
          into a terminal to audit the transfer yourself.
        </p>
      </div>

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {typeof error === 'string' ? error : 'Failed'}
        </div>
      )}

      {result && (
        <section className="glass-card p-5 fade-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500">Staged</p>
            <button
              onClick={saveBundle}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-xs hover:bg-white/10"
            >
              Download bundle.json
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Target</p>
              <p className="text-white text-xs font-mono truncate" title={result.endpoint}>
                {result.endpoint}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Size</p>
              <p className="text-white text-xs font-mono">{result.bytes.toLocaleString()} bytes</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500">Entries</p>
              <p className="text-white text-xs font-mono">
                {result.bundle?.entry?.length ?? 0}
              </p>
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-medical-500 mb-2">
            Ready-to-run command
          </p>
          <pre className="bg-black/40 border border-white/10 rounded-xl p-3 text-mint-300 text-xs font-mono overflow-x-auto">
{result.curl}
          </pre>
        </section>
      )}
    </Layout>
  )
}
