/**
 * Utility to read haextension.config.json
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export interface HaextensionConfig {
  dev?: {
    port?: number
    host?: string
    haextension_dir?: string
  }
  keys?: {
    public_key_path?: string
    private_key_path?: string
  }
  build?: {
    distDir?: string
    /**
     * Source path for migrations directory (relative to project root).
     * If manifest.migrationsDir is set, this directory will be copied
     * to the bundle at the path specified in migrationsDir.
     * Default: "app/{migrationsDir}" (for Nuxt projects)
     * Example: "app/database/migrations" -> copies to "database/migrations" in bundle
     */
    migrationsSourceDir?: string
  }
}

/**
 * Read haextension.config.json from the project root
 * Returns null if file doesn't exist
 */
export function readHaextensionConfig(rootDir: string = process.cwd()): HaextensionConfig | null {
  const configPath = resolve(rootDir, 'haextension.config.json')
  
  if (!existsSync(configPath)) {
    return null
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.warn(`Failed to parse haextension.config.json: ${error}`)
    return null
  }
}

/**
 * Get extension directory from config or use default
 */
export function getExtensionDir(rootDir: string = process.cwd()): string {
  const config = readHaextensionConfig(rootDir)
  return config?.dev?.haextension_dir || 'haextension'
}
