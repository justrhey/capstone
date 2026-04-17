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
                
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </AuthProvider>
    )
}