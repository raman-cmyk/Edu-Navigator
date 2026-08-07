module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'supabase/functions/**'],
  rules: {
    'no-unused-vars': 'off', // handled by tsc noUnusedLocals
  },
};
