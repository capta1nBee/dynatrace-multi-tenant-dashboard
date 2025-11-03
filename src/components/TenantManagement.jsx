import { useState, useEffect } from 'react';
import { tenantsAPI } from '../api/tenants';
import { assetsAPI } from '../api/assets';
import '../styles/TenantManagement.css';

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    dynatraceEnvironmentId: '',
    dynatraceApiToken: '',
    dynatraceApiUrl: '',
    dynatraceUrlType: 'standard',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const response = await tenantsAPI.getAll();
      setTenants(response.data);
    } catch (err) {
      setError('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let submitData = { ...formData };

      // Build full API URL based on URL type
      if (formData.dynatraceUrlType === 'standard') {
        // Standard: Add /e/<environmentId>/api/v2 automatically
        const baseUrl = formData.dynatraceApiUrl.replace(/\/$/, ''); // Remove trailing slash
        const fullApiUrl = `${baseUrl}/e/${formData.dynatraceEnvironmentId}/api/v2`;
        submitData.dynatraceApiUrl = fullApiUrl;
      }
      // Custom: Use URL as-is, no modification

      if (editingId) {
        await tenantsAPI.update(editingId, submitData);
      } else {
        // New tenant created - backend will auto-sync only this tenant
        await tenantsAPI.create(submitData);
        console.log('[TENANT MANAGEMENT] New tenant created, backend will auto-sync assets for this tenant only');
      }
      setFormData({
        name: '',
        description: '',
        dynatraceEnvironmentId: '',
        dynatraceApiToken: '',
        dynatraceApiUrl: '',
      });
      setShowForm(false);
      setEditingId(null);
      await loadTenants();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save tenant');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tenant) => {
    let baseUrl = tenant.dynatraceApiUrl;
    let urlType = tenant.dynatraceUrlType || 'standard';

    // If standard type, extract base URL from full API URL
    // Full URL format: https://dynatrace.com/e/{environmentId}/api/v2
    if (urlType === 'standard' && baseUrl.includes('/e/') && baseUrl.includes('/api/v2')) {
      baseUrl = baseUrl.split('/e/')[0];
    }

    setFormData({
      ...tenant,
      dynatraceApiUrl: baseUrl,
      dynatraceUrlType: urlType,
    });
    setEditingId(tenant.id || tenant._id);
    setShowForm(true);
  };

  const handleDisable = async (id, tenantName) => {
    if (window.confirm(`Are you sure you want to disable "${tenantName}"? The tenant will be marked as inactive but data will be preserved.`)) {
      try {
        setLoading(true);
        await fetch(`/api/tenants/${id}/disable`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        await loadTenants();
      } catch (err) {
        setError('Failed to disable tenant');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = async (id, tenantName) => {
    if (window.confirm(`⚠️ WARNING: This will permanently delete "${tenantName}" and ALL associated alarms and assets. This action cannot be undone. Are you sure?`)) {
      try {
        setLoading(true);
        await tenantsAPI.delete(id);
        await loadTenants();
      } catch (err) {
        setError('Failed to delete tenant');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="tenant-management">
      <div className="management-header">
        <h2>Tenant Management</h2>
        <button onClick={() => setShowForm(!showForm)} className="add-btn">
          {showForm ? 'Cancel' : 'Add Tenant'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="tenant-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Dynatrace Environment ID</label>
            <input
              type="text"
              value={formData.dynatraceEnvironmentId}
              onChange={(e) => setFormData({ ...formData, dynatraceEnvironmentId: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Dynatrace URL Type</label>
            <select
              value={formData.dynatraceUrlType}
              onChange={(e) => setFormData({ ...formData, dynatraceUrlType: e.target.value })}
            >
              <option value="standard">Standard (Auto-format)</option>
              <option value="custom">Custom (Use as-is)</option>
            </select>
            <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
              {formData.dynatraceUrlType === 'standard'
                ? 'Standard: /e/<environmentId>/api/v2 will be added automatically'
                : 'Custom: Enter the complete URL as-is, no modifications will be made'}
            </small>
          </div>
          <div className="form-group">
            <label>Dynatrace Base URL</label>
            <input
              type="url"
              placeholder={formData.dynatraceUrlType === 'standard'
                ? 'https://dynatrace.com'
                : 'https://dynatrace.com/e/abc123/api/v2'}
              value={formData.dynatraceApiUrl}
              onChange={(e) => setFormData({ ...formData, dynatraceApiUrl: e.target.value })}
              required
            />
            <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
              {formData.dynatraceUrlType === 'standard'
                ? 'Enter only the base URL (e.g., https://dynatrace.com). The path /e/<environmentId>/api/v2 will be added automatically.'
                : 'Enter the complete URL including /e/<environmentId>/api/v2 path.'}
            </small>
          </div>
          <div className="form-group">
            <label>Dynatrace API Token</label>
            <input
              type="password"
              value={formData.dynatraceApiToken}
              onChange={(e) => setFormData({ ...formData, dynatraceApiToken: e.target.value })}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Tenant'}
          </button>
        </form>
      )}

      <div className="tenants-grid">
        {tenants.map((tenant) => (
          <div
            key={tenant.id || tenant._id}
            className={`tenant-card ${!tenant.isActive ? 'tenant-card-inactive' : ''}`}
          >
            <div className="tenant-header">
              <h3>{tenant.name}</h3>
              {!tenant.isActive && <span className="status-badge inactive">🔒 INACTIVE</span>}
              {tenant.isActive && <span className="status-badge active">✓ ACTIVE</span>}
            </div>
            <p>{tenant.description}</p>
            <div className="tenant-info">
              <small>Environment: {tenant.dynatraceEnvironmentId}</small>
              <small>Last Sync: {tenant.lastSyncTime ? new Date(tenant.lastSyncTime).toLocaleString() : 'Never'}</small>
            </div>
            <div className="tenant-actions">
              <button
                onClick={() => handleEdit(tenant)}
                className="edit-btn"
                disabled={!tenant.isActive}
              >
                Edit
              </button>
              {tenant.isActive ? (
                <button
                  onClick={() => handleDisable(tenant.id || tenant._id, tenant.name)}
                  className="disable-btn"
                >
                  Disable
                </button>
              ) : (
                <button
                  onClick={() => handleDelete(tenant.id || tenant._id, tenant.name)}
                  className="delete-btn"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

