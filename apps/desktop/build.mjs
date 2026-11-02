import { build } from "esbuild";

await build({
  entryPoints: {
    main: "src/main.ts",
    preload: "src/preload.ts",
    server: "../server/src/main.ts",
  },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron", "bufferutil", "utf-8-validate"],
});
