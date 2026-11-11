export default [
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'android-build/**',
      'node_modules/**',
      'public/**',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-debugger': 'warn',
      'no-duplicate-imports': 'error',
      'no-unused-vars': 'off',
    },
  },
];
