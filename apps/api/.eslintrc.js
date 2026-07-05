module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'src/**/*.scripts.ts', 'src/**/scripts/*.ts'],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    // The API has NO build step for workspace packages: a RUNTIME import of
    // @budget/shared-utils loads its TS barrel (src/index.ts -> `export * from
    // './validation'`), which the prod Node ESM runtime rejects with
    // ERR_UNSUPPORTED_DIR_IMPORT and crash-loops the API (ABA-317; previously
    // ABA-252/253 and the safe-to-spend regression). `import type` is erased by
    // tsc and is safe. Copy any needed runtime value into an API-local util
    // (see safe-to-spend.util.ts / budget-period.util.ts).
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: [{
        name: '@budget/shared-utils',
        message:
          'Do not import @budget/shared-utils at runtime in the API (no build step → ESM dir-import crash). Copy the value into an API-local util; `import type` is allowed.',
        allowTypeImports: true,
      }],
    }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
