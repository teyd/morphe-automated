import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: [".work/**", "node_modules/**"],
  },
  fmt: {
    singleQuote: false,
    semi: true,
    ignorePatterns: [".work/**", "bun.lock"],
  },
  staged: {
    "*.{ts,json,md,toml,yml}": "vp check --fix",
  },
});
