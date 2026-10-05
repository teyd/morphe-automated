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
