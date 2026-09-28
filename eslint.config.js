// Shared flat ESLint config. Workspaces re-export this.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['**/node_modules/**', '**/.expo/**', '**/dist/**', '**/build/**', 'supabase/.temp/**'],
  },
];
