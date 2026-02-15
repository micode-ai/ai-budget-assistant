import { create } from 'zustand';
import { randomUUID } from 'expo-crypto';
import type { Project, Currency } from '@budget/shared-types';
import * as projectRepo from '@/db/projectRepository';
import { useAccountStore } from './accountStore';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';

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
      // Sync pending local projects to server (they may have never been synced)
      for (const p of projects) {
        if (p.syncStatus === 'pending') {
          maybeEncrypt('project', {
            name: p.name,
            description: p.description,
            budget: p.budget,
          }, p.accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
            return api.createProject({
              localId: p.id,
              name: encPayload.name ?? p.name,
              description: encPayload.description ?? p.description,
              color: p.color,
              icon: p.icon,
              startDate: p.startDate?.toISOString(),
              endDate: p.endDate?.toISOString(),
              budget: encPayload.budget ?? p.budget,
              currencyCode: p.currencyCode,
              encryptedPayload,
              encryptionKeyVersion,
            } as any);
          }).then(() => {
            projectRepo.upsertProject({ ...p, syncStatus: 'synced' });
          }).catch(() => {});
        }
      }
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
    // Fire-and-forget: sync to server with encryption (include localId so server stores it as clientId)
    maybeEncrypt('project', {
      name: data.name,
      description: data.description,
      budget: data.budget,
    }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
      api.createProject({
        ...data,
        localId: id,
        name: encPayload.name ?? data.name,
        description: encPayload.description ?? data.description,
        budget: encPayload.budget ?? data.budget,
        encryptedPayload,
        encryptionKeyVersion,
      } as any);
    }).catch(() => {});
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
      // The server's clientId is the local project's id.
      // If they differ, a duplicate local row exists — clean it up.
      const localId = proj.clientId || proj.localId;
      if (localId && localId !== proj.id) {
        const oldLocal = await projectRepo.getProjectById(localId);
        if (oldLocal) {
          await projectRepo.reassignProjectExpenses(localId, proj.id);
          await projectRepo.hardDeleteProject(localId);
        }
      }

      // Decrypt encrypted fields if present
      const decrypted = await maybeDecrypt('project', proj, proj.accountId);

      await projectRepo.upsertProject({
        id: proj.id,
        accountId: proj.accountId,
        localId: localId || proj.id,
        name: decrypted.name,
        description: decrypted.description || undefined,
        color: proj.color || undefined,
        icon: proj.icon || undefined,
        startDate: proj.startDate ? new Date(proj.startDate) : undefined,
        endDate: proj.endDate ? new Date(proj.endDate) : undefined,
        budget: decrypted.budget || undefined,
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
