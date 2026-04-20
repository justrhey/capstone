// EXT-7: Minimal i18n. Two locales: English (source) and Filipino. Keys are
// phrased as-if English; the English table is a pass-through so we can add
// locales without refactoring call sites.

export type Locale = 'en' | 'fil'

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
]

const tables: Record<Locale, Record<string, string>> = {
  en: {},
  fil: {
    // Navigation
    'Dashboard': 'Dashboard',
    'Patients': 'Mga Pasyente',
    'Records': 'Mga Rekord',
    'Problem List': 'Listahan ng Problema',
    'Medications': 'Mga Gamot',
    'Immunizations': 'Mga Bakuna',
    'Appointments': 'Mga Appointment',
    'Referrals': 'Mga Referral',
    'CDS Check': 'CDS Check',
    'Attachments': 'Mga Attachment',
    'Reports': 'Mga Ulat',
    'Messages': 'Mga Mensahe',
    'My Records': 'Aking Mga Rekord',
    'Access History': 'Kasaysayan ng Access',
    'Permissions': 'Mga Pahintulot',
    'Audit Logs': 'Audit Logs',
    'Blockchain': 'Blockchain',
    'Staff': 'Staff',
    'Create Staff': 'Gumawa ng Staff',
    'Erasure Queue': 'Erasure Queue',
    'Assignments': 'Mga Assignment',
    'Verify Receipt': 'I-verify ang Resibo',
    'Settings': 'Mga Setting',

    // Common UI
    'Sign Out': 'Mag-sign Out',
    'Refresh': 'I-refresh',
    'Connected': 'Konektado',
    'Search patients…': 'Maghanap ng pasyente…',
    'Loading…': 'Naglo-load…',
    'Save': 'I-save',
    'Cancel': 'Kanselahin',
    'Send': 'Ipadala',
    'Delete': 'Burahin',
    'Edit': 'I-edit',
    'Close': 'Isara',
  },
}

let current: Locale = (typeof window !== 'undefined'
  ? (localStorage.getItem('locale') as Locale)
  : null) || 'en'

const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function setLocale(loc: Locale) {
  current = loc
  try {
    localStorage.setItem('locale', loc)
  } catch {}
  listeners.forEach((fn) => fn())
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Translate a string key. Falls through to the key itself when no entry. */
export function t(key: string): string {
  const table = tables[current]
  return (table && table[key]) || key
}
