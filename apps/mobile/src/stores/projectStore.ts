import { create } from 'zustand';
import { randomUUID } from 'expo-crypto';
import type { Project, Currency } from '@budget/shared-types';
import * as projectRepo from '@/db/projectRepository';
import { useAccountStore } from './accountStore';
import { api } from '@/services/api';

interface ProjectState {
  projects: Project[];
  isLoading: boolean;

  loadProjects: () => Promise<void>;
  createProject: (data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    startDate?: Date;
    endDate?: Date;
    budget?: number;
    currencyCode?: Currency;
  }) => Promise<Project>;
  updateProject: (id: string, updates: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    startDate?: Date;
    endDate?: Date;
    budget?: number;
    currencyCode?: Currency;
    isArchived?: boolean;
  }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addExpenseToProject: (projectId: string, expenseId: string) => Promise<void>;
  removeExpenseFromProject: (projectId: string, expenseId: string) => Promise<void>;
  getActiveProjects: () => Project[];
  getArchivedProjects: () => Project[];
  syncFromServer: (serverProjects: any[]) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  isLoading: false,

  loadProjects: async () => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;
    set({ isLoading: true });
    try {
      const projects = await projectRepo.getAllProjects(accountId);
      set({ projects });
      // Fire-and-forget: fetch from server
      api.getProjects(true).then(serverProjects => {
        if (serverProjects) get().syncFromServer(serverProjects);
      }).catch(() => {});
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (data) => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) throw new Error('No account');
    const now = new Date();
    const id = randomUUID();
    const localId = randomUUID();
    const project: Project = {
      id,
      accountId,
      localId,
      name: data.name,
      description: data.description,
      color: data.color,
      icon: data.icon,
      startDate: data.startDate,
      endDate: data.endDate,
      budget: data.budget,
      currencyCode: data.currencyCode,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: 'pending',
      syncVersion: 0,
    };
    await projectRepo.insertProject(project);
    set({ projects: [...get().projects, project] });
    // Fire-and-forget: sync to server
    api.createProject(data).catch(() => {});
    return project;
  },

  updateProject: async (id, updates) => {
    const project = get().projects.find(p => p.id === id);
    if (!project) return;
    const updated = { ...project, ...updates, updatedAt: new Date() };
    await projectRepo.upsertProject(updated);
    set({ projects: get().projects.map(p => p.id === id ? updated : p) });
    api.updateProject(id, updates).catch(() => {});
  },

  deleteProject: async (id: string) => {
    await projectRepo.deleteProject(id);
    set({ projects: get().projects.filter(p => p.id !== id) });
    api.deleteProject(id).catch(() => {});
  },

  addExpenseToProject: async (projectId: string, expenseId: string) => {
    const now = new Date();
    const id = randomUUID();
    await projectRepo.addExpenseToProject({
      id,
      projectId,
      expenseId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncVersion: 0,
    });
    // Fire-and-forget: sync to server
    api.addExpenseToProject(projectId, expenseId).catch(() => {});
  },

  removeExpenseFromProject: async (projectId: string, expenseId: string) => {
    await projectRepo.removeExpenseFromProject(projectId, expenseId);
    api.removeExpenseFromProject(projectId, expenseId).catch(() => {});
  },

  getActiveProjects: () => {
    return get().projects.filter(p => !p.isArchived && !p.isDeleted);
  },

  getArchivedProjects: () => {
    return get().projects.filter(p => p.isArchived && !p.isDeleted);
  },

  syncFromServer: async (serverProjects: any[]) => {
    for (const proj of serverProjects) {
      await projectRepo.upsertProject({
        id: proj.id,
        accountId: proj.accountId,
        localId: proj.localId || proj.id,
        name: proj.name,
        description: proj.description || undefined,
        color: proj.color || undefined,
        icon: proj.icon || undefined,
        startDate: proj.startDate ? new Date(proj.startDate) : undefined,
        endDate: proj.endDate ? new Date(proj.endDate) : undefined,
        budget: proj.budget || undefined,
        currencyCode: proj.currencyCode || undefined,
        isArchived: proj.isArchived ?? false,
        createdAt: new Date(proj.createdAt),
        updatedAt: new Date(proj.updatedAt),
        isDeleted: proj.isDeleted ?? false,
        syncStatus: 'synced',
        syncVersion: proj.syncVersion || 0,
      });
    }
    // Reload from local DB only (don't call loadProjects to avoid infinite loop)
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;
    const projects = await projectRepo.getAllProjects(accountId);
    set({ projects });
  },
}));
