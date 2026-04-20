import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPatients } from '../services/api'

interface SearchHit {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search
  useEffect(() => {
    const needle = q.trim()
    if (needle.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchPatients(needle)
        setHits(res.data?.results || [])
        setActiveIdx(0)
      } catch {
        setHits([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const pick = (h: SearchHit) => {
    setOpen(false)
    setQ('')
    // Stash recent-viewed in sessionStorage for future use (OPS-6 "recently viewed")
    try {
      const raw = sessionStorage.getItem('recentPatients')
      const prev: SearchHit[] = raw ? JSON.parse(raw) : []
      const next = [h, ...prev.filter((p) => p.id !== h.id)].slice(0, 5)
      sessionStorage.setItem('recentPatients', JSON.stringify(next))
    } catch {}
    navigate(`/patients?focus=${h.id}`)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (hits[activeIdx]) pick(hits[activeIdx])
    }
  }

  let recent: SearchHit[] = []
  try {
    const raw = sessionStorage.getItem('recentPatients')
    recent = raw ? JSON.parse(raw) : []
  } catch {}

  return (
    <div ref={boxRef} className="relative w-72">
      <div
        className="flex items-center gap-2 px-2.5 py-1.5"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline-2)',
          borderRadius: '2px',
        }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--ink-muted)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search patients…"
          className="flex-1 text-[13px]"
          style={{ background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
        />
        <span
          className="text-[10px] font-mono px-1.5 py-0.5"
          style={{ color: 'var(--ink-muted)', border: '1px solid var(--hairline)', borderRadius: '2px' }}
        >
          ⌘K
        </span>
      </div>

      {open && (q.trim().length >= 2 || recent.length > 0) && (
        <div
          className="absolute right-0 mt-1.5 w-80 overflow-hidden z-50"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline-2)',
            borderRadius: '3px',
            boxShadow: '0 4px 16px rgba(14, 26, 36, 0.08)',
          }}
        >
          {q.trim().length >= 2 ? (
            <>
              <p className="chart-label px-3 pt-2.5 pb-1.5">
                {loading ? 'Searching…' : `Results · ${hits.length}`}
              </p>
              {hits.length === 0 && !loading && (
                <p className="px-3 py-3 text-[13px]" style={{ color: 'var(--ink-muted)' }}>No matches.</p>
              )}
              <ul className="max-h-72 overflow-auto">
                {hits.map((h, i) => (
                  <li key={h.id}>
                    <button
                      onClick={() => pick(h)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className="w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-3"
                      style={{
                        background: i === activeIdx ? 'var(--accent-wash)' : 'transparent',
                        color: 'var(--ink)',
                        borderLeft: i === activeIdx ? '2px solid var(--accent)' : '2px solid transparent',
                      }}
                    >
                      <span className="truncate">
                        {h.first_name} {h.last_name}
                      </span>
                      <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--ink-faint)' }}>
                        {h.id.slice(0, 8)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="chart-label px-3 pt-2.5 pb-1.5">Recently viewed</p>
              <ul>
                {recent.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => pick(h)}
                      className="w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-3 transition-colors"
                      style={{ color: 'var(--ink)' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-wash)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
                    >
                      <span className="truncate">
                        {h.first_name} {h.last_name}
                      </span>
                      <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--ink-faint)' }}>
                        {h.id.slice(0, 8)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
