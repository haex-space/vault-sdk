import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // Build for commonJS and ESmodules
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true, // Clean output directory before building
  outDir: "dist",
  treeshake: true,
  minify: false,
});
