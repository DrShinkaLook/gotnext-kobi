import { Navigate } from 'react-router-dom'

// The platform sends signed-in users to /home; the app's real home is /courts.
export default function HomePage() {
  return <Navigate to="/courts" replace />
}
