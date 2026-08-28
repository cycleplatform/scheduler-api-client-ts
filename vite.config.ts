import { builtinModules } from "module";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import { configDefaults, defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

const external = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
    plugins: [
        dts({
            include: ["src"],
            exclude: ["tests", "**/*.test.ts"],
        }),
    ],
    test: {
        exclude: [...configDefaults.exclude, "packages/template/*"],
        setupFiles: ["./tests/setup.ts"],
    },
    build: {
        lib: {
            entry: resolve(__dirname, "./src/index.ts"),
            fileName: "index",
            formats: ["es", "cjs"],
        },
        rollupOptions: {
            external,
        },
    },
});
