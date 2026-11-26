import type { CardCycleSummary, UpsertCardCycleDto } from '@budget/shared-types';
import { httpClient } from './http-client';

export const cardCyclesApi = {
  getCardCycles() {
    return httpClient.request<CardCycleSummary[]>('/card-cycles');
  },

  saveCardCycle(dto: UpsertCardCycleDto) {
    return httpClient.request<CardCycleSummary>('/card-cycles', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  deleteCardCycle() {
    return httpClient.request<void>('/card-cycles', { method: 'DELETE' });
  },
};
