import { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { tenantsAPI } from '../api/tenants';
import { alarmsAPI } from '../api/alarms';
import { assetsAPI } from '../api/assets';
import '../styles/TenantDashboard.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export default function TenantDashboard({ user }) {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantStats, setTenantStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // Check if user is authenticated
  if (!user) {
    return (
      <div className="tenant-dashboard">
        <div className="auth-required">
          <h2>🔒 Authentication Required</h2>
          <p>Please log in to access the Tenant Dashboard.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const response = await tenantsAPI.getAll();
      const activeTenants = response.data.filter(t => t.isActive);
      setTenants(activeTenants);
      if (activeTenants.length > 0) {
        setSelectedTenant(activeTenants[0]);
        await loadTenantStats(activeTenants[0].id);
      }
    } catch (error) {
      console.error('Error loading tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTenantStats = async (tenantId) => {
    try {
      setLoading(true);
      const filters = { tenantId };
      
      const [alarmsRes, assetsRes, alarmStatsRes, assetStatsRes] = await Promise.all([
        alarmsAPI.getAll(filters),
        assetsAPI.getAll(filters),
        alarmsAPI.getStats(),
        assetsAPI.getStats(),
      ]);

      const alarms = alarmsRes.data.alarms || [];
      const assets = assetsRes.data.assets || [];

      // Calculate asset types (only for selected tenant)
      const assetTypeCount = {};
      assets.forEach(asset => {
        // Only count assets that belong to the selected tenant
        if (asset.tenantId === tenantId || !asset.tenantId) {
          const type = asset.type || 'Unknown';
          assetTypeCount[type] = (assetTypeCount[type] || 0) + 1;
        }
      });

      // Calculate OS types (only for HOST type assets)
      const osTypeCount = {};
      assets.forEach(asset => {
        if (asset.type === 'HOST') {
          const osType = asset.properties?.osType || asset.osType || asset.os || 'Unknown';
          osTypeCount[osType] = (osTypeCount[osType] || 0) + 1;
        }
      });

      // Calculate last 7 days alarm count (Open and Closed separately)
      const last7DaysAlarmCount = {};
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last7DaysAlarmCount[dateStr] = { open: 0, closed: 0 };
      }

      alarms.forEach(alarm => {
        const alarmDate = new Date(alarm.startTime || alarm.createdAt || alarm.timestamp).toISOString().split('T')[0];
        if (last7DaysAlarmCount.hasOwnProperty(alarmDate)) {
          if (alarm.status === 'OPEN') {
            last7DaysAlarmCount[alarmDate].open++;
          } else if (alarm.status === 'CLOSED') {
            last7DaysAlarmCount[alarmDate].closed++;
          }
        }
      });

      // Calculate stats
      const stats = {
        totalAlarms: alarms.length,
        totalAssets: assets.length,
        criticalAlarms: alarms.filter(a => a.severity === 'CRITICAL').length,
        majorAlarms: alarms.filter(a => a.severity === 'MAJOR').length,
        minorAlarms: alarms.filter(a => a.severity === 'MINOR').length,
        warningAlarms: alarms.filter(a => a.severity === 'WARNING').length,
        openAlarms: alarms.filter(a => a.status === 'OPEN').length,
        closedAlarms: alarms.filter(a => a.status === 'CLOSED').length,
        assetTypeCount,
        osTypeCount,
        last7DaysAlarmCount,
        alarms,
        assets,
      };

      setTenantStats(stats);
    } catch (error) {
      console.error('Error loading tenant stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTenantChange = (tenant) => {
    setSelectedTenant(tenant);
    loadTenantStats(tenant.id);
  };

  const exportToExcel = () => {
    if (!selectedTenant || !tenantStats) return;

    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Tenant Dashboard Report'],
      ['Tenant Name', selectedTenant.name],
      ['Environment ID', selectedTenant.dynatraceEnvironmentId],
      ['Report Date', new Date().toLocaleString()],
      [],
      ['Statistics'],
      ['Total Alarms', tenantStats.totalAlarms],
      ['Critical Alarms', tenantStats.criticalAlarms],
      ['Major Alarms', tenantStats.majorAlarms],
      ['Minor Alarms', tenantStats.minorAlarms],
      ['Warning Alarms', tenantStats.warningAlarms],
      ['Open Alarms', tenantStats.openAlarms],
      ['Closed Alarms', tenantStats.closedAlarms],
      ['Total Assets', tenantStats.totalAssets],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Alarms sheet
    if (tenantStats.alarms.length > 0) {
      const alarmsData = [
        ['Title', 'Severity', 'Status', 'Start Time', 'Description'],
        ...tenantStats.alarms.map(a => [
          a.title,
          a.severity,
          a.status,
          new Date(a.startTime).toLocaleString(),
          a.description || '',
        ]),
      ];
      const alarmsSheet = XLSX.utils.aoa_to_sheet(alarmsData);
      XLSX.utils.book_append_sheet(workbook, alarmsSheet, 'Alarms');
    }

    // Assets sheet
    if (tenantStats.assets.length > 0) {
      const assetsData = [
        ['Name', 'Type', 'Description'],
        ...tenantStats.assets.map(a => [
          a.name,
          a.type,
          a.description || '',
        ]),
      ];
      const assetsSheet = XLSX.utils.aoa_to_sheet(assetsData);
      XLSX.utils.book_append_sheet(workbook, assetsSheet, 'Assets');
    }

    XLSX.writeFile(workbook, `${selectedTenant.name}_report_${new Date().getTime()}.xlsx`);
  };

  const exportToPDF = () => {
    if (!selectedTenant || !tenantStats) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 10;

    // Title
    doc.setFontSize(20);
    doc.text('Tenant Dashboard Report', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Tenant Info
    doc.setFontSize(12);
    doc.text(`Tenant: ${selectedTenant.name}`, 10, yPosition);
    yPosition += 7;
    doc.text(`Environment: ${selectedTenant.dynatraceEnvironmentId}`, 10, yPosition);
    yPosition += 7;
    doc.text(`Report Date: ${new Date().toLocaleString()}`, 10, yPosition);
    yPosition += 15;

    // Statistics
    doc.setFontSize(14);
    doc.text('Statistics', 10, yPosition);
    yPosition += 10;

    doc.setFontSize(11);
    const stats = [
      `Total Alarms: ${tenantStats.totalAlarms}`,
      `Critical: ${tenantStats.criticalAlarms} | Major: ${tenantStats.majorAlarms} | Minor: ${tenantStats.minorAlarms} | Warning: ${tenantStats.warningAlarms}`,
      `Open: ${tenantStats.openAlarms} | Closed: ${tenantStats.closedAlarms}`,
      `Total Assets: ${tenantStats.totalAssets}`,
    ];

    stats.forEach(stat => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 10;
      }
      doc.text(stat, 10, yPosition);
      yPosition += 7;
    });

    yPosition += 10;

    // Recent Alarms
    if (tenantStats.alarms.length > 0) {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 10;
      }
      doc.setFontSize(14);
      doc.text('Recent Alarms', 10, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      tenantStats.alarms.slice(0, 5).forEach(alarm => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 10;
        }
        doc.text(`• ${alarm.title} (${alarm.severity})`, 10, yPosition);
        yPosition += 5;
      });
    }

    doc.save(`${selectedTenant.name}_report_${new Date().getTime()}.pdf`);
  };

  if (!selectedTenant || !tenantStats) {
    return <div className="tenant-dashboard">Loading...</div>;
  }

  return (
    <div className="tenant-dashboard">
      <div className="tenant-selector">
        <label>Select Tenant:</label>
        <select 
          value={selectedTenant.id} 
          onChange={(e) => {
            const tenant = tenants.find(t => t.id === parseInt(e.target.value));
            handleTenantChange(tenant);
          }}
        >
          {tenants.map(tenant => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      </div>

      <div className="tenant-info-header">
        <div className="header-content">
          <h2>{selectedTenant.name}</h2>
          <p>{selectedTenant.description}</p>
          <small>Environment: {selectedTenant.dynatraceEnvironmentId}</small>
        </div>
        <div className="export-buttons">
          <button onClick={exportToExcel} className="export-btn excel-btn">
            📊 Export to Excel
          </button>
          <button onClick={exportToPDF} className="export-btn pdf-btn">
            📄 Export to PDF
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{tenantStats.totalAlarms}</div>
          <div className="stat-label">Total Alarms</div>
        </div>
        <div className="stat-card critical">
          <div className="stat-value">{tenantStats.openAlarms}</div>
          <div className="stat-label">Open Alarms</div>
        </div>
        <div className="stat-card major">
          <div className="stat-value">{tenantStats.closedAlarms}</div>
          <div className="stat-label">Closed Alarms</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{tenantStats.totalAssets}</div>
          <div className="stat-label">Total Assests</div>
        </div>
      </div>

      <div className="charts-section">
        <div className="chart-container">
          <h3>Operating System Distribution</h3>
          {Object.keys(tenantStats.osTypeCount).length > 0 ? (
            <Pie
              data={{
                labels: Object.keys(tenantStats.osTypeCount),
                datasets: [{
                  data: Object.values(tenantStats.osTypeCount),
                  backgroundColor: [
                    '#FF6B6B',
                    '#4ECDC4',
                    '#45B7D1',
                    '#FFA07A',
                    '#98D8C8',
                    '#F7DC6F',
                    '#BB8FCE',
                    '#85C1E2',
                  ],
                  borderColor: '#fff',
                  borderWidth: 2,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
              }}
            />
          ) : (
            <div className="empty-message">No OS data available</div>
          )}
        </div>

        <div className="chart-container">
          <h3>Asset Type Distribution</h3>
          {Object.keys(tenantStats.assetTypeCount).length > 0 ? (
            <Bar
              data={{
                labels: Object.keys(tenantStats.assetTypeCount),
                datasets: [{
                  label: 'Count',
                  data: Object.values(tenantStats.assetTypeCount),
                  backgroundColor: '#667eea',
                  borderColor: '#764ba2',
                  borderWidth: 1,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                  legend: {
                    display: false,
                  },
                },
                scales: {
                  x: {
                    beginAtZero: true,
                  },
                },
              }}
            />
          ) : (
            <div className="empty-message">No asset data available</div>
          )}
        </div>

        <div className="chart-container">
          <h3>Last 7 Days Alarm Count</h3>
          {Object.keys(tenantStats.last7DaysAlarmCount).length > 0 ? (
            <Bar
              data={{
                labels: Object.keys(tenantStats.last7DaysAlarmCount).map(date => {
                  const d = new Date(date);
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [
                  {
                    label: 'Open',
                    data: Object.values(tenantStats.last7DaysAlarmCount).map(d => d.open),
                    backgroundColor: '#FF6B6B',
                    borderColor: '#FF4444',
                    borderWidth: 1,
                  },
                  {
                    label: 'Closed',
                    data: Object.values(tenantStats.last7DaysAlarmCount).map(d => d.closed),
                    backgroundColor: '#4ECDC4',
                    borderColor: '#2BA39F',
                    borderWidth: 1,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                  },
                  x: {
                    stacked: false,
                  },
                },
              }}
            />
          ) : (
            <div className="empty-message">No alarm data available</div>
          )}
        </div>
      </div>

      <div className="tenant-details">
        <div className="details-section">
          <h3>Recent Alarms</h3>
          <div className="alarms-list">
            {tenantStats.alarms.slice(0, 5).map(alarm => (
              <div key={alarm.id} className={`alarm-item severity-${alarm.severity?.toLowerCase()}`}>
                <div className="alarm-title">{alarm.title}</div>
                <div className="alarm-meta">
                  <span className="severity">{alarm.severity}</span>
                  <span className="status">{alarm.status}</span>
                  <span className="time">{new Date(alarm.startTime).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {tenantStats.alarms.length === 0 && (
              <div className="empty-message">No alarms</div>
            )}
          </div>
        </div>

       
      </div>
    </div>
  );
}

