// ===================================================================
// ESLint Flat Config — TypeScript
// ===================================================================
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ── Base recommended rules ──────────────────────────────────────
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Project-specific overrides ──────────────────────────────────
  {
    files: ["src/**/*.ts"],
    rules: {
      // Allow unused vars that start with underscore (e.g. _req)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow explicit `any` in the skeleton phase — tighten later
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ── Ignore patterns ─────────────────────────────────────────────
  {
    ignores: ["dist/", "node_modules/"],
  }
);
