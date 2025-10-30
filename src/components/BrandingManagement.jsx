import { useState, useEffect } from 'react';
import { brandingAPI } from '../api/branding';
import '../styles/BrandingManagement.css';

export default function BrandingManagement() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    dashboardTitle: 'Dynatrace Multi-Tenant Monitor',
    logoUrl: '',
    logoFileName: '',
    primaryColor: '#667eea',
    secondaryColor: '#764ba2',
  });
  const [logoPreview, setLogoPreview] = useState('');

  useEffect(() => {
    loadBranding();
  }, []);

  const loadBranding = async () => {
    setLoading(true);
    try {
      const response = await brandingAPI.getBranding();
      setFormData({
        dashboardTitle: response.data.dashboardTitle || 'Dynatrace Multi-Tenant Monitor',
        logoUrl: response.data.logoUrl || '',
        logoFileName: response.data.logoFileName || '',
        primaryColor: response.data.primaryColor || '#667eea',
        secondaryColor: response.data.secondaryColor || '#764ba2',
      });
      if (response.data.logoUrl) {
        setLogoPreview(response.data.logoUrl);
      }
    } catch (err) {
      console.error('Failed to load branding:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target.result);
        setFormData(prev => ({
          ...prev,
          logoUrl: event.target.result,
          logoFileName: file.name,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await brandingAPI.updateBranding(formData);
      setSuccess('Branding updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update branding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="branding-management">
      <div className="branding-header">
        <h2>🎨 Dashboard Branding</h2>
        <p>Customize your dashboard appearance</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="branding-form">
        <div className="form-section">
          <h3>Dashboard Title</h3>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={formData.dashboardTitle}
              onChange={(e) => setFormData({ ...formData, dashboardTitle: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Logo</h3>
          <div className="form-group">
            <label>Upload Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
            />
            <small>Recommended size: 200x60px, PNG or JPG</small>
          </div>
          {logoPreview && (
            <div className="logo-preview">
              <p>Preview:</p>
              <img src={logoPreview} alt="Logo preview" />
            </div>
          )}
        </div>

        <div className="form-section">
          <h3>Colors</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Primary Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                />
                <input
                  type="text"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  placeholder="#667eea"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Secondary Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                />
                <input
                  type="text"
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  placeholder="#764ba2"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="preview-section">
          <h3>Preview</h3>
          <div className="preview-box" style={{
            background: `linear-gradient(135deg, ${formData.primaryColor} 0%, ${formData.secondaryColor} 100%)`,
          }}>
            <div className="preview-content">
              {logoPreview && <img src={logoPreview} alt="Logo" className="preview-logo" />}
              <h1>{formData.dashboardTitle}</h1>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Saving...' : 'Save Branding'}
        </button>
      </form>
    </div>
  );
}

