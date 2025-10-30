import client from './client';

export const brandingAPI = {
  getBranding: () =>
    client.get('/branding'),

  updateBranding: (brandingData) =>
    client.put('/branding', brandingData),
};

