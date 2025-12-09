import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExtensionSigner } from '../signing';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('ExtensionSigner', () => {
  describe('generateKeypair', () => {
    it('should generate a valid Ed25519 keypair', async () => {
      const keypair = await ExtensionSigner.generateKeypair();

      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('privateKey');
      expect(keypair.publicKey).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
      expect(keypair.privateKey).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique keypairs each time', async () => {
      const keypair1 = await ExtensionSigner.generateKeypair();
      const keypair2 = await ExtensionSigner.generateKeypair();

      expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
      expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
    });
  });

  describe('hashDirectory', () => {
    let testDir: string;

    beforeAll(async () => {
      testDir = path.join(tmpdir(), `haex-test-hash-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should compute consistent hash for same content', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'Hello World');

      const hash1 = await ExtensionSigner.hashDirectory(testDir);
      const hash2 = await ExtensionSigner.hashDirectory(testDir);

      expect(hash1.toString('hex')).toBe(hash2.toString('hex'));
    });

    it('should compute different hash for different content', async () => {
      const dir1 = path.join(tmpdir(), `haex-test-hash1-${Date.now()}`);
      const dir2 = path.join(tmpdir(), `haex-test-hash2-${Date.now()}`);

      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      await fs.writeFile(path.join(dir1, 'test.txt'), 'Content A');
      await fs.writeFile(path.join(dir2, 'test.txt'), 'Content B');

      const hash1 = await ExtensionSigner.hashDirectory(dir1);
      const hash2 = await ExtensionSigner.hashDirectory(dir2);

      expect(hash1.toString('hex')).not.toBe(hash2.toString('hex'));

      // Cleanup
      await fs.rm(dir1, { recursive: true, force: true });
      await fs.rm(dir2, { recursive: true, force: true });
    });

    it('should include all files in hash calculation', async () => {
      const dir = path.join(tmpdir(), `haex-test-hash-multi-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(path.join(dir, 'file1.txt'), 'Content 1');
      const hash1 = await ExtensionSigner.hashDirectory(dir);

      await fs.writeFile(path.join(dir, 'file2.txt'), 'Content 2');
      const hash2 = await ExtensionSigner.hashDirectory(dir);

      expect(hash1.toString('hex')).not.toBe(hash2.toString('hex'));

      // Cleanup
      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe('signExtension', () => {
    let testDir: string;
    let keypair: { publicKey: string; privateKey: string };

    beforeAll(async () => {
      testDir = path.join(tmpdir(), `haex-test-sign-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'index.html'), '<html></html>');

      keypair = await ExtensionSigner.generateKeypair();
    });

    afterAll(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should sign an extension directory', async () => {
      const result = await ExtensionSigner.signExtension(testDir, keypair.privateKey);

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('hash');
      expect(result.signature).toMatch(/^[0-9a-f]{128}$/); // Ed25519 signature = 64 bytes = 128 hex
      expect(result.publicKey).toBe(keypair.publicKey);
    });

    it('should produce different signatures for different content', async () => {
      const dir1 = path.join(tmpdir(), `haex-test-sign1-${Date.now()}`);
      const dir2 = path.join(tmpdir(), `haex-test-sign2-${Date.now()}`);

      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      await fs.writeFile(path.join(dir1, 'index.html'), '<html>A</html>');
      await fs.writeFile(path.join(dir2, 'index.html'), '<html>B</html>');

      const result1 = await ExtensionSigner.signExtension(dir1, keypair.privateKey);
      const result2 = await ExtensionSigner.signExtension(dir2, keypair.privateKey);

      expect(result1.signature).not.toBe(result2.signature);
      expect(result1.hash).not.toBe(result2.hash);

      // Cleanup
      await fs.rm(dir1, { recursive: true, force: true });
      await fs.rm(dir2, { recursive: true, force: true });
    });

    it('should produce consistent signatures for same content', async () => {
      const result1 = await ExtensionSigner.signExtension(testDir, keypair.privateKey);
      const result2 = await ExtensionSigner.signExtension(testDir, keypair.privateKey);

      expect(result1.signature).toBe(result2.signature);
      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe('verifyPackage', () => {
    let testDir: string;
    let extensionDir: string;
    let outputDir: string;
    let keypair: { publicKey: string; privateKey: string };

    beforeAll(async () => {
      // Create a complete test extension structure
      testDir = path.join(tmpdir(), `haex-test-verify-${Date.now()}`);
      extensionDir = path.join(testDir, 'haextension');
      outputDir = path.join(testDir, 'output');

      await fs.mkdir(testDir, { recursive: true });
      await fs.mkdir(extensionDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });

      keypair = await ExtensionSigner.generateKeypair();

      // Create extension files
      await fs.writeFile(path.join(outputDir, 'index.html'), '<html><body>Test Extension</body></html>');

      // Create manifest
      const manifest = {
        name: 'test-extension',
        version: '1.0.0',
        author: 'test',
        description: 'Test extension',
        publicKey: keypair.publicKey,
        signature: '',
        permissions: {
          database: [],
          filesystem: [],
          http: [],
          shell: [],
        },
        singleInstance: false,
        displayMode: 'auto',
      };

      await fs.writeFile(path.join(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      await fs.writeFile(path.join(extensionDir, 'public.key'), keypair.publicKey);
      await fs.writeFile(path.join(extensionDir, 'private.key'), keypair.privateKey);

      // Create package.json
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-extension', version: '1.0.0' }, null, 2)
      );
    });

    afterAll(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should verify a valid package', async () => {
      // Change to test directory and package the extension
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const packagePath = await ExtensionSigner.packageExtension(
          outputDir,
          keypair.privateKey,
          path.join(testDir, 'test-extension-1.0.0.xt')
        );

        const result = await ExtensionSigner.verifyPackage(packagePath);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should fail verification for tampered package', async () => {
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        // Create and package extension
        const packagePath = path.join(testDir, 'test-tampered-1.0.0.xt');
        await ExtensionSigner.packageExtension(outputDir, keypair.privateKey, packagePath);

        // Tamper with the package by modifying a file
        const JSZip = (await import('jszip')).default;
        const zipBuffer = await fs.readFile(packagePath);
        const zip = await JSZip.loadAsync(zipBuffer);

        // Modify the index.html content
        zip.file('index.html', '<html><body>TAMPERED!</body></html>');

        // Write back the tampered ZIP
        const tamperedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        await fs.writeFile(packagePath, tamperedBuffer);

        // Verify should fail
        const result = await ExtensionSigner.verifyPackage(packagePath);
        expect(result.valid).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should fail verification for missing manifest', async () => {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Create a ZIP without manifest
      zip.file('index.html', '<html></html>');

      const invalidPackagePath = path.join(testDir, 'invalid-no-manifest.xt');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      await fs.writeFile(invalidPackagePath, buffer);

      const result = await ExtensionSigner.verifyPackage(invalidPackagePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('manifest.json not found');
    });

    it('should fail verification for missing signature', async () => {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Create a ZIP with manifest but no signature
      const manifest = {
        name: 'test',
        version: '1.0.0',
        publicKey: keypair.publicKey,
        // signature is missing
      };

      zip.file('haextension/manifest.json', JSON.stringify(manifest));
      zip.file('index.html', '<html></html>');

      const invalidPackagePath = path.join(testDir, 'invalid-no-signature.xt');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      await fs.writeFile(invalidPackagePath, buffer);

      const result = await ExtensionSigner.verifyPackage(invalidPackagePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing publicKey or signature');
    });
  });

  describe('sortObjectKeysRecursively', () => {
    it('should sort top-level keys alphabetically', () => {
      const input = { z: 1, a: 2, m: 3 };
      const result = (ExtensionSigner as any).sortObjectKeysRecursively(input);
      const keys = Object.keys(result);

      expect(keys).toEqual(['a', 'm', 'z']);
    });

    it('should sort nested object keys', () => {
      const input = { b: { z: 1, a: 2 }, a: 1 };
      const result = (ExtensionSigner as any).sortObjectKeysRecursively(input);

      expect(Object.keys(result)).toEqual(['a', 'b']);
      expect(Object.keys(result.b)).toEqual(['a', 'z']);
    });

    it('should handle arrays correctly', () => {
      const input = { arr: [{ z: 1, a: 2 }, { m: 3, b: 4 }] };
      const result = (ExtensionSigner as any).sortObjectKeysRecursively(input);

      expect(Object.keys(result.arr[0])).toEqual(['a', 'z']);
      expect(Object.keys(result.arr[1])).toEqual(['b', 'm']);
    });

    it('should handle primitive values', () => {
      expect((ExtensionSigner as any).sortObjectKeysRecursively('string')).toBe('string');
      expect((ExtensionSigner as any).sortObjectKeysRecursively(123)).toBe(123);
      expect((ExtensionSigner as any).sortObjectKeysRecursively(null)).toBe(null);
    });
  });
});
