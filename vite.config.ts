import { defineConfig } from "vite-plus";

// Installed agent assets and the vendored anti-slop plugin are not application source.
const vendoredPaths = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".continue/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
  ".pi/**",
  ".roo/**",
  ".windsurf/**",
  "tools/oxlint/anti-slop/**",
];

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: [".work/**", "node_modules/**", ...vendoredPaths],
    options: { typeAware: true, typeCheck: true },
    jsPlugins: [
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
      { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop/effect/index.ts" },
    ],
    rules: {
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop-effect/no-manual-effect-error-tag": "error",
    },
  },
  fmt: {
    singleQuote: false,
    semi: true,
    ignorePatterns: [".work/**", "bun.lock", ...vendoredPaths],
  },
  staged: {
    "*.{ts,json,md,toml,yml}": "vp check --fix",
  },
});
