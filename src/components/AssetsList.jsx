import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import '../styles/List.css';

export default function AssetsList({ assets, stats, onRefresh, isSyncing, lastSyncTime, onManualSync }) {
  const [filterType, setFilterType] = useState('HOST'); // Default to HOST
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTenant, setFilterTenant] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [localAssets, setLocalAssets] = useState([]);
  const [localStats, setLocalStats] = useState([]);
  const [dynamicStats, setDynamicStats] = useState(stats);
  const [dynamicTypes, setDynamicTypes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Get unique tenants
  const uniqueTenants = [...new Set((localAssets || []).map(a => a.tenantName))];

  // Load assets from backend on component mount or when filters change
  useEffect(() => {
    const loadAssets = async () => {
      try {
        setLoading(true);
        console.log('[ASSETS LIST] Loading assets from backend...');
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Build query parameters
        let assetsUrl = '/api/assets';
        const params = new URLSearchParams();

        if (filterType) {
          params.append('type', filterType);
          console.log('[ASSETS LIST] Loading assets for type:', filterType);
        } else {
          console.log('[ASSETS LIST] No type filter, will default to HOST on backend');
        }

        if (filterTenant) {
          // Find tenant ID from localAssets
          const tenant = localAssets.find(a => a.tenantName === filterTenant);
          if (tenant) {
            params.append('tenantId', tenant.tenantId);
            console.log('[ASSETS LIST] Loading assets for tenant:', filterTenant);
          }
        }

        if (params.toString()) {
          assetsUrl += '?' + params.toString();
        }

        const [assetsRes, statsRes] = await Promise.all([
          fetch(assetsUrl, { headers }),
          fetch('/api/assets/stats', { headers })
        ]);

        if (assetsRes.ok) {
          const assetsData = await assetsRes.json();
          console.log('[ASSETS LIST] Assets loaded:', assetsData);
          setLocalAssets(assetsData.assets || assetsData || []);
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          console.log('[ASSETS LIST] Stats loaded:', statsData);
          setLocalStats(statsData || []);
        }
      } catch (error) {
        console.error('[ASSETS LIST] Error loading assets:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAssets();
  }, [filterType, filterTenant]);

  // Update local state when props change
  useEffect(() => {
    if (assets && assets.length > 0) {
      setLocalAssets(assets);
    }
    if (stats && stats.length > 0) {
      setLocalStats(stats);
      setDynamicStats(stats);
    }
  }, [assets, stats]);

  useEffect(() => {
    console.log('[ASSETS LIST] Component mounted/updated');
    console.log('[ASSETS LIST] Local assets count:', localAssets?.length || 0);
    console.log('[ASSETS LIST] Local stats count:', localStats?.length || 0);
  }, [localAssets, localStats]);

  // Update stats when tenant filter changes
  useEffect(() => {
    const loadStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        let url = '/api/assets/stats';
        if (filterTenant) {
          // Find tenant ID from assets
          const tenant = localAssets.find(a => a.tenantName === filterTenant);
          if (tenant) {
            url += `?tenantId=${tenant.tenantId}`;
          }
        }

        const response = await fetch(url, { headers });
        if (response.ok) {
          const data = await response.json();
          console.log('[ASSETS LIST] Stats updated for tenant:', filterTenant, data);
          setDynamicStats(data);
        }
      } catch (error) {
        console.error('[ASSETS LIST] Error loading stats:', error);
        setDynamicStats(stats);
      }
    };

    loadStats();
  }, [filterTenant, localAssets, stats]);

  // Load entity types from database (distinct types)
  useEffect(() => {
    const loadEntityTypes = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Get first tenant ID to load entity types
        let tenantId = null;

        if (filterTenant) {
          // Find tenant ID from assets
          const tenant = localAssets.find(a => a.tenantName === filterTenant);
          if (tenant) {
            tenantId = tenant.tenantId;
          }
        } else if (localAssets && localAssets.length > 0) {
          // Use first asset's tenant ID
          tenantId = localAssets[0].tenantId;
        }

        if (tenantId) {
          console.log('[ASSETS LIST] Loading entity types for tenant:', tenantId);
          const response = await fetch(`/api/assets/entity-types?tenantId=${tenantId}`, { headers });
          if (response.ok) {
            const data = await response.json();
            console.log('[ASSETS LIST] Entity types loaded from DB:', data.types);
            setDynamicTypes(data.types || []);
          }
        } else {
          // Fallback to unique types from current assets
          const uniqueTypes = [...new Set((localAssets || []).map(a => a.type))].sort();
          console.log('[ASSETS LIST] Unique types from assets (fallback):', uniqueTypes);
          setDynamicTypes(uniqueTypes);
        }
      } catch (error) {
        console.error('[ASSETS LIST] Error loading entity types:', error);
        // Fallback to unique types from assets
        const uniqueTypes = [...new Set((localAssets || []).map(a => a.type))].sort();
        setDynamicTypes(uniqueTypes);
      }
    };

    loadEntityTypes();
  }, [filterTenant, localAssets]);

  const filteredAssets = (localAssets || []).filter((asset) => {
    if (filterTenant && asset.tenantName !== filterTenant) return false;
    if (filterType && asset.type !== filterType) return false;
    if (filterStatus && asset.status !== filterStatus) return false;

    // Search in all fields
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const props = asset.properties || {};

      const searchableFields = [
        asset.name,
        asset.type,
        asset.status,
        asset.tenantName,
        asset.dynatraceEntityId,
        props.ipAddress,
        props.osType,
        props.osVersion,
        props.osArchitecture,
        props.state,
        props.hypervisorType,
        props.logicalCpuCores,
        props.memoryTotal,
        props.macAddresses,
      ];

      const matchesSearch = searchableFields.some(field =>
        field && String(field).toLowerCase().includes(searchLower)
      );

      if (!matchesSearch) return false;
    }

    return true;
  });

  console.log('[ASSETS LIST] Filtered assets count:', filteredAssets.length);
  console.log('[ASSETS LIST] Filter values:', { filterType, filterStatus, filterTenant, searchTerm });
  if (filterType) {
    console.log('[ASSETS LIST] Sample asset types:', localAssets?.slice(0, 5).map(a => a.type));
  }

  if (!localAssets || localAssets.length === 0) {
    console.log('[ASSETS LIST] No assets to display');
    return (
      <div className="list-container">
        {/* Auto Sync Status */}
        <div className="sync-status">
          <div className="sync-info">
            {isSyncing ? (
              <>
                <span className="sync-spinner">⏳</span>
                <span className="sync-text">Auto syncing assets...</span>
              </>
            ) : lastSyncTime ? (
              <>
                <span className="sync-icon">✅</span>
                <span className="sync-text">Last sync: {lastSyncTime.toLocaleTimeString()}</span>
              </>
            ) : null}
          </div>
          {onManualSync && (
            <button onClick={onManualSync} disabled={isSyncing} className="manual-sync-btn" title="Manual sync assets">
              🔄 Sync Now
            </button>
          )}
        </div>

        <div className="filters">
          <div className="filter-row">
          </div>
        </div>
        <div className="empty-state">
          <p>No assets found. Click "🔄 Sync Now" to fetch assets from Dynatrace.</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status) => {
    const colors = {
      RUNNING: '#24c42cff',
      DEGRADED: '#f57c00',
      UNAVAILABLE: '#d32f2f',
      UNKNOWN: '#999',
    };
    return colors[status] || '#c00606ff';
  };

  const getTypeColor = (type) => {
    const colors = {
      HOST: '#2196F3',
      APPLICATION: '#4CAF50',
      SERVICE: '#FF9800',
      DATABASE: '#9C27B0',
      CONTAINER: '#00BCD4',
      PROCESS_GROUP: '#F44336',
    };
    return colors[type] || '#757575';
  };

  const exportToExcel = () => {
    const data = filteredAssets.map(asset => {
      const props = asset.properties || {};
      return {
        'Tenant': asset.tenantName,
        'Name': asset.name,
        'Type': asset.type,
        'IP Address': props.ipAddress || 'N/A',
        'OS Type': props.osType || 'N/A',
        'OS Version': props.osVersion || 'N/A',
        'CPU Cores': props.logicalCpuCores || 'N/A',
        'Memory (GB)': props.memoryTotal || 'N/A',
        'Status': props.state || 'N/A',
        'Last Seen': new Date(asset.lastSeen).toLocaleString(),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assets');
    XLSX.writeFile(workbook, `assets_${new Date().toISOString().slice(0, 10)}.xlsx`);
    console.log('[ASSETS LIST] Excel exported successfully');
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l'); // landscape mode
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 10;

    // Title
    doc.setFontSize(16);
    doc.text('Assets Report', 10, yPosition);
    yPosition += 10;

    // Metadata
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 10, yPosition);
    yPosition += 5;
    doc.text(`Total Assets: ${filteredAssets.length}`, 10, yPosition);
    yPosition += 10;

    // Table headers
    doc.setFontSize(8);
    const headers = ['Tenant', 'Name', 'Type', 'IP', 'OS Type', 'OS Ver', 'CPU', 'Memory', 'Status'];
    const columnWidths = [20, 30, 20, 25, 20, 15, 12, 15, 15];
    let xPosition = 10;

    doc.setFillColor(200, 200, 200);
    headers.forEach((header, idx) => {
      doc.rect(xPosition, yPosition - 5, columnWidths[idx], 7, 'F');
      doc.text(header, xPosition + 2, yPosition);
      xPosition += columnWidths[idx];
    });
    yPosition += 10;

    // Table rows
    filteredAssets.forEach((asset) => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 10;
      }

      const props = asset.properties || {};
      xPosition = 10;
      const rowData = [
        asset.tenantName.substring(0, 15),
        asset.name.substring(0, 20),
        asset.type,
        props.ipAddress ? props.ipAddress.substring(0, 15) : 'N/A',
        props.osType ? props.osType.substring(0, 12) : 'N/A',
        props.osVersion ? props.osVersion.substring(0, 10) : 'N/A',
        props.logicalCpuCores || 'N/A',
        props.memoryTotal ? props.memoryTotal.substring(0, 10) : 'N/A',
        props.state || 'N/A',
      ];

      rowData.forEach((data, idx) => {
        doc.text(String(data), xPosition + 2, yPosition);
        xPosition += columnWidths[idx];
      });
      yPosition += 6;
    });

    doc.save(`assets_${new Date().toISOString().slice(0, 10)}.pdf`);
    console.log('[ASSETS LIST] PDF exported successfully');
  };

  return (
    <div className="list-container">
      {/* Auto Sync Status */}
      <div className="sync-status">
        <div className="sync-info">
          {isSyncing ? (
            <>
              <span className="sync-spinner">⏳</span>
              <span className="sync-text">Auto syncing assets...</span>
            </>
          ) : lastSyncTime ? (
            <>
              <span className="sync-icon">✅</span>
              <span className="sync-text">Last sync: {lastSyncTime.toLocaleTimeString()}</span>
            </>
          ) : (
            <>
              <span className="sync-icon">⏱️</span>
              <span className="sync-text">Waiting for first sync...</span>
            </>
          )}
        </div>
        {onManualSync && (
          <button onClick={onManualSync} disabled={isSyncing} className="manual-sync-btn" title="Manual sync assets">
            🔄 Sync Now
          </button>
        )}
      </div>

      <div className="stats-badges">
        {dynamicStats.map((stat) => (
          <div key={stat._id || stat.id} className="stat-badge" style={{ backgroundColor: getTypeColor(stat._id) }}>
            <span className="badge-label">{stat._id}</span>
            <span className="badge-count">{stat.count}</span>
          </div>
        ))}
      </div>

      <div className="filters">
        <div className="filter-row">
          <button onClick={exportToExcel} className="export-btn" title="Export to Excel">
            📊 Excel
          </button>
          <button onClick={exportToPDF} className="export-btn" title="Export to PDF">
            📄 PDF
          </button>
        </div>

        <div className="filter-row">
            <input
              type="text"
              placeholder="🔍 Search assets (name, type, IP, OS, etc)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select value={filterTenant} onChange={(e) => setFilterTenant(e.target.value)}>
              <option value="">All Tenants</option>
              {uniqueTenants.map((tenant) => (
                <option key={tenant} value={tenant}>
                  {tenant}
                </option>
              ))}
            </select>

            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {dynamicTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="RUNNING">RUNNING</option>
              <option value="UNAVAILABLE">Unavailable</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tenant</th>
              <th>Name</th>
              <th>Type</th>
              <th>IP Address</th>
              <th>OS Type</th>
              <th>OS Version</th>
              <th>CPU Cores</th>
              <th>Memory (GB)</th>
              <th>Status</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset, index) => {
              const props = asset.properties || {};
              return (
                <tr key={asset.id || asset._id}>
                  <td>{index + 1}</td>
                  <td>{asset.tenantName}</td>
                  <td>{asset.name}</td>
                  <td>{asset.type}</td>
                  <td>{props.ipAddress || 'N/A'}</td>
                  <td>{props.osType || 'N/A'}</td>
                  <td>{props.osVersion || 'N/A'}</td>
                  <td>{props.logicalCpuCores || 'N/A'}</td>
                  <td>{props.memoryTotal || 'N/A'}</td>
                  <td>
                    <span className="badge" style={{ backgroundColor: getStatusColor(props.state) }}>
                      {props.state}
                    </span>
                  </td>
                  <td>{new Date(asset.lastSeen).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

