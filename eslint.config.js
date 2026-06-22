import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/.wrangler/**',
    '**/node_modules/**',
    '**/venv/**',
    '**/coverage/**',
    '**/tmp/**',
    '**/graphify-out/**',
    '**/*.d.ts',
    '**/assets/**',
  ]),
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Soften rules to warn/off to avoid blocking pre-existing issues
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-control-regex': 'off',
      'no-empty': 'warn',
    },
  },
  {
    files: ['**/scripts/**/*', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
])
