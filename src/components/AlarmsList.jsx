import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import '../styles/List.css';

export default function AlarmsList({ alarms, stats, onRefresh, user, onAlarmCountsChange }) {
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('OPEN');
  const [filterTenant, setFilterTenant] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAlarm, setSelectedAlarm] = useState(null);
  const [alarmDetails, setAlarmDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - 30);
  const local = date.toISOString().slice(0, 16);
  const tzOffset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - tzOffset * 60000)
    .toISOString()
    .slice(0, 16);
  return localDate; // 🔹 yerel saat (tarayıcı saati)
});
  
const [toDate, setToDate] = useState(() => {
  const date = new Date();
  const tzOffset = date.getTimezoneOffset() * 60000; // dakika farkını ms cinsinden al
  const localISOTime = new Date(date - tzOffset).toISOString().slice(0, 16);
  return localISOTime;
});

  const [isDateSyncing, setIsDateSyncing] = useState(false);
  const [syncAbortController, setSyncAbortController] = useState(null);
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [filteredByDateAlarms, setFilteredByDateAlarms] = useState([]);
  const [dateFilters, setDateFilters] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [sortColumn, setSortColumn] = useState('startTime');
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'
  const [dynamicStats, setDynamicStats] = useState(stats);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentModalMode, setCommentModalMode] = useState('post'); // 'post' or 'view'
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [alarmComments, setAlarmComments] = useState([]);
  const [commentError, setCommentError] = useState('');
  const [commentModalAlarm, setCommentModalAlarm] = useState(null);

  // Load date filters on component mount
  useEffect(() => {
    const loadDateFilters = async () => {
      try {
        setLoadingFilters(true);
        const response = await fetch('/api/alarms/filters/date');
        if (response.ok) {
          const data = await response.json();
          console.log('[ALARMS LIST] Date filters loaded:', data);
          setDateFilters(data);
        } else {
          console.warn('[ALARMS LIST] Failed to load date filters');
          setDateFilters([]);
        }
      } catch (error) {
        console.error('[ALARMS LIST] Error loading date filters:', error);
        setDateFilters([]);
      } finally {
        setLoadingFilters(false);
      }
    };
    loadDateFilters();
  }, []);

  // Update stats when tenant filter changes
  useEffect(() => {
    const loadStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        let url = '/api/alarms/stats';
        if (filterTenant) {
          // Find tenant ID from alarms
          const tenant = alarms.find(a => a.tenantName === filterTenant);
          if (tenant) {
            url += `?tenantId=${tenant.tenantId}`;
          }
        }

        const response = await fetch(url, { headers });
        if (response.ok) {
          const data = await response.json();
          console.log('[ALARMS LIST] Stats updated for tenant:', filterTenant, data);
          setDynamicStats(data);
        }
      } catch (error) {
        console.error('[ALARMS LIST] Error loading stats:', error);
        setDynamicStats(stats);
      }
    };

    loadStats();
  }, [filterTenant, alarms, stats]);

  // Get unique tenants
  const uniqueTenants = [...new Set(alarms.map(a => a.tenantName))];

  // Apply date filter if active
  // Special logic: OPEN alarms ignore date filter, CLOSED alarms use date filter
  let alarmsToFilter = alarms;
  if (dateFilterActive) {
    // Combine OPEN alarms (from main alarms) with CLOSED alarms (from filteredByDateAlarms)
    const openAlarms = alarms.filter(a => a.status === 'OPEN');
    const closedAlarms = filteredByDateAlarms.filter(a => a.status === 'CLOSED');
    alarmsToFilter = [...openAlarms, ...closedAlarms];
  }

  const filteredAlarms = alarmsToFilter.filter((alarm) => {
    if (filterSeverity && alarm.severity !== filterSeverity) return false;
    if (filterStatus !== 'All Status' && alarm.status !== filterStatus) return false;
    if (filterTenant && alarm.tenantName !== filterTenant) return false;

    // Search in all fields
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();

      const searchableFields = [
        alarm.title,
        alarm.description,
        alarm.severity,
        alarm.status,
        alarm.tenantName,
        alarm.dynatraceAlarmId,
        alarm.entityId,
        alarm.entityName,
      ];

      const matchesSearch = searchableFields.some(field =>
        field && String(field).toLowerCase().includes(searchLower)
      );

      if (!matchesSearch) return false;
    }

    return true;
  });

  // Calculate open and closed counts for the current filter
  const openCount = filteredAlarms.filter(a => a.status === 'OPEN').length;
  const closedCount = filteredAlarms.filter(a => a.status === 'CLOSED').length;

  // Notify parent component of alarm counts change
  useEffect(() => {
    if (onAlarmCountsChange) {
      onAlarmCountsChange({ open: openCount, closed: closedCount });
    }
  }, [openCount, closedCount, onAlarmCountsChange]);

  // Sort alarms by selected column
  const sortedAlarms = [...filteredAlarms].sort((a, b) => {
    let valueA, valueB;

    switch (sortColumn) {
      case 'startTime':
        valueA = new Date(a.startTime || a.createdAt || 0).getTime();
        valueB = new Date(b.startTime || b.createdAt || 0).getTime();
        break;
      case 'endTime':
        valueA = new Date(a.endTime || 0).getTime();
        valueB = new Date(b.endTime || 0).getTime();
        break;
      case 'severity':
        valueA = a.severity || '';
        valueB = b.severity || '';
        break;
      case 'status':
        valueA = a.status || '';
        valueB = b.status || '';
        break;
      case 'title':
        valueA = (a.title || '').toLowerCase();
        valueB = (b.title || '').toLowerCase();
        break;
      case 'tenant':
        valueA = (a.tenantName || '').toLowerCase();
        valueB = (b.tenantName || '').toLowerCase();
        break;
      default:
        valueA = a.startTime;
        valueB = b.startTime;
    }

    if (sortDirection === 'asc') {
      return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
    } else {
      return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
    }
  });

  const handleAlarmClick = async (alarm) => {
    setSelectedAlarm(alarm);
    setLoadingDetails(true);
    try {
      console.log('[ALARMS LIST] Fetching details for alarm:', alarm.dynatraceAlarmId);
      console.log('[ALARMS LIST] Tenant ID:', alarm.tenantId);

      const url = `/api/alarms/${alarm.dynatraceAlarmId}/details?tenantId=${alarm.tenantId}`;
      console.log('[ALARMS LIST] Fetching from URL:', url);

      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(url, {
        headers
      });

      if (!response.ok) {
        console.error('[ALARMS LIST] Response not OK:', response.status, response.statusText);
        const errorData = await response.json();
        console.error('[ALARMS LIST] Error response:', errorData);
        setAlarmDetails({ error: `Failed to fetch details: ${response.statusText}` });
        return;
      }

      const details = await response.json();
      console.log('[ALARMS LIST] Alarm details received:', details);
      setAlarmDetails(details);
    } catch (error) {
      console.error('[ALARMS LIST] Error fetching alarm details:', error);
      setAlarmDetails({ error: error.message });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      setCommentError('Please enter a comment');
      return;
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      setCommentError('You must be logged in to post a comment');
      return;
    }

    if (!commentModalAlarm) {
      setCommentError('No alarm selected');
      return;
    }

    setSubmittingComment(true);
    setCommentError('');
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const response = await fetch(
        `/api/alarms/${commentModalAlarm.dynatraceAlarmId}/comments?tenantId=${commentModalAlarm.tenantId}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: commentText }),
        }
      );

      if (response.ok) {
        console.log('[ALARMS LIST] Comment added successfully');
        setCommentText('');
        setCommentModalOpen(false);
        setCommentError('');
      } else {
        const error = await response.json();
        setCommentError(`Failed to add comment: ${error.message || response.statusText}`);
      }
    } catch (error) {
      console.error('[ALARMS LIST] Error adding comment:', error);
      setCommentError(`Error adding comment: ${error.message}`);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleEditComment = async (commentId) => {
    if (!editingCommentText.trim()) {
      setCommentError('Please enter a comment');
      return;
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      setCommentError('You must be logged in to edit a comment');
      return;
    }

    if (!commentModalAlarm) {
      setCommentError('No alarm selected');
      return;
    }

    setSubmittingComment(true);
    setCommentError('');
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const response = await fetch(
        `/api/alarms/${commentModalAlarm.dynatraceAlarmId}/comments/${commentId}?tenantId=${commentModalAlarm.tenantId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ message: editingCommentText }),
        }
      );

      if (response.ok) {
        console.log('[ALARMS LIST] Comment updated successfully');
        setEditingCommentId(null);
        setEditingCommentText('');
        setCommentError('');
        // Reload comments
        try {
          const url = `/api/alarms/${commentModalAlarm.dynatraceAlarmId}/details?tenantId=${commentModalAlarm.tenantId}`;
          const response = await fetch(url, { headers });
          if (response.ok) {
            const details = await response.json();
            setAlarmComments(details?.recentComments?.comments || []);
          }
        } catch (error) {
          console.error('Error reloading comments:', error);
        }
      } else {
        const error = await response.json();
        setCommentError(`Failed to update comment: ${error.message || response.statusText}`);
      }
    } catch (error) {
      console.error('[ALARMS LIST] Error updating comment:', error);
      setCommentError(`Error updating comment: ${error.message}`);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSyncWithDateRange = async () => {
    if (!fromDate || !toDate) {
      alert('Please select both From and To dates');
      return;
    }

    setIsDateSyncing(true);
    const controller = new AbortController();
    setSyncAbortController(controller);

    try {
      // Convert datetime-local to ISO format
      const fromDateTime = new Date(fromDate + ':00');
      const toDateTime = new Date(toDate + ':00');

      const fromISO = fromDateTime.toISOString();
      const toISO = toDateTime.toISOString();

      console.log('[ALARMS LIST] Fetching alarms with date range:', { fromISO, toISO });

      // Fetch alarms from backend with date range
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/alarms?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch alarms: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[ALARMS LIST] Fetched alarms:', data.alarms.length);

      setFilteredByDateAlarms(data.alarms || []);
      setDateFilterActive(true);

      // Change filterStatus to "All Status" when date filter is applied
      setFilterStatus('All Status');
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[ALARMS LIST] Filter cancelled by user');
      } else {
        console.error('[ALARMS LIST] Error during filter:', error);
        alert('Error filtering alarms: ' + error.message);
      }
    } finally {
      setIsDateSyncing(false);
      setSyncAbortController(null);
    }
  };

  const handleStopSync = () => {
    if (syncAbortController) {
      syncAbortController.abort();
      setIsDateSyncing(false);
      setSyncAbortController(null);
      console.log('[ALARMS LIST] Filter stopped by user');
    }
    // Clear date filter
    setDateFilterActive(false);
    setFilteredByDateAlarms([]);
  };

  const handleQuickSync = (seconds) => {
    console.log('[ALARMS LIST] Quick sync with', seconds, 'seconds');
    const now = new Date();
    const from = new Date(now.getTime() - seconds * 1000);

    // Filter alarms immediately
    const filtered = alarms.filter(alarm => {
      const alarmDate = new Date(alarm.createdAt || alarm.startTime);
      return alarmDate >= from && alarmDate <= now;
    });

    setFromDate(from.toISOString().slice(0, 16));
    setToDate(now.toISOString().slice(0, 16));
    setFilteredByDateAlarms(filtered);
    setDateFilterActive(true);
    console.log('[ALARMS LIST] Quick sync filtered', filtered.length, 'alarms');
  };

  const handleSyncNow = async () => {
    console.log('[ALARMS LIST] Sync Now clicked');
    setIsDateSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/alarms/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        console.log('[ALARMS LIST] Sync completed');
        onRefresh();
      }
    } catch (error) {
      console.error('[ALARMS LIST] Error during sync:', error);
    } finally {
      setIsDateSyncing(false);
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      CRITICAL: '#d32f2f',
      MAJOR: '#f57c00',
      MINOR: '#fbc02d',
      WARNING: '#1976d2',
      INFO: '#388e3c',
      ERROR: '#d32f2f',
      RESOURCE_CONTENTION: '#ff6f00',
      AVAILABILITY: '#d32f2f',
      PERFORMANCE: '#f57c00',
      CUSTOM_ALERT: '#1976d2',
      Total: '#667eea',
      Closed: '#388e3c',
    };
    return colors[severity] || '#999';
  };

  const exportToExcel = () => {
    const data = filteredAlarms.map(alarm => ({
      'Tenant': alarm.tenantName,
      'Title': alarm.title,
      'Severity': alarm.severity,
      'Status': alarm.status,
      'Entity': alarm.affectedEntity,
      'Start Time': new Date(alarm.startTime).toLocaleString(),
      'End Time': alarm.endTime ? new Date(alarm.endTime).toLocaleString() : 'N/A',
      'Problem ID': alarm.dynatraceAlarmId,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Alarms');
    XLSX.writeFile(workbook, `alarms_${new Date().toISOString().slice(0, 10)}.xlsx`);
    console.log('[ALARMS LIST] Excel exported successfully');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 10;

    // Title
    doc.setFontSize(16);
    doc.text('Alarms Report', 10, yPosition);
    yPosition += 10;

    // Metadata
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 10, yPosition);
    yPosition += 5;
    doc.text(`Total Alarms: ${filteredAlarms.length}`, 10, yPosition);
    yPosition += 10;

    // Table headers
    doc.setFontSize(9);
    const headers = ['Tenant', 'Title', 'Severity', 'Status', 'Entity', 'Start Time'];
    const columnWidths = [20, 40, 20, 20, 30, 40];
    let xPosition = 10;

    doc.setFillColor(200, 200, 200);
    headers.forEach((header, idx) => {
      doc.rect(xPosition, yPosition - 5, columnWidths[idx], 7, 'F');
      doc.text(header, xPosition + 2, yPosition);
      xPosition += columnWidths[idx];
    });
    yPosition += 10;

    // Table rows
    filteredAlarms.forEach((alarm) => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 10;
      }

      xPosition = 10;
      const rowData = [
        alarm.tenantName,
        alarm.title.substring(0, 30),
        alarm.severity,
        alarm.status,
        alarm.affectedEntity.substring(0, 20),
        new Date(alarm.startTime).toLocaleString().substring(0, 16),
      ];

      rowData.forEach((data, idx) => {
        doc.text(data, xPosition + 2, yPosition);
        xPosition += columnWidths[idx];
      });
      yPosition += 7;
    });

    doc.save(`alarms_${new Date().toISOString().slice(0, 10)}.pdf`);
    console.log('[ALARMS LIST] PDF exported successfully');
  };

  const getStatusColor = (status) => {
    const colors = {
      OPEN: '#d32f2f',
      CLOSED: '#388e3c',
      RESOLVED: '#388e3c',
      ACKNOWLEDGED: '#1976d2',
    };
    return colors[status] || '#999';
  };

  const getStatusLabel = (status) => {
    const labels = {
      OPEN: '🔴 Open',
      CLOSED: '✅ Closed',
      RESOLVED: '✅ Resolved',
      ACKNOWLEDGED: '🔵 Acknowledged',
    };
    return labels[status] || status;
  };

  return (
    <div className="list-container">
      <div className="filters">
        <div className="filter-row">
          <select value={filterTenant} onChange={(e) => setFilterTenant(e.target.value)}>
            <option value="">All Tenants</option>
            {uniqueTenants.map((tenant) => (
              <option key={tenant} value={tenant}>
                {tenant}
              </option>
            ))}
          </select>

          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="MAJOR">Major</option>
            <option value="MINOR">Minor</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
            <option value="ERROR">Error</option>
            <option value="RESOURCE_CONTENTION">Resource Contention</option>
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="OPEN">🔴 Open</option>
            <option value="CLOSED">✅ Closed</option>
            <option value="RESOLVED">✅ Resolved</option>
            <option value="ACKNOWLEDGED">🔵 Acknowledged</option>
            <option value="All Status">All Status</option>
          </select>
        </div>

        <div className="filter-row">
          <input
            type="text"
            placeholder="🔍 Search alarms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-row">
          <label>From:</label>
          <input
            type="datetime-local"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            disabled={isDateSyncing}
          />
          <label>To:</label>
          <input
            type="datetime-local"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            disabled={isDateSyncing}
          />
          {isDateSyncing ? (
            <button onClick={handleStopSync} className="stop-sync-btn">
              ⏹ Stop
            </button>
          ) : (
            <button onClick={handleSyncWithDateRange} className="sync-date-btn">
              🔄 Filter
            </button>
          )}
          <button onClick={exportToExcel} className="export-btn" title="Export to Excel">
            📊 Excel
          </button>
          <button onClick={exportToPDF} className="export-btn" title="Export to PDF">
            📄 PDF
          </button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>
                <button onClick={() => { setSortColumn('id'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  ID {sortColumn === 'id' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>
                <button onClick={() => { setSortColumn('tenant'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  Tenant {sortColumn === 'tenant' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>
                <button onClick={() => { setSortColumn('title'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  Title {sortColumn === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>
                <button onClick={() => { setSortColumn('severity'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  Severity {sortColumn === 'severity' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>
                <button onClick={() => { setSortColumn('status'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  Status {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>Entity</th>
              <th>
                <button onClick={() => { setSortColumn('startTime'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  Start Time {sortColumn === 'startTime' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>
                <button onClick={() => { setSortColumn('endTime'); setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }} className="sort-header-btn">
                  End Time {sortColumn === 'endTime' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAlarms.map((alarm, index) => (
              <tr key={alarm.id || alarm._id}>
                <td>{index + 1}</td>
                <td>{alarm.tenantName}</td>
                <td>{alarm.title}</td>
                <td>
                  <span className="badge" style={{ backgroundColor: getSeverityColor(alarm.severity) }}>
                    {alarm.severity}
                  </span>
                </td>
                <td>
                  <span className="badge" style={{ backgroundColor: getStatusColor(alarm.status) }}>
                    {getStatusLabel(alarm.status)}
                  </span>
                </td>
                <td>{alarm.affectedEntity}</td>
                <td>{new Date(alarm.startTime).toLocaleString()}</td>
                <td>{alarm.endTime ? new Date(alarm.endTime).toLocaleString() : '-'}</td>
                <td style={{ textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAlarmClick(alarm);
                    }}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#FF9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                    }}
                    title="View problem details"
                  >
                    📋 Details
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommentError('');
                      setCommentModalMode('post');
                      setCommentText('');
                      setCommentModalAlarm(alarm);
                      setCommentModalOpen(true);
                    }}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                    }}
                    title="Post a new comment"
                  >
                    ➕ Post
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setCommentError('');
                      setCommentModalMode('view');
                      // Load alarm details first
                      try {
                        const url = `/api/alarms/${alarm.dynatraceAlarmId}/details?tenantId=${alarm.tenantId}`;
                        const token = localStorage.getItem('token');
                        const headers = {};
                        if (token) {
                          headers['Authorization'] = `Bearer ${token}`;
                        }
                        const response = await fetch(url, { headers });
                        if (response.ok) {
                          const details = await response.json();
                          setAlarmComments(details?.recentComments?.comments || []);
                        } else {
                          setAlarmComments([]);
                        }
                      } catch (error) {
                        console.error('Error loading comments:', error);
                        setAlarmComments([]);
                      }
                      setCommentModalAlarm(alarm);
                      setCommentModalOpen(true);
                    }}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                    }}
                    title="View comments"
                  >
                    👁️ View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alarm Details Modal */}
      {selectedAlarm && (
        <div className="modal-overlay" onClick={() => setSelectedAlarm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedAlarm.title}</h2>
              <button className="close-btn" onClick={() => setSelectedAlarm(null)}>×</button>
            </div>
            <div className="modal-body">
              {loadingDetails ? (
                <p>Loading details...</p>
              ) : alarmDetails?.error ? (
                <div className="error-message">
                  <p>❌ {alarmDetails.error}</p>
                </div>
              ) : alarmDetails ? (
                <div className="alarm-details">
                  <div className="detail-section">
                    <h3>Basic Information</h3>
                    <p><strong>Problem ID:</strong> {alarmDetails.problemId}</p>
                    <p><strong>Display ID:</strong> {alarmDetails.displayId}</p>
                    <p><strong>Status:</strong> {alarmDetails.status}</p>
                    <p><strong>Severity:</strong> {alarmDetails.severityLevel}</p>
                    <p><strong>Impact Level:</strong> {alarmDetails.impactLevel}</p>
                    <p><strong>Start Time:</strong> {new Date(alarmDetails.startTime).toLocaleString()}</p>
                    {alarmDetails.endTime && alarmDetails.endTime > 0 && (
                      <p><strong>End Time:</strong> {new Date(alarmDetails.endTime).toLocaleString()}</p>
                    )}
                  </div>

                  {alarmDetails.affectedEntities && alarmDetails.affectedEntities.length > 0 && (
                    <div className="detail-section">
                      <h3>Affected Entities</h3>
                      {alarmDetails.affectedEntities.map((entity, idx) => (
                        <div key={idx}>
                          <p><strong>{entity.name}</strong> ({entity.entityId?.type})</p>
                          <p style={{ fontSize: '0.9em', color: '#666' }}>ID: {entity.entityId?.id}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {alarmDetails.impactAnalysis && alarmDetails.impactAnalysis.impacts && alarmDetails.impactAnalysis.impacts.length > 0 && (
                    <div className="detail-section">
                      <h3>Impact Analysis</h3>
                      {alarmDetails.impactAnalysis.impacts.map((impact, idx) => (
                        <div key={idx}>
                          <p><strong>Type:</strong> {impact.impactType}</p>
                          <p><strong>Estimated Affected Users:</strong> {impact.estimatedAffectedUsers}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {alarmDetails.evidenceDetails && alarmDetails.evidenceDetails.details && alarmDetails.evidenceDetails.details.length > 0 && (
                    <div className="detail-section">
                      <h3>Evidence Details ({alarmDetails.evidenceDetails.totalCount})</h3>
                      {alarmDetails.evidenceDetails.details.map((evidence, idx) => (
                        <div key={idx} style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                          <p><strong>Type:</strong> {evidence.evidenceType}</p>
                          <p><strong>Display Name:</strong> {evidence.displayName}</p>
                          <p><strong>Start Time:</strong> {new Date(evidence.startTime).toLocaleString()}</p>
                          <p><strong>Root Cause Relevant:</strong> {evidence.rootCauseRelevant ? '✓ Yes' : '✗ No'}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {alarmDetails.managementZones && alarmDetails.managementZones.length > 0 && (
                    <div className="detail-section">
                      <h3>Management Zones</h3>
                      {alarmDetails.managementZones.map((zone, idx) => (
                        <p key={idx}>{zone.name}</p>
                      ))}
                    </div>
                  )}


                </div>
              ) : (
                <p>No details available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {commentModalOpen && commentModalAlarm && (
        <div className="modal-overlay" onClick={() => {
          setCommentModalOpen(false);
          setCommentModalAlarm(null);
          setCommentError('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{commentModalMode === 'post' ? '➕ Post Comment' : '👁️ View Comments'}</h2>
              <button className="close-btn" onClick={() => {
                setCommentModalOpen(false);
                setCommentModalAlarm(null);
                setCommentError('');
              }}>×</button>
            </div>
            <div className="modal-body">
              {commentError && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#ffebee',
                  border: '1px solid #ef5350',
                  borderRadius: '4px',
                  marginBottom: '15px',
                  color: '#c62828',
                  fontSize: '13px',
                }}>
                  ❌ {commentError}
                </div>
              )}
              {commentModalMode === 'post' ? (
                <div>
                  <p style={{ marginBottom: '15px', color: '#666' }}>
                    <strong>Alarm:</strong> {commentModalAlarm.title}
                  </p>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter your comment..."
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '12px',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      marginBottom: '15px',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setCommentModalOpen(false);
                        setCommentModalAlarm(null);
                        setCommentError('');
                      }}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#999',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddComment}
                      disabled={submittingComment || !commentText.trim()}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: submittingComment || !commentText.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        opacity: submittingComment || !commentText.trim() ? 0.6 : 1,
                      }}
                    >
                      {submittingComment ? '⏳ Posting...' : '✓ Post Comment'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: '15px', color: '#666' }}>
                    <strong>Alarm:</strong> {commentModalAlarm.title}
                  </p>
                  {alarmComments && alarmComments.length > 0 ? (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {alarmComments.map((comment) => (
                        <div key={comment.id} style={{
                          padding: '12px',
                          backgroundColor: '#f9f9f9',
                          borderLeft: '4px solid #667eea',
                          borderRadius: '4px',
                          marginBottom: '12px',
                        }}>
                          {editingCommentId === comment.id ? (
                            <div>
                              <textarea
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                style={{
                                  width: '100%',
                                  minHeight: '60px',
                                  padding: '8px',
                                  borderRadius: '4px',
                                  border: '1px solid #ddd',
                                  fontFamily: 'Arial, sans-serif',
                                  fontSize: '13px',
                                  boxSizing: 'border-box',
                                  marginBottom: '8px',
                                }}
                              />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => handleEditComment(comment.id)}
                                  disabled={submittingComment}
                                  style={{
                                    padding: '6px 12px',
                                    backgroundColor: '#4caf50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: submittingComment ? 'not-allowed' : 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    opacity: submittingComment ? 0.6 : 1,
                                  }}
                                >
                                  {submittingComment ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingCommentId(null);
                                    setEditingCommentText('');
                                    setCommentError('');
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    backgroundColor: '#999',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                  <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '13px' }}>
                                    {comment.authorName}
                                  </p>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                                    {new Date(comment.createdAtTimestamp).toLocaleString()}
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentText(comment.content);
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#667eea',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                  }}
                                >
                                  ✎ Edit
                                </button>
                              </div>
                              <p style={{ margin: '8px 0 0 0', fontSize: '13px', lineHeight: '1.5' }}>
                                {comment.content}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#999', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                      No comments yet
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

