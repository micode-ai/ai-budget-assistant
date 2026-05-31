import type { Category, Tag } from '@budget/shared-types';
import { httpClient } from './http-client';

export const categoriesApi = {
  getCategories() {
    return httpClient.request<Category[]>('/categories');
  },

  createCategory(data: { name: string; icon?: string; color?: string; type: string; parentId?: string }) {
    return httpClient.request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCategory(id: string, data: { name?: string; icon?: string; color?: string }) {
    return httpClient.request<Category>(`/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCategory(id: string) {
    return httpClient.request<void>(`/categories/${id}`, { method: 'DELETE' });
  },

  getTags() {
    return httpClient.request<Tag[]>('/tags');
  },

  createTag(data: { name: string; color?: string; icon?: string; clientId?: string }) {
    return httpClient.request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTag(id: string, data: { name?: string; color?: string; icon?: string }) {
    return httpClient.request<Tag>(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteTag(id: string) {
    return httpClient.request<void>(`/tags/${id}`, { method: 'DELETE' });
  },
};
