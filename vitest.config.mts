import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// .mts so Vite's native config loader reads it as ESM (a .ts here is treated as
// CommonJS because package.json has no "type": "module").
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "nano_bots/**"]
  }
});
