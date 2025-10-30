import client from './client';

export const authConfigAPI = {
  getConfig: () =>
    client.get('/auth-config'),

  updateConfig: (configData) =>
    client.put('/auth-config', configData),
};

