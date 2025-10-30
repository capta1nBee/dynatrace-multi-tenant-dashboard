import { useState } from 'react';
import { authAPI } from '../api/auth';
import '../styles/Auth.css';

export default function Login({ onLoginSuccess, branding, authConfig }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const authType = authConfig?.authType || 'LOCAL';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(username, password);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      onLoginSuccess(response.data.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = branding ? {
    background: `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`,
  } : {};

  return (
    <div className="auth-container" style={containerStyle}>
      <div className="auth-card">
        <div className="auth-header">
         <h5>{branding?.dashboardTitle || 'Dynatrace Multi-Tenant Monitor'}</h5>
        </div>
        <div className="auth-type-badge">
          🔐 {authType === 'LOCAL' ? 'Local Authentication' : authType === 'OIDC' ? 'OIDC Authentication' : 'LDAP Authentication'}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

