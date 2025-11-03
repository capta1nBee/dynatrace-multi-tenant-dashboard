import { useState, useEffect } from 'react';
import { alarmsAPI } from '../api/alarms';
import { assetsAPI } from '../api/assets';
import AlarmsList from './AlarmsList';
import AssetsList from './AssetsList';
import TenantManagement from './TenantManagement';
import TenantDashboard from './TenantDashboard';
import AuthConfigManagement from './AuthConfigManagement';
import BrandingManagement from './BrandingManagement';
import '../styles/Dashboard.css';

export default function Dashboard({ user, onLogout, branding, authConfig }) {
  const [activeTab, setActiveTab] = useState('alarms');
  const [alarms, setAlarms] = useState([]);
  const [assets, setAssets] = useState([]);
  const [alarmStats, setAlarmStats] = useState([]);
  const [assetStats, setAssetStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [alarmCounts, setAlarmCounts] = useState({ open: 0, closed: 0 });
  const isAdmin = user?.role === 'ADMIN';

  // Asset sync is handled by backend job (every 30 minutes)
  // No frontend interval needed

  // Load alarm data for both authenticated and non-authenticated users
  useEffect(() => {
    loadAlarmData();
    const interval = setInterval(loadAlarmData, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Update refresh time display every second
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render to update time display
      setLastRefresh(prev => prev ? new Date(prev) : null);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadAlarmData = async () => {
    setLoading(true);
    try {
      console.log('[DASHBOARD] Loading alarm data from DB...');
      // Only load data from DB (sync is handled by backend job every 3 minutes)
      const [alarmsRes, alarmStatsRes] = await Promise.all([
        alarmsAPI.getAll(filters),
        alarmsAPI.getStats(),
      ]);

      console.log('[DASHBOARD] Alarms response:', alarmsRes.data);
      console.log('[DASHBOARD] Alarm stats response:', alarmStatsRes.data);

      setAlarms(alarmsRes.data.alarms || []);
      setAlarmStats(alarmStatsRes.data || []);
      setLastRefresh(new Date());

      console.log('[DASHBOARD] Alarm data updated');
    } catch (error) {
      console.error('[DASHBOARD] Error loading alarm data:', error);
      console.error('[DASHBOARD] Error details:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      console.log('[DASHBOARD] Loading data...');

      // Load assets separately to debug
      console.log('[DASHBOARD] Fetching assets...');
      const assetsRes = await assetsAPI.getAll(filters);
      console.log('[DASHBOARD] Assets response received:', assetsRes);
      console.log('[DASHBOARD] Assets response data:', assetsRes.data);
      console.log('[DASHBOARD] Assets array:', assetsRes.data?.assets);
      console.log('[DASHBOARD] Assets count:', assetsRes.data?.assets?.length || 0);

      // Load other data
      const [alarmsRes, alarmStatsRes, assetStatsRes] = await Promise.all([
        alarmsAPI.getAll(filters),
        alarmsAPI.getStats(),
        assetsAPI.getStats(),
      ]);

      console.log('[DASHBOARD] Alarms response:', alarmsRes.data);
      console.log('[DASHBOARD] Alarm stats response:', alarmStatsRes.data);
      console.log('[DASHBOARD] Asset stats response:', assetStatsRes.data);

      // Update state
      console.log('[DASHBOARD] Setting state...');
      setAlarms(alarmsRes.data.alarms || []);
      setAssets(assetsRes.data.assets || []);
      setAlarmStats(alarmStatsRes.data || []);
      setAssetStats(assetStatsRes.data || []);
      setLastRefresh(new Date());

      console.log('[DASHBOARD] State updated - Assets count:', assetsRes.data.assets?.length || 0);
    } catch (error) {
      console.error('[DASHBOARD] Error loading data:', error);
      console.error('[DASHBOARD] Error details:', error.response?.data || error.message);
      console.error('[DASHBOARD] Error stack:', error.stack);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      console.log('[DASHBOARD] Starting sync (Alarms only)...');
      // Only sync alarms - assets sync manually or hourly
      // Send empty body (from/to are optional)
      const token = localStorage.getItem('token');
      await fetch('/api/alarms/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({}),
      });
      console.log('[DASHBOARD] Alarms sync completed');
      console.log('[DASHBOARD] Loading data after sync...');
      await loadData();
      console.log('[DASHBOARD] Sync completed successfully');
    } catch (error) {
      console.error('[DASHBOARD] Error syncing data:', error);
      console.error('[DASHBOARD] Error details:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssetSync = async () => {
    setIsSyncing(true);
    try {
      console.log('[DASHBOARD] Starting Assets sync...');
      await assetsAPI.sync();
      console.log('[DASHBOARD] Assets sync completed');
      setLastSyncTime(new Date());
      console.log('[DASHBOARD] Loading data after sync...');
      await loadData();
      console.log('[DASHBOARD] Assets sync completed successfully');
    } catch (error) {
      console.error('[DASHBOARD] Error syncing assets:', error);
      console.error('[DASHBOARD] Error details:', error.response?.data || error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const getRefreshTimeText = () => {
    if (!lastRefresh) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - lastRefresh) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };



  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          
          <div className="refresh-info">
            Last updated: <span className="refresh-time">{getRefreshTimeText()}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="refresh-buttons">
            <button
              onClick={() => setRefreshInterval(10)}
              className={`refresh-btn ${refreshInterval === 10 ? 'active' : ''}`}
            >
              10s
            </button>
            <button
              onClick={() => setRefreshInterval(30)}
              className={`refresh-btn ${refreshInterval === 30 ? 'active' : ''}`}
            >
              30s
            </button>
            <button
              onClick={() => setRefreshInterval(60)}
              className={`refresh-btn ${refreshInterval === 60 ? 'active' : ''}`}
            >
              60s
            </button>
            <button
              onClick={() => setRefreshInterval(300)}
              className={`refresh-btn ${refreshInterval === 300 ? 'active' : ''}`}
            >
              5m
            </button>
          </div>
          <button onClick={handleSync} disabled={loading} className="sync-btn">
            {loading ? 'Syncing...' : 'Sync Now'}
          </button>
          <div className="user-section">
            {user ? (
              <>
                <button
                  onClick={() => setShowUserProfile(!showUserProfile)}
                  className="user-profile-btn"
                  title="Click to view profile"
                >
                  👤 {user.username}
                </button>
                <button onClick={onLogout} className="logout-btn">
                  🚪 Logout
                </button>
              </>
            ) : (
              <p></p>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'alarms' ? 'active' : ''}`}
          onClick={() => setActiveTab('alarms')}
        >
          Alarms(Open:{alarmCounts.open},Close:{alarmCounts.closed})
        </button>
        {user && (
          <button
            className={`tab ${activeTab === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            Assets
          </button>
        )}
        {user && (
          <button
            className={`tab ${activeTab === 'tenant-dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('tenant-dashboard')}
          >
            Tenant Dashboard
          </button>
        )}
        {isAdmin && (
          <>
            <button
              className={`tab ${activeTab === 'tenants' ? 'active' : ''}`}
              onClick={() => setActiveTab('tenants')}
            >
              Tenants
            </button>
            <button
              className={`tab ${activeTab === 'auth-config' ? 'active' : ''}`}
              onClick={() => setActiveTab('auth-config')}
            >
              Auth Config
            </button>
            <button
              className={`tab ${activeTab === 'branding' ? 'active' : ''}`}
              onClick={() => setActiveTab('branding')}
            >
              Branding
            </button>
          </>
        )}
      </div>

      {activeTab === 'alarms' && (
        <AlarmsList alarms={alarms} stats={alarmStats} onRefresh={loadAlarmData} user={user} onAlarmCountsChange={setAlarmCounts} />
      )}
      {activeTab === 'assets' && user && (
        <AssetsList assets={assets} stats={assetStats} onRefresh={loadData} isSyncing={isSyncing} lastSyncTime={lastSyncTime} onManualSync={isAdmin ? handleAssetSync : null} />
      )}
      {activeTab === 'tenant-dashboard' && user && (
        <TenantDashboard user={user} />
      )}
      {activeTab === 'tenants' && isAdmin && (
        <TenantManagement />
      )}
      {activeTab === 'auth-config' && isAdmin && (
        <AuthConfigManagement />
      )}
      {activeTab === 'branding' && isAdmin && (
        <BrandingManagement />
      )}

      {showUserProfile && (
        <div className="modal-overlay" onClick={() => setShowUserProfile(false)}>
          <div className="user-profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👤 User Profile</h2>
              <button
                className="close-btn"
                onClick={() => setShowUserProfile(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <div className="profile-item">
                <label>Username:</label>
                <span>{user.username}</span>
              </div>
              <div className="profile-item">
                <label>Role:</label>
                <span className={`role-badge role-${user.role?.toLowerCase()}`}>
                  {user.role}
                </span>
              </div>
              <div className="profile-item">
                <label>Email:</label>
                <span>{user.email || 'Not provided'}</span>
              </div>
              <div className="profile-item">
                <label>Auth Method:</label>
                <span>{user.authMethod || 'LOCAL'}</span>
              </div>
              <div className="profile-item">
                <label>Last Login:</label>
                <span>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'First login'}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="close-modal-btn"
                onClick={() => setShowUserProfile(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

