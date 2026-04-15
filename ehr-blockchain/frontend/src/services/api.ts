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
export const updatePatient = (id: string, data: { first_name?: string; last_name?: string; date_of_birth?: string; sex?: string }) => api.put(`/api/patients/${id}`, data)
export const deletePatient = (id: string) => api.delete(`/api/patients/${id}`)

// Records
export const getRecords = () => api.get('/api/records')
export const getRecord = (id: string) => api.get(`/api/records/${id}`)
export const getRecordsByPatient = (patientId: string) => api.get(`/api/patients/${patientId}/records`)
export const createRecord = (data: { patient_id: string; diagnosis?: string; treatment?: string; notes?: string; medications?: Array<{ name: string; dosage: string; frequency: string }>; allergies?: Array<{ allergen: string; severity: string }> }) => api.post('/api/records', data)
export const updateRecord = (id: string, data: { diagnosis?: string; treatment?: string; notes?: string; medications?: Array<{ name: string; dosage: string; frequency: string }>; allergies?: Array<{ allergen: string; severity: string }> }) => api.put(`/api/records/${id}`, data)
export const deleteRecord = (id: string) => api.delete(`/api/records/${id}`)

// Audit
export const getAuditLogs = () => api.get('/api/audit/logs')

// Verify
export const verifyRecord = (recordHash: string) => api.post('/api/verify', { record_hash: recordHash })

// Stats
export const getAllRecords = () => api.get('/api/records')
export const getAllUsers = () => api.get('/api/users')

export default api