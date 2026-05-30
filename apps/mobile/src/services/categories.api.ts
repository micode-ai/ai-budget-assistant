import { httpClient } from './http-client';

export const categoriesApi = {
  getCategories() {
    return httpClient.request<any[]>('/categories');
  },

  createCategory(data: { name: string; icon?: string; color?: string; type: string; parentId?: string }) {
    return httpClient.request<any>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCategory(id: string, data: { name?: string; icon?: string; color?: string }) {
    return httpClient.request<any>(`/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCategory(id: string) {
    return httpClient.request<void>(`/categories/${id}`, { method: 'DELETE' });
  },

  getTags() {
    return httpClient.request<any[]>('/tags');
  },

  createTag(data: { name: string; color?: string; icon?: string; clientId?: string }) {
    return httpClient.request<any>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTag(id: string, data: { name?: string; color?: string; icon?: string }) {
    return httpClient.request<any>(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteTag(id: string) {
    return httpClient.request<void>(`/tags/${id}`, { method: 'DELETE' });
  },
};
