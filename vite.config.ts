import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: [".work/**", "node_modules/**"],
    options: { typeAware: true, typeCheck: true },
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
