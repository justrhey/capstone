import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Log all requests
api.interceptors.request.use((config) => {
  console.log('API Request:', config.method?.toUpperCase(), config.url)
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Log all responses
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url)
    return response
  },
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data)
    if (error.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (email: string, password: string) => api.post('/api/auth/login', { email, password })
export const register = (data: any) => api.post('/api/auth/register', data)
export const refreshToken = () => api.post('/api/auth/refresh').catch(() => ({ data: null }))

// Patients
export const getPatients = () => api.get('/api/patients')
export const getPatient = (id: string) => api.get(`/api/patients/${id}`)
export const createPatient = (data: any) => api.post('/api/patients', data)
export const createPatientWithAccount = (data: any) => api.post('/api/patients/with-account', data)
export const updatePatient = (id: string, data: any) => api.put(`/api/patients/${id}`, data)
export const deletePatient = (id: string) => api.delete(`/api/patients/${id}`)
export const getMyPatient = () => api.get('/api/patients/me').catch(() => ({ data: [] }))

// Records
export const getRecords = () => api.get('/api/records')
export const getRecord = (id: string) => api.get(`/api/records/${id}`)
export const getRecordsByPatient = (patientId: string) => api.get(`/api/patients/${patientId}/records`)
export const createRecord = (data: any) => api.post('/api/records', data)
export const updateRecord = (id: string, data: any) => api.put(`/api/records/${id}`, data)
export const deleteRecord = (id: string) => api.delete(`/api/records/${id}`)

// Users
export const getAllUsers = () => api.get('/api/users')
export const getStaff = () => api.get('/api/users')
export const createStaff = (data: any) => api.post('/api/auth/register', data)

// Permissions
export const getPermissions = () => api.get('/api/permissions')
export const getPermissionsForPatient = (patientId: string) => api.get(`/api/patients/${patientId}/permissions`)
export const grantPermission = (data: any) => api.post('/api/permissions', data)
export const revokePermission = (id: string) => api.delete(`/api/permissions/${id}`)

// Verify
export const verifyRecord = (recordHash: string) => api.post('/api/verify', { record_hash: recordHash })
export const listTamperedRecords = () => api.get('/api/records/tampered').catch(() => ({ data: { count: 0 } }))
export const getRecordReceipt = (id: string) => api.get(`/api/records/${id}/receipt`)

// Stats
export const getAllRecords = () => api.get('/api/records')

// Audit
export const getAuditLogs = () => api.get('/api/audit/logs').catch(() => ({ data: [] }))
export const getMyAuditHistory = () => api.get('/api/me/audit-history').catch(() => ({ data: [] }))

// Export
export const getMyExport = () => api.get('/api/me/export').catch(() => ({ data: null }))

// Assignments
export const listAssignments = () => api.get('/api/assignments').catch(() => ({ data: [] }))
export const createAssignment = (patient_id: string, staff_user_id: string) => api.post('/api/assignments', { patient_id, staff_user_id })
export const deleteAssignment = (id: string) => api.delete(`/api/assignments/${id}`)

// Appointments
export const listAppointments = () => api.get('/api/appointments').catch(() => ({ data: [] }))
export const bookAppointment = (data: any) => api.post('/api/appointments', data)
export const updateAppointmentStatus = (id: string, status: string, notes?: string) => api.put(`/api/appointments/${id}/status`, { status, notes })

// Problems
export const listPatientProblems = (patientId: string) => api.get(`/api/patients/${patientId}/problems`).catch(() => ({ data: [] }))
export const createProblem = (data: any) => api.post('/api/problems', data)
export const updateProblem = (id: string, data: any) => api.put(`/api/problems/${id}`, data)

// Incidents
export const listIncidents = (unresolvedOnly = false) => api.get(`/api/incidents${unresolvedOnly ? '?unresolved=true' : ''}`).catch(() => ({ data: { incidents: [] } }))
export const resolveIncident = (id: string, note?: string) => api.post(`/api/incidents/${id}/resolve`, { note })

// Erasure
export const listErasureRequests = () => api.get('/api/erasure-requests').catch(() => ({ data: [] }))
export const resolveErasureRequest = (id: string, action: string, note?: string) => api.post(`/api/erasure-requests/${id}/resolve`, { action, note })
export const requestErasure = (reason?: string) => api.post('/api/me/erasure-request', { reason })

// Consent
export const getConsentVersion = () => api.get('/api/auth/consent-version').catch(() => ({ data: { version: '1.0' } }))
export const acceptConsent = (version: string) => api.post('/api/me/accept-consent', { version })
export const revokeConsent = () => api.post('/api/me/revoke-consent')

// 2FA
export const totpEnroll = () => api.post('/api/auth/2fa/enroll')
export const totpConfirm = (code: string) => api.post('/api/auth/2fa/confirm', { code })
export const totpDisable = (code: string) => api.post('/api/auth/2fa/disable', { code })

// Sessions
export const listMySessions = () => api.get('/api/me/sessions').catch(() => ({ data: [] }))
export const revokeMySession = (id: string) => api.post(`/api/me/sessions/${id}/revoke`)

// Break-glass
export const activateBreakGlass = (reason: string) => api.post('/api/auth/break-glass', { reason })
export const listActiveBreakGlass = () => api.get('/api/admin/break-glass/active').catch(() => ({ data: { active_count: 0 } }))

// Orders
export const listRecordOrders = (id: string) => api.get(`/api/records/${id}/orders`).catch(() => ({ data: [] }))
export const createOrder = (id: string, data: any) => api.post(`/api/records/${id}/orders`, data)
export const resolveOrder = (id: string, status: string, note?: string) => api.put(`/api/orders/${id}/status`, { status, note })

export default api