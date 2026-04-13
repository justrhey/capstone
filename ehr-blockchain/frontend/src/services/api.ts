import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (email: string, password: string) => api.post('/api/auth/login', { email, password })
export const register = (data: { email: string; password: string; first_name: string; last_name: string; role: string }) => api.post('/api/auth/register', data)

// Patients
export const getPatients = () => api.get('/api/patients')
export const getPatient = (id: string) => api.get(`/api/patients/${id}`)
export const createPatient = (data: { first_name: string; last_name: string; date_of_birth: string; sex: string; contact_number?: string; address?: string }) => api.post('/api/patients', data)
export const createPatientWithAccount = (data: { first_name: string; last_name: string; date_of_birth: string; sex: string; email: string; password: string }) => api.post('/api/patients/with-account', data)

// Records
export const getRecordsByPatient = (patientId: string) => api.get(`/api/patients/${patientId}/records`)
export const createRecord = (data: { patient_id: string; diagnosis?: string; treatment?: string; notes?: string; medications?: Array<{ name: string; dosage: string; frequency: string }>; allergies?: Array<{ allergen: string; severity: string }> }) => api.post('/api/records', data)

// Audit
export const getAuditLogs = () => api.get('/api/audit/logs')

// Verify
export const verifyRecord = (recordHash: string) => api.post('/api/verify', { record_hash: recordHash })

export default api