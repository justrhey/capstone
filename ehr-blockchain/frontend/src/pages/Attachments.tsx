import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import {
  deleteAttachment as apiDelete,
  downloadAttachment,
  listOrderAttachments,
  uploadOrderAttachment,
} from '../services/api'

interface Attachment {
  id: string
  order_id: string | null
  record_id: string | null
  filename: string
  mime_type: string
  size_bytes: number
  content_sha256: string
  uploaded_by: string | null
  uploaded_at: string
}

const ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/dicom',
  'application/dicom',
  'text/plain',
  'text/csv',
  'application/json',
]
const MAX_BYTES = 10 * 1024 * 1024

function formatSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

export default function Attachments() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const isStaff = user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'admin'

  const [orderId, setOrderId] = useState(params.get('order') || '')
  const [rows, setRows] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = async (id: string) => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await listOrderAttachments(id)
      setRows(res.data || [])
    } catch (e: any) {
      setError(e.response?.data || 'Failed to load attachments')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orderId) void load(orderId)
  }, [orderId])

  const apply = () => {
    setParams(orderId ? { order: orderId } : {})
    void load(orderId)
  }

  const handleUpload = async (file: File) => {
    if (!orderId) {
      alert('Enter an order ID first')
      return
    }
    if (!ALLOWED.includes(file.type)) {
      alert(`Mime type ${file.type || 'unknown'} not allowed`)
      return
    }
    if (file.size > MAX_BYTES) {
      alert(`File too large (${formatSize(file.size)}, max 10 MB)`)
      return
    }
    setUploading(true)
    try {
      const content_base64 = await fileToBase64(file)
      await uploadOrderAttachment(orderId, {
        filename: file.name,
        mime_type: file.type,
        content_base64,
      })
      if (fileRef.current) fileRef.current.value = ''
      void load(orderId)
    } catch (e: any) {
      alert(e.response?.data || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (a: Attachment) => {
    try {
      const res = await downloadAttachment(a.id)
      const blob = new Blob([res.data], { type: a.mime_type })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = a.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e.response?.data || 'Download failed')
    }
  }

  const handleDelete = async (a: Attachment) => {
    if (!confirm(`Delete ${a.filename}?`)) return
    try {
      await apiDelete(a.id)
      void load(orderId)
    } catch (e: any) {
      alert(e.response?.data || 'Delete failed')
    }
  }

  return (
    <Layout>
      <PageHeader
        section="Clinical"
        title="Attachments"
        subtitle="Upload lab PDFs, DICOM images, and other order artifacts"
      />

      <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '60ms' }}>
        <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-2">Order ID</p>
        <div className="flex gap-3">
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value.trim())}
            placeholder="Paste an order UUID"
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-medical-500 text-sm font-mono focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={apply}
            disabled={!orderId}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-medical-300 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            Load
          </button>
        </div>
        <p className="text-medical-600 text-[10px] mt-2">
          Tip: open a record and copy the order's UUID to bring its attachments here. Direct
          integration into record views is planned for a later sprint.
        </p>
      </div>

      {isStaff && orderId && (
        <div className="glass-card p-5 mb-6 fade-up" style={{ animationDelay: '120ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">Upload</p>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED.join(',')}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
            className="block w-full text-medical-300 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
          />
          <p className="text-medical-600 text-[10px] mt-2">
            Allowed: PDF, PNG/JPEG, DICOM, plain text, CSV, JSON. Max 10 MB.
          </p>
        </div>
      )}

      {error && (
        <div className="fade-up mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {typeof error === 'string' ? error : 'Failed'}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orderId ? (
        <section className="glass-card p-5 fade-up" style={{ animationDelay: '180ms' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-medical-500 mb-3">
            Files ({rows.length})
          </p>
          {rows.length === 0 ? (
            <p className="text-medical-500 text-sm">No attachments on this order yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((a) => (
                <li key={a.id} className="py-3 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{a.filename}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-[10px]">
                      <span className="text-medical-400">{a.mime_type}</span>
                      <span className="text-medical-500">{formatSize(a.size_bytes)}</span>
                      <span className="text-medical-600 font-mono" title={`sha256 ${a.content_sha256}`}>
                        sha256:{a.content_sha256.slice(0, 10)}…
                      </span>
                      <span className="text-medical-600">
                        {new Date(a.uploaded_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex gap-2">
                    <button
                      onClick={() => handleDownload(a)}
                      className="text-cyan-400 hover:text-cyan-300 text-xs"
                    >
                      Download
                    </button>
                    {isStaff && (
                      <button
                        onClick={() => handleDelete(a)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </Layout>
  )
}
