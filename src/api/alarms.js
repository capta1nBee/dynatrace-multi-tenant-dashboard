import client from './client';

export const alarmsAPI = {
  sync: () =>
    client.post('/alarms/sync'),

  getAll: (filters = {}) =>
    client.get('/alarms', { params: filters }),

  getStats: () =>
    client.get('/alarms/stats'),

  getDateFilters: () =>
    client.get('/alarms/filters/date'),

  // Update alarm status by displayId
  updateStatus: (displayId, status, tenantId) =>
    client.put(`/alarms/status/${displayId}`, { status, tenantId }),

  // Comment operations
  addComment: (problemId, commentData, tenantId) =>
    client.post(`/alarms/${problemId}/comments`, commentData, { params: { tenantId } }),

  updateComment: (problemId, commentId, commentData, tenantId) =>
    client.put(`/alarms/${problemId}/comments/${commentId}`, commentData, { params: { tenantId } }),

  getComment: (problemId, commentId, tenantId) =>
    client.get(`/alarms/${problemId}/comments/${commentId}`, { params: { tenantId } }),
};

