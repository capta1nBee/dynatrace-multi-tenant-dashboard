import client from './client';

export const authAPI = {
  register: (username, email, password) =>
    client.post('/auth/register', { username, email, password }),

  login: (username, password) =>
    client.post('/auth/login', { username, password }),

  getProfile: () =>
    client.get('/auth/profile'),
};

