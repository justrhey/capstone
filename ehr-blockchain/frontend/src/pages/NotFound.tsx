import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white">404</h1>
        <p className="text-xl text-medical-400 mt-4">Page not found</p>
        <Link to="/dashboard" className="mt-6 inline-block text-cyan-400 hover:text-cyan-300 transition-colors">
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}