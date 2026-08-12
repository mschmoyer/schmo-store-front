import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * Next.js 16 removed the `next lint` command, so linting is now driven by the
 * ESLint CLI (`npm run lint` -> `eslint .`). That is a wider net than before:
 * `next lint` only ever walked the source directories, whereas `eslint .`
 * walks the whole repository. The blocks below restore the previous scope.
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      // Shipped static assets, not authored source.
      "public/**",
      "next-env.d.ts",
    ],
  },

  {
    /**
     * Node-side CommonJS: Playwright specs and fixtures, the migration runner,
     * the sync/seed scripts, and the build tool configs. These legitimately use
     * `require()`, and they are not React code, so the React rules do not
     * apply. `next lint` never inspected any of them.
     */
    files: [
      "tests/**/*.{js,ts}",
      "scripts/**/*.js",
      "database/**/*.js",
      "*.config.{js,mjs}",
      "jest.setup.js",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },

  {
    /**
     * The React Compiler rules arrived with eslint-config-next 16
     * (eslint-plugin-react-hooks v6) and flag ~80 pre-existing spots, mostly
     * `set-state-in-effect`. They are downgraded to warnings so the framework
     * upgrade did not turn a green lint red overnight. This is a real backlog
     * to work through, not a permanent exemption — promote each rule back to
     * "error" as its violations are cleared.
     */
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default eslintConfig;
