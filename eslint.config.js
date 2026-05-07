const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
    ],
  },
  {
    files: [
      'backend/**/*.mjs',
      'scripts/**/*.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
