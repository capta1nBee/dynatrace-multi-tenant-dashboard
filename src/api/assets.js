import client from './client';

export const assetsAPI = {
  sync: () =>
    client.post('/assets/sync'),

  getAll: (filters = {}) =>
    client.get('/assets', { params: filters }),

  getStats: () =>
    client.get('/assets/stats'),
};

