import { useInvitationStore } from '../invitationStore';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getMyInvitations: jest.fn(),
    respondToInvitation: jest.fn(),
  },
}));

describe('invitationStore', () => {
  beforeEach(() => {
    useInvitationStore.setState({ invitations: [], isLoading: false });
    jest.clearAllMocks();
  });

  it('loadInvitations populates state from the API', async () => {
    (api.getMyInvitations as jest.Mock).mockResolvedValue([
      { id: 'inv-1', accountId: 'account-1', accountName: 'Bali Trip', accountType: 'trip', inviterName: 'Owner', role: 'editor', createdAt: '2026-07-01' },
    ]);

    await useInvitationStore.getState().loadInvitations();

    expect(useInvitationStore.getState().invitations).toHaveLength(1);
    expect(useInvitationStore.getState().isLoading).toBe(false);
  });

  it('loadInvitations keeps the previous list and stops loading on failure', async () => {
    useInvitationStore.setState({ invitations: [{ id: 'inv-1' }] as any });
    (api.getMyInvitations as jest.Mock).mockRejectedValue(new Error('offline'));

    await useInvitationStore.getState().loadInvitations();

    expect(useInvitationStore.getState().invitations).toHaveLength(1);
    expect(useInvitationStore.getState().isLoading).toBe(false);
  });

  it('respond removes the invitation from state optimistically on success', async () => {
    useInvitationStore.setState({
      invitations: [{ id: 'inv-1', accountId: 'account-1' } as any],
    });
    (api.respondToInvitation as jest.Mock).mockResolvedValue({});

    await useInvitationStore.getState().respond('inv-1', 'accept');

    expect(api.respondToInvitation).toHaveBeenCalledWith('inv-1', 'accept');
    expect(useInvitationStore.getState().invitations).toHaveLength(0);
  });

  it('respond restores the invitation on failure', async () => {
    const invitation = { id: 'inv-1', accountId: 'account-1' } as any;
    useInvitationStore.setState({ invitations: [invitation] });
    (api.respondToInvitation as jest.Mock).mockRejectedValue(new Error('network'));

    await expect(useInvitationStore.getState().respond('inv-1', 'decline')).rejects.toThrow('network');

    expect(useInvitationStore.getState().invitations).toEqual([invitation]);
  });
});
