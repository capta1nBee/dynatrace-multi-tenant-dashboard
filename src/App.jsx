import { useState, useEffect } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import { brandingAPI } from './api/branding'
import { authConfigAPI } from './api/authConfig'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [branding, setBranding] = useState(null)
  const [authConfig, setAuthConfig] = useState(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    loadAppConfig()
  }, [])

  const loadAppConfig = async () => {
    try {
      // Load branding
      const brandingRes = await brandingAPI.getBranding()
      setBranding(brandingRes.data)

      // Load auth config
      const authRes = await authConfigAPI.getConfig()
      setAuthConfig(authRes.data)
    } catch (err) {
      console.error('Failed to load app config:', err)
    }

    // Check authentication
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      setIsAuthenticated(true)
      setUser(JSON.parse(userData))
    }
    setLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setIsAuthenticated(false)
    setUser(null)
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  const navbarStyle = branding ? {
    background: `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`,
  } : {}

  const handleShowLogin = () => {
    setShowLoginModal(true)
  }

  const handleCloseLogin = () => {
    setShowLoginModal(false)
  }

  return (
    <div className="app">
      <nav className="navbar" style={navbarStyle}>
        <div className="navbar-brand">
          {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" className="navbar-logo" />}
          <span>{branding?.dashboardTitle || 'Dynatrace Multi-Tenant Monitor'}</span>
        </div>
        <div className="navbar-right">
          {isAuthenticated ? (
            <button onClick={handleLogout} className="navbar-logout-btn">
              🚪 Logout
            </button>
          ) : (
            <button onClick={handleShowLogin} className="navbar-login-btn">
              🔐 Login
            </button>
          )}
        </div>
      </nav>

      {isAuthenticated ? (
        <Dashboard user={user} onLogout={handleLogout} branding={branding} authConfig={authConfig} />
      ) : (
        <>
          <Dashboard user={null} onLogout={handleLogout} branding={branding} authConfig={authConfig} />
          {showLoginModal && (
            <div className="login-modal-overlay">
              <div className="login-modal-content">
                <button className="modal-close-btn" onClick={handleCloseLogin}>✕</button>
                <Login
                  onLoginSuccess={(userData) => {
                    setUser(userData)
                    setIsAuthenticated(true)
                    setShowLoginModal(false)
                  }}
                  branding={branding}
                  authConfig={authConfig}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
