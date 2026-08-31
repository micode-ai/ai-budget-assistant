describe('restoreCredentials Android implementation', () => {
  let mockModule: any;
  let consoleWarnSpy: jest.SpyInstance;
  let createRestoreCredential: any;
  let getRestoreCredential: any;
  let clearRestoreCredential: any;
  let isRestoreCredentialAvailable: any;

  beforeEach(() => {
    // Clear all module caches and mocks before each test
    jest.resetModules();
    jest.clearAllMocks();

    // Set up the mock module
    mockModule = {
      createCredential: jest.fn(),
      getCredential: jest.fn(),
      clearCredential: jest.fn(),
    };

    // Mock react-native before importing the implementation
    jest.doMock('react-native', () => ({
      NativeModules: {
        RestoreCredentialModule: mockModule,
      },
    }));

    // Now import the implementation with the mocked NativeModules
    const impl = require('../index.android');
    createRestoreCredential = impl.createRestoreCredential;
    getRestoreCredential = impl.getRestoreCredential;
    clearRestoreCredential = impl.clearRestoreCredential;
    isRestoreCredentialAvailable = impl.isRestoreCredentialAvailable;

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    jest.dontMock('react-native');
  });

  describe('module present, native calls succeed', () => {
    it('createRestoreCredential passes through the native response', async () => {
      const requestJson = '{"test":"data"}';
      const responseJson = '{"response":"success"}';
      mockModule.createCredential.mockResolvedValue(responseJson);

      const result = await createRestoreCredential(requestJson);

      expect(result).toBe(responseJson);
      expect(mockModule.createCredential).toHaveBeenCalledWith(requestJson);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('getRestoreCredential passes through the native response', async () => {
      const requestJson = '{"test":"data"}';
      const responseJson = '{"assertion":"data"}';
      mockModule.getCredential.mockResolvedValue(responseJson);

      const result = await getRestoreCredential(requestJson);

      expect(result).toBe(responseJson);
      expect(mockModule.getCredential).toHaveBeenCalledWith(requestJson);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('clearRestoreCredential completes without throwing', async () => {
      mockModule.clearCredential.mockResolvedValue(true);

      const result = await clearRestoreCredential();

      expect(result).toBeUndefined();
      expect(mockModule.clearCredential).toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('isRestoreCredentialAvailable is true when the native module is registered', () => {
      expect(isRestoreCredentialAvailable()).toBe(true);
    });
  });

  describe('module present, native calls reject', () => {
    it('createRestoreCredential resolves to null on native error and logs warn', async () => {
      const error = new Error('native error');
      mockModule.createCredential.mockRejectedValue(error);

      const result = await createRestoreCredential('{}');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[RestoreCredentials] create failed:', error);
    });

    it('getRestoreCredential resolves to null on native error WITHOUT logging', async () => {
      const error = new Error('native error');
      mockModule.getCredential.mockRejectedValue(error);

      const result = await getRestoreCredential('{}');

      expect(result).toBeNull();
      // This is the critical constraint: getRestoreCredential must stay silent.
      // It fails on every device without a credential, every cold start, so
      // logging would be permanent console noise.
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('clearRestoreCredential resolves without throwing on native error and logs warn', async () => {
      const error = new Error('native error');
      mockModule.clearCredential.mockRejectedValue(error);

      const result = await clearRestoreCredential();

      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[RestoreCredentials] clear failed:', error);
    });
  });

  describe('module absent', () => {
    beforeEach(() => {
      // Reset and reimport with undefined module
      jest.resetModules();
      jest.clearAllMocks();

      jest.doMock('react-native', () => ({
        NativeModules: {
          RestoreCredentialModule: undefined,
        },
      }));

      const impl = require('../index.android');
      createRestoreCredential = impl.createRestoreCredential;
      getRestoreCredential = impl.getRestoreCredential;
      clearRestoreCredential = impl.clearRestoreCredential;
      isRestoreCredentialAvailable = impl.isRestoreCredentialAvailable;

      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    it('createRestoreCredential resolves to null when module is undefined', async () => {
      const result = await createRestoreCredential('{}');

      expect(result).toBeNull();
    });

    it('getRestoreCredential resolves to null when module is undefined', async () => {
      const result = await getRestoreCredential('{}');

      expect(result).toBeNull();
    });

    it('clearRestoreCredential resolves without throwing when module is undefined', async () => {
      const result = await clearRestoreCredential();

      expect(result).toBeUndefined();
    });

    // Guards an Android build that forgot to register RestoreCredentialPackage
    // — it must report unavailable (like iOS/web), not "available but every
    // call happens to resolve null", which would still let the orchestration
    // layer call the server for nothing.
    it('isRestoreCredentialAvailable is false when the native module is undefined', () => {
      expect(isRestoreCredentialAvailable()).toBe(false);
    });
  });

  describe('critical constraint: functions never reject', () => {
    it('all three functions resolve (never reject) even with native errors', async () => {
      mockModule.createCredential.mockRejectedValue(new Error('fail'));
      mockModule.getCredential.mockRejectedValue(new Error('fail'));
      mockModule.clearCredential.mockRejectedValue(new Error('fail'));

      // If any of these rejects, the test fails immediately.
      const [res1, res2, res3] = await Promise.all([
        createRestoreCredential('{}'),
        getRestoreCredential('{}'),
        clearRestoreCredential(),
      ]);

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(res3).toBeUndefined();
    });
  });
});
