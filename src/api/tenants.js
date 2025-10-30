import client from './client';

export const tenantsAPI = {
  create: (tenantData) =>
    client.post('/tenants', tenantData),

  getAll: () =>
    client.get('/tenants'),

  getById: (id) =>
    client.get(`/tenants/${id}`),

  update: (id, tenantData) =>
    client.put(`/tenants/${id}`, tenantData),

  delete: (id) =>
    client.delete(`/tenants/${id}`),
};

