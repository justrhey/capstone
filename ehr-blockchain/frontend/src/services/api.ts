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
      const url: string = error.config?.url || ''
      const isAuthEndpoint = url.includes('/api/auth/')
      if (!isAuthEndpoint) {
        window.dispatchEvent(new Event('auth:expired'))
      }
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (email: string, password: string) => api.post('/api/auth/login', { email, password })
export const register = (data: { email: string; password: string; first_name: string; last_name: string; role: string }) => api.post('/api/auth/register', data)
export const refreshToken = () => api.post('/api/auth/refresh')
export const getConsentVersion = () => api.get('/api/auth/consent-version')
export const acceptConsent = (consent_version: string) => api.post('/api/me/accept-consent', { consent_version })
export const revokeConsent = () => api.post('/api/me/revoke-consent')

// 2FA (TOTP)
export const totpEnroll = () => api.post('/api/auth/2fa/enroll')
export const totpConfirm = (code: string) => api.post('/api/auth/2fa/confirm', { code })
export const totpDisable = (code: string) => api.post('/api/auth/2fa/disable', { code })

// Sessions (SEC-2)
export const listMySessions = () => api.get('/api/me/sessions')
export const revokeMySession = (id: string) => api.post(`/api/me/sessions/${id}/revoke`)

// Break-glass (SEC-3)
export const activateBreakGlass = (reason: string) => api.post('/api/auth/break-glass', { reason })
export const listActiveBreakGlass = () => api.get('/api/admin/break-glass/active')

// Patient assignments (SEC-4)
export const listAssignments = () => api.get('/api/assignments')
export const createAssignment = (patient_id: string, staff_user_id: string) =>
  api.post('/api/assignments', { patient_id, staff_user_id })
export const deleteAssignment = (id: string) => api.delete(`/api/assignments/${id}`)

// Patients
export const getPatients = () => api.get('/api/patients')
export const getMyPatient = () => api.get('/api/patients/me')
export const getPatient = (id: string) => api.get(`/api/patients/${id}`)
export const createPatient = (data: { first_name: string; last_name: string; date_of_birth: string; sex: string; blood_type?: string; contact_number?: string; address?: string }) => api.post('/api/patients', data)
export const createPatientWithAccount = (data: { first_name: string; last_name: string; date_of_birth: string; sex: string; email: string; password: string; blood_type?: string; contact_number?: string; address?: string }) => api.post('/api/patients/with-account', data)
export const updatePatient = (id: string, data: { first_name?: string; last_name?: string; date_of_birth?: string; sex?: string; blood_type?: string; contact_number?: string; address?: string }) => api.put(`/api/patients/${id}`, data)
export const deletePatient = (id: string) => api.delete(`/api/patients/${id}`)

// Records
export const getRecords = () => api.get('/api/records')
export const getRecord = (id: string) => api.get(`/api/records/${id}`)
export const getRecordsByPatient = (patientId: string) => api.get(`/api/patients/${patientId}/records`)
export const createRecord = (data: { patient_id: string; subjective?: string; objective?: string; assessment?: string; plan?: string; medications?: Array<{ name: string; dosage: string; frequency: string }>; allergies?: Array<{ allergen: string; severity: string }>; vitals?: Array<{ kind: string; value: number; unit: string }> }) => api.post('/api/records', data)
export const updateRecord = (id: string, data: { subjective?: string; objective?: string; assessment?: string; plan?: string; medications?: Array<{ name: string; dosage: string; frequency: string }>; allergies?: Array<{ allergen: string; severity: string }> }) => api.put(`/api/records/${id}`, data)
export const deleteRecord = (id: string) => api.delete(`/api/records/${id}`)

// Audit
export const getAuditLogs = () => api.get('/api/audit/logs')
export const getMyAuditHistory = () => api.get('/api/me/audit-history')

// Orders (CLIN-4)
export const listRecordOrders = (recordId: string) => api.get(`/api/records/${recordId}/orders`)
export const createOrder = (recordId: string, data: { kind: 'lab' | 'imaging' | 'prescription'; summary: string; details?: any }) =>
  api.post(`/api/records/${recordId}/orders`, data)
export const resolveOrder = (orderId: string, status: 'fulfilled' | 'cancelled', note?: string) =>
  api.put(`/api/orders/${orderId}/status`, { status, note })

// Appointments (CLIN-5)
export const listAppointments = () => api.get('/api/appointments')
export const bookAppointment = (data: { patient_id?: string; staff_user_id: string; start_at: string; duration_minutes?: number; reason?: string }) =>
  api.post('/api/appointments', data)
export const updateAppointmentStatus = (id: string, status: 'completed' | 'cancelled' | 'no_show', notes?: string) =>
  api.put(`/api/appointments/${id}/status`, { status, notes })

// Problems (CLIN-3)
export const listPatientProblems = (patientId: string) => api.get(`/api/patients/${patientId}/problems`)
export const createProblem = (data: { patient_id: string; description: string; code?: string; onset_at?: string }) => api.post('/api/problems', data)
export const updateProblem = (id: string, data: { status?: string; resolved_at?: string; description?: string; code?: string }) => api.put(`/api/problems/${id}`, data)

// Data-portability export (FHIR R4 Bundle)
export const getMyExport = () => api.get('/api/me/export')

// Incidents (admin/auditor)
export const listIncidents = (unresolvedOnly = false) =>
  api.get(`/api/incidents${unresolvedOnly ? '?unresolved=true' : ''}`)
export const resolveIncident = (id: string, note?: string) =>
  api.post(`/api/incidents/${id}/resolve`, { note })

// Right-to-erasure (GDPR Art. 17)
export const requestErasure = (reason?: string) => api.post('/api/me/erasure-request', { reason })
export const listErasureRequests = () => api.get('/api/erasure-requests')
export const resolveErasureRequest = (id: string, action: 'approve' | 'decline', note?: string) =>
  api.post(`/api/erasure-requests/${id}/resolve`, { action, note })

// Verify
export const verifyRecord = (recordId: string) => api.post('/api/verify', { record_id: recordId })
export const listTamperedRecords = () => api.get('/api/records/tampered')
export const getRecordReceipt = (recordId: string) => api.get(`/api/records/${recordId}/receipt`)

// Permissions
export const getPermissions = () => api.get('/api/permissions')
export const getPermissionsForPatient = (patientId: string) => api.get(`/api/patients/${patientId}/permissions`)
export const grantPermission = (data: { patient_id: string; granted_to: string; record_id?: string; permission_type: 'read' | 'write'; expires_at?: string }) => api.post('/api/permissions', data)
export const revokePermission = (id: string) => api.delete(`/api/permissions/${id}`)

// Stats
export const getAllRecords = () => api.get('/api/records')
export const getAllUsers = () => api.get('/api/users')
export const getStaff = () => api.get('/api/users/staff')
export const createStaff = (data: { email: string; password: string; role: 'doctor' | 'nurse' | 'auditor' | 'admin'; first_name: string; last_name: string }) => api.post('/api/users/staff', data)

export default api