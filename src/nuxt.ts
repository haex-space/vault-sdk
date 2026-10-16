/**
 * Nuxt Module for HaexVault SDK
 * Automatically injects polyfills into the built HTML files
 */
import { addPlugin, createResolver, defineNuxtModule } from "@nuxt/kit";
import { getCorsHeaders } from "./cors";
import { getPolyfillCode } from "./polyfills/standalone";
import { join, resolve as resolvePath } from "node:path";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import type { Nuxt } from "@nuxt/schema";
import { readHaextensionConfig } from "./config";
import { readManifest } from "./manifest";

export interface ModuleOptions {
  injectPolyfills?: boolean;
  /**
   * Directory containing extension files (manifest.json, public.key, private.key)
   * Default: "haextension"
   */
  extensionDir?: string;
  /** Path to manifest.json (overrides extensionDir if specified) */
  manifestPath?: string;
  /** Path to public.key (overrides extensionDir if specified) */
  publicKeyPath?: string;
  /** Path to private.key (overrides extensionDir if specified) */
  privateKeyPath?: string;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "@haex-space/vault-sdk",
    configKey: "haexVault",
    compatibility: {
      nuxt: "^3.0.0 || ^4.0.0",
    },
  },

  defaults: {
    injectPolyfills: true,
    extensionDir: "haextension",
  },

  async setup(options: ModuleOptions, nuxt: Nuxt) {
    const { resolve } = createResolver(import.meta.url);

    // Add type declaration for $haexVault
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('./runtime/nuxt.types.d.ts') })
    })

    // Read haextension.config.json if available
    const config = readHaextensionConfig(nuxt.options.rootDir);

    // Use config values as defaults if not explicitly set in options
    const extensionDir = options.extensionDir || config?.dev?.haextension_dir || "haextension";

    // Read manifest.json using shared utility
    const manifest = readManifest({
      rootDir: nuxt.options.rootDir,
      manifestPath: options.manifestPath,
      extensionDir,
    });

    // Inject manifest into public runtime config
    nuxt.options.runtimeConfig.public = nuxt.options.runtimeConfig.public || {};
    nuxt.options.runtimeConfig.public.haexVaultManifest = manifest;

    addPlugin({
      src: resolve("./runtime/nuxt.plugin.client.mjs"),
      mode: "client",
    });
    // CRITICAL: Install polyfill hook BEFORE any other module
    // This ensures polyfills load before color-mode or any other script
    if (options.injectPolyfills && nuxt.options.dev) {
      nuxt.hook("nitro:config", (nitroConfig: any) => {
        nitroConfig.hooks = nitroConfig.hooks || {};
        nitroConfig.hooks["render:html"] =
          nitroConfig.hooks["render:html"] || [];

        // Prepend (unshift) to run before ALL other hooks
        const polyfillCode = getPolyfillCode();
        const polyfillScript = `<script data-haexhub-polyfill>${polyfillCode}</script>`;

        nitroConfig.hooks["render:html"].unshift((html: any) => {
          // Inject at the very beginning of <head>
          if (html.head && Array.isArray(html.head)) {
            html.head.unshift(polyfillScript);
          }
        });
      });
      console.log(
        "✓ [@haex-space/vault-sdk] Dev mode: Priority polyfill injection configured"
      );
    }

    // Configure Nuxt differently for dev vs production
    if (nuxt.options.dev) {
      // DEV MODE: Use absolute paths for dev server
      nuxt.options.app.baseURL = "/";
      nuxt.options.app.buildAssetsDir = "/_nuxt/";

      // Enable CORS for dev server using shared CORS configuration
      nuxt.options.vite = nuxt.options.vite || {};
      nuxt.options.vite.server = nuxt.options.vite.server || {};
      nuxt.options.vite.server.cors = true;
      nuxt.options.vite.server.headers = getCorsHeaders();

      console.log(
        "✓ [@haex-space/vault-sdk] Dev mode: Set app.baseURL to / (absolute paths for dev server)"
      );
      console.log("✓ [@haex-space/vault-sdk] Dev mode: Enabled CORS headers");
    } else {
      // PRODUCTION BUILD: Use relative paths
      nuxt.options.app.baseURL = "./";
      nuxt.options.app.buildAssetsDir = "_nuxt/"; // Remove leading slash

      console.log(
        "✓ [@haex-space/vault-sdk] Build mode: Set app.baseURL to relative path (./)"
      );
      console.log(
        "✓ [@haex-space/vault-sdk] Build mode: Set buildAssetsDir to relative path (_nuxt/)"
      );
    }

    // Disable app manifest feature (generates /_nuxt/builds/meta/*.json)
    // This is not needed for extensions and causes 404 errors
    nuxt.options.experimental = nuxt.options.experimental || {};
    nuxt.options.experimental.appManifest = false;

    // Disable payload extraction for SPAs (extensions don't need SSR payload)
    // This prevents "Cannot load payload" errors for _payload.json files
    nuxt.options.experimental.payloadExtraction = false;

    console.log(
      "✓ [@haex-space/vault-sdk] Disabled appManifest (not needed for extensions)"
    );
    console.log(
      "✓ [@haex-space/vault-sdk] Disabled payloadExtraction (not needed for SPAs)"
    );

    // Only inject polyfills if enabled and building for production
    if (!options.injectPolyfills || nuxt.options.dev) {
      return;
    }

    // Add hook to inject polyfills after HTML generation
    nuxt.hook("nitro:build:public-assets", async () => {
      try {
        // Use Nuxt's configured output directory
        const nitroOutput = nuxt.options.nitro?.output || {};
        const outputDir = nitroOutput.dir || ".output";
        const publicDir = nitroOutput.publicDir || "public";
        const distDir = resolvePath(nuxt.options.rootDir, outputDir, publicDir);

        // Get polyfill code from modular polyfills
        const polyfillCode = getPolyfillCode();
        const polyfillScript = `<script>${polyfillCode}</script>`;

        // Find all HTML files in the output directory
        const htmlFiles = readdirSync(distDir).filter((f: string) =>
          f.endsWith(".html")
        );

        for (const file of htmlFiles) {
          const filePath = join(distDir, file);
          let html = readFileSync(filePath, "utf-8");

          // Inject polyfill directly after <head>
          const headPos = html.indexOf("<head>");
          if (headPos !== -1) {
            const insertPos = headPos + 6; // after <head>
            html =
              html.slice(0, insertPos) + polyfillScript + html.slice(insertPos);
          }

          // IMPORTANT: Convert all absolute asset paths to relative paths
          // Replace all occurrences of /_nuxt/ with _nuxt/ to make paths relative

          // Fix <link> and <script> tags
          html = html.replace(/\b(href|src)="\/_nuxt\//g, '$1="_nuxt/');

          // Fix import maps - need to keep it absolute or use ./ prefix for module resolution
          html = html.replace(
            /"imports":\{"#entry":"\/_nuxt\//g,
            '"imports":{"#entry":"./_nuxt/'
          );

          // Fix buildAssetsDir in runtime config
          html = html.replace(
            /buildAssetsDir:"\/_nuxt\/"/g,
            'buildAssetsDir:"./_nuxt/"'
          );

          // Fix any remaining absolute /_nuxt/ references in JSON/JS
          html = html.replace(/"\/_nuxt\//g, '"./_nuxt/');

          writeFileSync(filePath, html);
          console.log(
            `✓ [@haex-space/vault-sdk] Polyfill and relative paths applied to ${file}`
          );
        }
      } catch (error: unknown) {
        console.error("[@haex-space/vault-sdk] Failed to inject polyfill:", error);
      }
    });
  },
});
