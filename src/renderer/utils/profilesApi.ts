// Renderer-side API for profile management
import { InvokeChannels } from '../../types/ipc'

const invoke = window.electron.invoke

export const profilesApi = {
  /**
   * Export all profiles to a YAML file
   * @param targetPath Optional path to save the file. Defaults to ~/Documents/kuziSlicer-profiles.yaml
   */
  async exportYaml(targetPath?: string) {
    return invoke('profiles:export-yaml', targetPath)
  },

  /**
   * Import profiles from a local YAML file
   */
  async importFromFile(filePath: string) {
    return invoke('profiles:import-file', filePath)
  },

  /**
   * Import profiles from a GitHub repository
   * @param owner GitHub username/org
   * @param repo Repository name
   * @param branch Git branch (default: 'main')
   * @param filePath Path to profiles.yaml in repo (default: 'profiles.yaml')
   */
  async importFromGithub(owner: string, repo: string, branch?: string, filePath?: string) {
    return invoke('profiles:import-github', owner, repo, branch, filePath)
  },

  /**
   * Import profiles from a URL
   * @param url Full URL to YAML file
   */
  async importFromUrl(url: string) {
    return invoke('profiles:import-url', url)
  },

  /**
   * Merge imported profiles with existing ones
   * @param imported Profiles to merge
   * @param overwrite If true, replace existing profiles. If false, merge only new profiles.
   */
  async mergeProfiles(imported: { printers: any[]; filaments: any[] }, overwrite = false) {
    return invoke('profiles:merge', imported, overwrite)
  },
}
