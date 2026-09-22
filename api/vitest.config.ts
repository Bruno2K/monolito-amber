import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: "es6" },
    }),
  ],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["test/integration/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
