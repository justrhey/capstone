/**
 * Single source of truth for Stellar Soroban contract IDs and network params.
 *
 * Reads from build-time `import.meta.env.VITE_*`. Add the corresponding entries
 * to `frontend/.env` (gitignored) — see `.env.example`.
 */
const required = (name: string): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  if (!v || v.length === 0) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    )
  }
  return v
}

export const CONTRACTS = {
  recordRegistry: {
    label: 'Record Registry',
    id: required('VITE_RECORD_REGISTRY_CONTRACT_ID'),
  },
  accessManager: {
    label: 'Access Manager',
    id: required('VITE_ACCESS_MANAGER_CONTRACT_ID'),
  },
  auditTrail: {
    label: 'Audit Trail',
    id: required('VITE_AUDIT_TRAIL_CONTRACT_ID'),
  },
} as const

export const STELLAR = {
  rpcUrl:
    import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ??
    'Test SDF Network ; September 2015',
  network: 'Stellar Testnet',
  explorer:
    import.meta.env.VITE_STELLAR_EXPLORER ??
    'https://stellar.expert/explorer/testnet',
} as const
