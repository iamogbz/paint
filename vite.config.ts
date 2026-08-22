import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { defineConfig } from "vite";
import { ManifestOptions, VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import manifestJson from "./public/manifest.json";

const getCommitHash = () => {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF;
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "development";
  }
};

const fileToLink = (f) => `<li><a href="/daily-challenge/${f}" style="color: blue; text-decoration: underline;">${f}</a></li>`;
const getHtml = () => {
  const dirPath = path.resolve(__dirname, "public/daily-challenge");
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    const fileLinks = files
      .filter((f) => f !== "index.html")
      .map(fileToLink)
      .join("");
    return `<!DOCTYPE html><html><head><title>Daily Challenge Index</title><style>body { font-family: system-ui, sans-serif; padding: 2rem; background: #fff; color: #000; }</style></head><body><h1>Daily Challenges</h1><ul>${fileLinks}</ul></body></html>`;
  }
};

function directoryListingPlugin() {
  const targetPath = "/daily-challenge";
  return {
    name: "directory-listing",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        // match exact or with trailing slash
        const rawUrl = req.url.split("?")[0];
        if (rawUrl === targetPath || rawUrl === targetPath + "/") {
          const html = getHtml();
          if (html) {
            res.setHeader("Content-Type", "text/html");
            res.end(html);
            return;
          }
        }
        next();
      });
    },
    generateBundle() {
      const html = getHtml();
      if (html) {
        this.emitFile({
          type: "asset",
          fileName: "daily-challenge/index.html",
          source: html,
        });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      __COMMIT_HASH__: JSON.stringify(getCommitHash()),
    },
    plugins: [
      basicSsl(),
      directoryListingPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: { enabled: false },
        manifestFilename: "manifest.json",
        includeAssets: ["**/*.{png,jpg,jpeg,svg,gif,ico,webp}"],
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,gif,webp,webmanifest}"],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        },
        manifest: manifestJson as ManifestOptions,
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      host: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === "true" ? null : {},
      allowedHosts: [".local", ".ogbizi.com"],
    },
  };
});
