import { useImportStore } from '../importStore';

describe('importStore consent tracking', () => {
  beforeEach(() => {
    useImportStore.setState({ aiConsentGrantedFor: null });
    useImportStore.getState().reset();
  });

  it('starts with no consent recorded', () => {
    expect(useImportStore.getState().aiConsentGrantedFor).toBeNull();
  });

  it('records the account that granted consent', () => {
    useImportStore.getState().setAiConsentGrantedFor('acc-1');
    expect(useImportStore.getState().aiConsentGrantedFor).toBe('acc-1');
  });

  it('survives reset(), which clears the file and preview but not consent', () => {
    useImportStore.getState().setFileAsset({ uri: 'u', name: 'n', type: 't' });
    useImportStore.getState().setAiConsentGrantedFor('acc-1');
    useImportStore.getState().reset();
    expect(useImportStore.getState().fileAsset).toBeNull();
    expect(useImportStore.getState().previewData).toBeNull();
    expect(useImportStore.getState().aiConsentGrantedFor).toBe('acc-1');
  });
});
