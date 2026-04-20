import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import Records from './pages/Records'
import MyRecords from './pages/MyRecords'
import Permissions from './pages/Permissions'
import AuditLogs from './pages/AuditLogs'
import CreateStaff from './pages/CreateStaff'
import Staff from './pages/Staff'
import VerifyReceipt from './pages/VerifyReceipt'
import BlockchainExplorer from './pages/BlockchainExplorer'
import AccessHistory from './pages/AccessHistory'
import Settings from './pages/Settings'
import ErasureQueue from './pages/ErasureQueue'
import Assignments from './pages/Assignments'
import Problems from './pages/Problems'
import Appointments from './pages/Appointments'
import Immunizations from './pages/Immunizations'
import Medications from './pages/Medications'
import Referrals from './pages/Referrals'
import Reports from './pages/Reports'
import CdsCheck from './pages/CdsCheck'
import Attachments from './pages/Attachments'
import Messages from './pages/Messages'
import PopulationHealth from './pages/PopulationHealth'
import FhirPush from './pages/FhirPush'
import PrescriptionReceipt from './pages/PrescriptionReceipt'
import NotFound from './pages/NotFound'

export default function App() {
    return (
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/patients"
                    element={
                        <ProtectedRoute roles={['doctor', 'nurse', 'admin']}>
                            <Patients />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/records"
                    element={
                        <ProtectedRoute roles={['doctor', 'nurse', 'admin']}>
                            <Records />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/my-records"
                    element={
                        <ProtectedRoute roles={['patient']}>
                            <MyRecords />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/permissions"
                    element={
                        <ProtectedRoute roles={['patient']}>
                            <Permissions />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/audit"
                    element={
                        <ProtectedRoute roles={['admin', 'auditor']}>
                            <AuditLogs />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/create-staff"
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <CreateStaff />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/staff"
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <Staff />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/verify-receipt"
                    element={
                        <ProtectedRoute>
                            <VerifyReceipt />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/blockchain"
                    element={
                        <ProtectedRoute roles={['admin', 'auditor']}>
                            <BlockchainExplorer />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/access-history"
                    element={
                        <ProtectedRoute roles={['patient']}>
                            <AccessHistory />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <Settings />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/erasure"
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <ErasureQueue />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/assignments"
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <Assignments />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/problems"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Problems />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/appointments"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Appointments />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/immunizations"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Immunizations />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/medications"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Medications />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/referrals"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Referrals />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/reports"
                    element={
                        <ProtectedRoute roles={['admin', 'auditor']}>
                            <Reports />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/cds"
                    element={
                        <ProtectedRoute roles={['doctor', 'nurse']}>
                            <CdsCheck />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/attachments"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Attachments />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/messages"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <Messages />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/population"
                    element={
                        <ProtectedRoute roles={['admin', 'auditor']}>
                            <PopulationHealth />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/fhir-push"
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <FhirPush />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/prescription-receipt"
                    element={
                        <ProtectedRoute roles={['patient', 'doctor', 'nurse', 'admin']}>
                            <PrescriptionReceipt />
                        </ProtectedRoute>
                    }
                />

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </AuthProvider>
    )
}