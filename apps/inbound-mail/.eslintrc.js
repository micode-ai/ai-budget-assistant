module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist'],
  rules: {
    // Structured JSON logs go through src/log.ts (stdout); a stray console.log could leak a body.
    'no-console': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Receive-only: this container must never grow an outbound mail path.
    'no-restricted-imports': ['error', { paths: [
      { name: 'nodemailer', message: 'inbound-mail is receive-only; no outbound mail.' },
      { name: 'smtp-connection', message: 'inbound-mail is receive-only; no outbound mail.' },
    ] }],
  },
};
