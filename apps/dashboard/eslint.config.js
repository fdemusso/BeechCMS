import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
// Temporarily disabled due to TypeScript 7.0 Go-rewrite (no public JS compiler API yet) causing typescript-eslint to crash
// import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Custom no-op parser for TypeScript files to prevent typescript-eslint from crashing on TS 7.0
// while avoiding ESLint v9's "all files ignored" error when directories contain only TS files.
const noopParser = {
  parse(text) {
    return {
      type: 'Program',
      body: [],
      sourceType: 'module',
      range: [0, text.length],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      tokens: [],
      comments: [],
    }
  }
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      // tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'jsx-a11y': {
        rules: {
          'no-noninteractive-element-interactions': {
            create() { return {} }
          }
        }
      }
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: noopParser,
    },
    rules: {
      // '@typescript-eslint/no-explicit-any': 'warn',
      // '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // '@typescript-eslint/no-empty-object-type': 'warn',
      'no-control-regex': 'off',
      'no-empty': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'warn',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/error-boundaries': 'off',
      'no-empty-pattern': 'warn',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])
