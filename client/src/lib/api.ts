import axios, { type InternalAxiosRequestConfig } from 'axios';

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 401 &&
      err.config
    ) {
      const config = err.config as RetryableConfig;
      if (config._retry) return Promise.reject(err);

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        config._retry = true;
        try {
          const { data } = await axios.post<{ accessToken: string }>(
            '/api/auth/refresh',
            { refreshToken },
          );
          localStorage.setItem('accessToken', data.accessToken);
          config.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(config);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  },
);

export default api;
