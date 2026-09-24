import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    ignores: [
      'api/**/*.js',
      'middleware.js',
      'src/api/**/*.js',
      // Runs in Node, not the browser: the SSR entry and the build scripts.
      'src/entry-server.jsx',
      'scripts/**/*.mjs',
    ],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    // Only the one rule, not react/recommended — the recommended set turns on
    // prop-types and a dozen style rules this codebase has never followed, and
    // a linter that reports hundreds of pre-existing errors is one nobody runs.
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Using a component without importing it passes no-undef (which does not
      // treat a JSX element name as a reference) and passes the vite build
      // (which resolves imports, not identifiers). It then throws at render and
      // the error boundary replaces the whole page. That is how the dashboard
      // went down in 4e7acca — <Seo> used, never imported.
      'react/jsx-no-undef': 'error',
      // The companion to the rule above, and it has to be on with it. Without
      // it no-unused-vars cannot see that a binding is used as a JSX element,
      // so `const Screen = props.screen` used only as <Screen /> is reported
      // as unused — a false error, and false errors are how a linter stops
      // being read.
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    files: [
      'api/**/*.js',
      'middleware.js',
      'src/api/**/*.js',
      'src/entry-server.jsx',
      'scripts/**/*.mjs',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        // entry-server.jsx renders the app to a string, so it is JSX that runs
        // in Node. It needs both the node globals and the JSX parser.
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    // Without this, no-unused-vars does not count `<ThemeProvider>` as a use of
    // the imported ThemeProvider, and every component imported by the SSR entry
    // is reported as dead.
    plugins: { react },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
    },
  },
])
