/**
 * Profiles Manager — orchestrates profile loading, merging, and validation.
 * Uses ProfilesAccessor for raw I/O; applies business logic here.
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { PrinterProfile, FilamentProfile } from './gcodeGenerator'
import ProfilesAccessor from './profilesAccessor'

export interface ProfilesData {
  readonly printers: ReadonlyArray<PrinterProfile>
  readonly filaments: ReadonlyArray<FilamentProfile>
}

export class ProfilesManager {
  /**
   * Load bundled profiles + user profiles, merge and return.
   * Bundled profiles are defaults; user profiles override by ID.
   */
  static loadProfiles(): ProfilesData {
    const bundledPrinters: PrinterProfile[] = this.loadBundledProfiles('printers')
    const bundledFilaments: FilamentProfile[] = this.loadBundledProfiles('filaments')
    const userDataPath = app.getPath('userData')
    const userPrintersPath = path.join(userDataPath, 'printers.json')
    const userFilamentsPath = path.join(userDataPath, 'filaments.json')

    let userPrinters: PrinterProfile[] = []
    let userFilaments: FilamentProfile[] = []

    if (ProfilesAccessor.fileExists(userPrintersPath)) {
      try {
        const data = ProfilesAccessor.readJson(userPrintersPath)
        userPrinters = (data.printers as PrinterProfile[]) || []
      } catch (err) {
        console.error('[ProfilesManager] Failed to load user printers:', err)
      }
    }

    if (ProfilesAccessor.fileExists(userFilamentsPath)) {
      try {
        const data = ProfilesAccessor.readJson(userFilamentsPath)
        userFilaments = (data.filaments as FilamentProfile[]) || []
      } catch (err) {
        console.error('[ProfilesManager] Failed to load user filaments:', err)
      }
    }

    // Merge: user overrides bundled by ID
    const printers = this.mergeById(bundledPrinters, userPrinters)
    const filaments = this.mergeById(bundledFilaments, userFilaments)

    return { printers: Object.freeze([...printers]), filaments: Object.freeze([...filaments]) }
  }

  /**
   * Import profiles from URL (GitHub or direct).
   */
  static async importFromUrl(url: string): Promise<ProfilesData> {
    const content = await ProfilesAccessor.fetchUrl(url)
    const raw = ProfilesAccessor.yamlToObject(content)
    return {
      printers: Object.freeze((raw.printers as PrinterProfile[]) || []),
      filaments: Object.freeze((raw.filaments as FilamentProfile[]) || []),
    }
  }

  /**
   * Import profiles from GitHub raw content.
   */
  static async importFromGithub(
    owner: string,
    repo: string,
    branch = 'main',
    filePath = 'profiles.yaml'
  ): Promise<ProfilesData> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    return this.importFromUrl(url)
  }

  /**
   * Import profiles from local file.
   */
  static importFromFile(filePath: string): ProfilesData {
    const raw = ProfilesAccessor.readYaml(filePath)
    return {
      printers: Object.freeze((raw.printers as PrinterProfile[]) || []),
      filaments: Object.freeze((raw.filaments as FilamentProfile[]) || []),
    }
  }

  /**
   * Merge imported profiles into the current set and persist. `overwrite` controls
   * whether imported entries replace an existing profile with the same id.
   */
  static mergeAndSave(imported: ProfilesData, overwrite: boolean): ProfilesData {
    const current = this.loadProfiles()
    const printers = overwrite
      ? this.mergeById([...current.printers], [...imported.printers])
      : this.mergeById([...imported.printers], [...current.printers])
    const filaments = overwrite
      ? this.mergeById([...current.filaments], [...imported.filaments])
      : this.mergeById([...imported.filaments], [...current.filaments])

    const merged: ProfilesData = {
      printers: Object.freeze(printers),
      filaments: Object.freeze(filaments),
    }
    this.saveProfiles(merged)
    return merged
  }

  /**
   * Save profiles to user data directory.
   */
  static saveProfiles(data: ProfilesData): void {
    const userDataPath = app.getPath('userData')
    ProfilesAccessor.writeJson(path.join(userDataPath, 'printers.json'), {
      printers: [...data.printers],
    })
    ProfilesAccessor.writeJson(path.join(userDataPath, 'filaments.json'), {
      filaments: [...data.filaments],
    })
  }

  /**
   * Merge two arrays of profiles by ID; second array overrides first.
   */
  private static mergeById<T extends { id: string }>(base: T[], updates: T[]): T[] {
    const result = [...base]
    const baseIds = new Set(base.map((p) => p.id))

    for (const update of updates) {
      const idx = result.findIndex((p) => p.id === update.id)
      if (idx >= 0) {
        result[idx] = update
      } else {
        result.push(update)
      }
    }

    return result
  }

  /**
   * Load bundled profiles (printers.json or filaments.json from src/data/).
   */
  private static loadBundledProfiles(
    type: 'printers' | 'filaments'
  ): (PrinterProfile | FilamentProfile)[] {
    try {
      // ponytail: dev loads from src/data; prod from packaged resources
      const devPath = path.join(process.cwd(), 'src', 'data', `${type}.json`)
      const prodPath = path.join(process.resourcesPath || process.cwd(), 'data', `${type}.json`)
      const filePath = fs.existsSync(devPath) ? devPath : prodPath

      if (!fs.existsSync(filePath)) {
        console.warn(`[ProfilesManager] File not found: ${filePath}`)
        return []
      }

      const bundled = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return bundled[type] || []
    } catch (err) {
      console.warn(`[ProfilesManager] Load bundled ${type} failed:`, err)
      return []
    }
  }
}

export default ProfilesManager
