import ky from 'ky';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const api = ky.create({
  prefixUrl: API_BASE_URL,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('admin_token');
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
            window.location.href = `${basePath}/login`;
          }
        }
        return response;
      },
    ],
  },
});
