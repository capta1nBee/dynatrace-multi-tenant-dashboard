import { useState, useEffect } from 'react';
import { authConfigAPI } from '../api/authConfig';
import '../styles/AuthConfigManagement.css';

export default function AuthConfigManagement() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [authType, setAuthType] = useState('LOCAL');
  const [formData, setFormData] = useState({
    oidcClientId: '',
    oidcClientSecret: '',
    oidcDiscoveryUrl: '',
    oidcRedirectUri: '',
    oidcScopes: 'openid,profile,email',
    ldapServer: '',
    ldapPort: 389,
    ldapBaseDn: '',
    ldapBindDn: '',
    ldapBindPassword: '',
    ldapUserSearchFilter: '(uid={0})',
    ldapLoginAttribute: 'uid',
    ldapUseTls: false,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await authConfigAPI.getConfig();
      console.log('[AUTH CONFIG] Loaded config:', response.data);
      if (response.data.authType) {
        console.log('[AUTH CONFIG] Setting authType to:', response.data.authType);
        setAuthType(response.data.authType);

        // Extract only form fields, not authType
        const { authType, ...formFields } = response.data;
        setFormData(prev => ({
          ...prev,
          ...formFields,
        }));
      }
    } catch (err) {
      console.error('Failed to load auth config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const submitData = {
        authType,
        ...formData,
      };

      console.log('[AUTH CONFIG] Submitting:', submitData);
      const response = await authConfigAPI.updateConfig(submitData);
      console.log('[AUTH CONFIG] Response:', response);
      setSuccess('Authentication configuration updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('[AUTH CONFIG] Error:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to update configuration';
      console.error('[AUTH CONFIG] Error message:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-config-management">
      <div className="config-header">
        <h2>🔐 Authentication Configuration</h2>
        <p>Configure OIDC or LDAP authentication for your dashboard</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="auth-config-form">
        <div className="form-section">
          <h3>Authentication Type</h3>
          <div className="auth-type-selector">
            {['LOCAL', 'OIDC', 'LDAP'].map(type => (
              <label key={type} className="radio-label">
                <input
                  type="radio"
                  name="authType"
                  value={type}
                  checked={authType === type}
                  onChange={(e) => setAuthType(e.target.value)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        {authType === 'OIDC' && (
          <div className="form-section">
            <h3>OIDC Configuration</h3>
            <div className="form-group">
              <label>Discovery URL</label>
              <input
                type="url"
                placeholder="https://auth.example.com/.well-known/openid-configuration"
                value={formData.oidcDiscoveryUrl}
                onChange={(e) => setFormData({ ...formData, oidcDiscoveryUrl: e.target.value })}
                required={authType === 'OIDC'}
              />
            </div>
            <div className="form-group">
              <label>Client ID</label>
              <input
                type="text"
                placeholder="your-client-id"
                value={formData.oidcClientId}
                onChange={(e) => setFormData({ ...formData, oidcClientId: e.target.value })}
                required={authType === 'OIDC'}
              />
            </div>
            <div className="form-group">
              <label>Client Secret</label>
              <input
                type="password"
                placeholder="your-client-secret"
                value={formData.oidcClientSecret}
                onChange={(e) => setFormData({ ...formData, oidcClientSecret: e.target.value })}
                required={authType === 'OIDC'}
              />
            </div>
            <div className="form-group">
              <label>Redirect URI</label>
              <input
                type="url"
                placeholder="http://localhost:5173/callback"
                value={formData.oidcRedirectUri}
                onChange={(e) => setFormData({ ...formData, oidcRedirectUri: e.target.value })}
                required={authType === 'OIDC'}
              />
            </div>
            <div className="form-group">
              <label>Scopes</label>
              <input
                type="text"
                placeholder="openid,profile,email"
                value={formData.oidcScopes}
                onChange={(e) => setFormData({ ...formData, oidcScopes: e.target.value })}
              />
            </div>
          </div>
        )}

        {authType === 'LDAP' && (
          <div className="form-section">
            <h3>LDAP Configuration</h3>
            <div className="form-group">
              <label>LDAP Server</label>
              <input
                type="text"
                placeholder="ldap.example.com"
                value={formData.ldapServer}
                onChange={(e) => setFormData({ ...formData, ldapServer: e.target.value })}
                required={authType === 'LDAP'}
              />
            </div>
            <div className="form-group">
              <label>LDAP Port</label>
              <input
                type="number"
                value={formData.ldapPort}
                onChange={(e) => setFormData({ ...formData, ldapPort: parseInt(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>Base DN</label>
              <input
                type="text"
                placeholder="dc=example,dc=com"
                value={formData.ldapBaseDn}
                onChange={(e) => setFormData({ ...formData, ldapBaseDn: e.target.value })}
                required={authType === 'LDAP'}
              />
            </div>
            <div className="form-group">
              <label>Bind DN</label>
              <input
                type="text"
                placeholder="cn=admin,dc=example,dc=com"
                value={formData.ldapBindDn}
                onChange={(e) => setFormData({ ...formData, ldapBindDn: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Bind Password</label>
              <input
                type="password"
                value={formData.ldapBindPassword}
                onChange={(e) => setFormData({ ...formData, ldapBindPassword: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>User Search Filter</label>
              <input
                type="text"
                placeholder="(uid={0})"
                value={formData.ldapUserSearchFilter}
                onChange={(e) => setFormData({ ...formData, ldapUserSearchFilter: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Login Attribute</label>
              <input
                type="text"
                placeholder="uid"
                value={formData.ldapLoginAttribute}
                onChange={(e) => setFormData({ ...formData, ldapLoginAttribute: e.target.value })}
                required={authType === 'LDAP'}
              />
              <small>The LDAP attribute used for login (e.g., uid, mail, sAMAccountName)</small>
            </div>
            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={formData.ldapUseTls}
                  onChange={(e) => setFormData({ ...formData, ldapUseTls: e.target.checked })}
                />
                <span>Use TLS</span>
              </label>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}

