#!/usr/bin/env node
// @haexhub/sdk/src/cli/index.ts

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { ExtensionSigner, EXTENSION_FILE_EXTENSION } from "~/crypto/signing";
import { existsSync } from "fs";

const program = new Command();

program
  .name("haexhub")
  .description("HaexHub Extension Development Tools")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize a new HaexHub extension in your project")
  .option("-n, --name <name>", "Extension name")
  .option("-d, --description <desc>", "Extension description")
  .option("--author <author>", "Extension author")
  .option("--dir <dir>", "Extension directory", "./haextension")
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      const extDir = path.resolve(cwd, options.dir);

      // Check if haextension directory already exists
      if (existsSync(extDir)) {
        console.error(`❌ Directory ${options.dir} already exists!`);
        process.exit(1);
      }

      // Read package.json if it exists
      interface PackageJson {
        name?: string;
        description?: string;
        scripts?: Record<string, string>;
        build?: string;
      }
      let packageJson: PackageJson = {};
      const packageJsonPath = path.join(cwd, "package.json");
      if (existsSync(packageJsonPath)) {
        const content = await fs.readFile(packageJsonPath, "utf-8");
        packageJson = JSON.parse(content) as PackageJson;
      }

      console.log("🚀 Initializing HaexHub Extension...\n");

      // 1. Create haextension directory
      await fs.mkdir(extDir, { recursive: true });
      console.log(`✓ Created directory: ${options.dir}`);

      // 2. Generate keypair
      const { publicKey, privateKey } = await ExtensionSigner.generateKeypair();
      await fs.writeFile(path.join(extDir, "public.key"), publicKey);
      await fs.writeFile(path.join(extDir, "private.key"), privateKey);
      console.log("✓ Generated keypair");

      // 3. Create manifest.json (only required fields, optional fields come from package.json)
      const manifest: Record<string, unknown> = {
        publicKey: publicKey,
        signature: "",
        permissions: {
          database: [],
          filesystem: [],
          http: [],
          shell: [],
        },
        singleInstance: false,
        displayMode: "auto",
      };

      // Only add description if provided via CLI or not in package.json
      if (options.description) {
        manifest.description = options.description;
      } else if (!packageJson.description) {
        manifest.description = "A HaexHub extension";
      }

      await fs.writeFile(
        path.join(extDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );
      console.log("✓ Created manifest.json");

      // 4. Create/update .gitignore
      const gitignorePath = path.join(cwd, ".gitignore");
      // Remove leading ./ from dir path for gitignore
      const gitignoreDir = options.dir.replace(/^\.\//, '');
      const gitignoreEntries = [
        "\n# HaexHub Extension",
        `${gitignoreDir}/private.key`,
        `*${EXTENSION_FILE_EXTENSION}`,
      ];

      if (existsSync(gitignorePath)) {
        const existing = await fs.readFile(gitignorePath, "utf-8");
        if (!existing.includes(`${gitignoreDir}/private.key`)) {
          await fs.appendFile(gitignorePath, gitignoreEntries.join("\n"));
          console.log("✓ Updated .gitignore");
        }
      } else {
        await fs.writeFile(gitignorePath, gitignoreEntries.join("\n"));
        console.log("✓ Created .gitignore");
      }

      // 5. Create haextension.config.json
      const config = {
        dev: {
          port: 5173,
          host: "localhost",
          haextension_dir: options.dir,
        },
        keys: {
          public_key_path: `${options.dir}/public.key`,
          private_key_path: `${options.dir}/private.key`,
        },
        build: {
          distDir: "dist",
        },
      };

      await fs.writeFile(
        path.join(cwd, "haextension.config.json"),
        JSON.stringify(config, null, 2)
      );
      console.log("✓ Created haextension.config.json");

      // 6. Update package.json scripts
      if (existsSync(packageJsonPath)) {
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts["ext:dev"] =
          packageJson.scripts["ext:dev"] || "haexhub dev";
        packageJson.scripts["ext:build"] =
          packageJson.scripts["ext:build"] ||
          `${packageJson.scripts.build || "vite build"} && haexhub sign dist -k ${options.dir}/private.key`;

        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2)
        );
        console.log("✓ Updated package.json scripts");
      }

      console.log("\n✨ Extension initialized successfully!\n");
      console.log("📝 Next steps:");
      console.log(`  1. Edit ${options.dir}/manifest.json to configure your extension`);
      console.log("  2. Run 'npm run ext:dev' to start development mode");
      console.log("  3. Run 'npm run ext:build' to build and sign your extension");
      console.log("\n⚠️  Important: Never commit your private key:");
      console.log(`   - ${options.dir}/private.key has been added to .gitignore`);
      console.log("   - haextension.config.json is safe to commit (contains only paths)\n");
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("keygen")
  .description("Generate a new keypair for signing extensions")
  .option("-o, --output <path>", "Output directory", "./haextension")
  .action(async (options) => {
    const { publicKey, privateKey } = await ExtensionSigner.generateKeypair();

    const keyDir = path.resolve(options.output);
    await fs.mkdir(keyDir, { recursive: true });

    await fs.writeFile(path.join(keyDir, "public.key"), publicKey);
    await fs.writeFile(path.join(keyDir, "private.key"), privateKey);

    console.log("✓ Keypair generated:");
    console.log(`  Public:  ${path.join(keyDir, "public.key")}`);
    console.log(`  Private: ${path.join(keyDir, "private.key")}`);
    console.log("\n⚠️  Keep your private key safe and never commit it!");
  });

program
  .command("sign <extension-path>")
  .description("Sign and package an extension")
  .option("-k, --key <path>", "Private key file", "./haextension/private.key")
  .option("-o, --output <path>", "Output path for .haextension file")
  .action(async (extensionPath, options) => {
    try {
      const privateKey = await fs.readFile(options.key, "utf-8");
      const outputPath = await ExtensionSigner.packageExtension(
        extensionPath,
        privateKey.trim(),
        options.output
      );
      console.log(`\n✓ Extension signed and packaged: ${outputPath}`);
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

program.parse();
