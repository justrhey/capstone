import type { ReactNode } from 'react'

interface PageHeaderProps {
  section: string
  title: string
  subtitle?: string
  actions?: ReactNode
  meta?: ReactNode
}

export default function PageHeader({ section, title, subtitle, actions, meta }: PageHeaderProps) {
  return (
    <div
      className="fade-up mb-7 pb-5"
      style={{ borderBottom: '1px solid var(--hairline)' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="chart-label mb-1.5">{section}</p>
          <h1 className="font-serif text-[28px] leading-tight" style={{ color: 'var(--ink)', fontVariationSettings: "'opsz' 72" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] mt-1" style={{ color: 'var(--ink-muted)', maxWidth: '680px' }}>
              {subtitle}
            </p>
          )}
          {meta && <div className="mt-2.5">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 items-center shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
