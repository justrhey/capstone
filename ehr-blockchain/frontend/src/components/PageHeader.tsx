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
    <div className="fade-up accent-rail pl-5 mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-medical-500 text-[11px] uppercase tracking-[0.3em]">{section}</p>
          <h1 className="text-3xl font-semibold text-white mt-1">{title}</h1>
          {subtitle && <p className="text-medical-400 text-sm mt-1.5">{subtitle}</p>}
          {meta && <div className="mt-3">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 items-center">{actions}</div>}
      </div>
    </div>
  )
}
