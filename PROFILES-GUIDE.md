# kuziSlicer Profiles Management Guide

## Overview

kuziSlicer can export and import printer & filament profiles in YAML format. This allows you to:
- **Share** profiles across machines
- **Back up** your configurations
- **Import** community profiles from GitHub or other sources
- **Merge** multiple profile collections

## Profile Types

### Printer Profile
Defines printer hardware capabilities:
- `id`: Unique identifier
- `name`: Display name
- `nozzleSize`: Nozzle diameter in mm
- `bedSize[X|Y|Z]`: Build platform dimensions
- `maxTemp`: Maximum nozzle temperature (°C)
- `maxBedTemp`: Maximum bed temperature (°C)
- `maxSpeed`: Maximum print speed (mm/s)
- `defaultSpeed`: Recommended speed (mm/s)
- `acceleration`: Acceleration limits (mm/s²)

### Filament Profile
Defines material properties:
- `id`: Unique identifier
- `name`: Display name
- `material`: Material type (PLA, PETG, ABS, TPU, etc.)
- `extruderTemp`: Nozzle temperature (°C)
- `bedTemp`: Bed temperature (°C)
- `printSpeed`: Recommended speed (mm/s)
- `retractDistance`: Retraction length (mm)
- `retractSpeed`: Retraction speed (mm/s)

## Usage

### Export Profiles to YAML

```typescript
import { profilesApi } from './utils/profilesApi'

// Export to default location (~/Documents/kuziSlicer-profiles.yaml)
const result = await profilesApi.exportYaml()

// Export to custom path
const result = await profilesApi.exportYaml('/path/to/my-profiles.yaml')

if (result.success) {
  console.log('Profiles saved to:', result.path)
} else {
  console.error('Export failed:', result.error)
}
```

### Import from Local File

```typescript
const result = await profilesApi.importFromFile('/path/to/profiles.yaml')

if (result.success) {
  console.log(`Loaded ${result.printers.length} printers, ${result.filaments.length} filaments`)
}
```

### Import from GitHub

```typescript
// Import from a GitHub repository
const result = await profilesApi.importFromGithub(
  'your-username',
  'my-profiles-repo',
  'main',           // branch (optional, defaults to 'main')
  'profiles.yaml'   // path in repo (optional, defaults to 'profiles.yaml')
)

if (result.success) {
  console.log('Profiles imported:', result.printers, result.filaments)
}
```

### Import from URL

```typescript
const result = await profilesApi.importFromUrl(
  'https://example.com/my-profiles.yaml'
)

if (result.success) {
  // Profiles imported
}
```

### Merge Profiles

```typescript
// Import profiles from external source
const imported = await profilesApi.importFromGithub('owner', 'repo')

// Merge: add new profiles, keep existing ones
const merged = await profilesApi.mergeProfiles(imported, false)

// OR replace existing profiles
const replaced = await profilesApi.mergeProfiles(imported, true)
```

## YAML Format

See `profiles.example.yaml` for a complete example.

### Basic Structure
```yaml
# Printer profiles
printers:
  - id: "printer_001"
    name: "Ender 3 Pro"
    nozzleSize: 0.4
    bedSizeX: 235
    bedSizeY: 235
    bedSizeZ: 250
    # ... more fields

# Filament profiles
filaments:
  - id: "filament_001"
    name: "PLA - White"
    material: "PLA"
    extruderTemp: 210
    bedTemp: 60
    # ... more fields
```

## Sharing Profiles

1. Create a GitHub repository
2. Add your `profiles.yaml` file
3. Share the repo URL or use GitHub import directly:
   ```typescript
   importFromGithub('username', 'profiles-repo')
   ```

## Extending Profile Types

To add new profile types (nozzles, build plates, etc.):

1. Add interface to `src/types/ipc.ts`
2. Update `ProfilesManager.exportToYaml()` and `parseYamlProfiles()`
3. Add to YAML example
4. Update IPC handlers in `main.ts`

## Limitations

- YAML parsing is simplified — complex nested structures may not parse correctly
- GitHub import requires `https:` URLs
- Private repositories are not supported (use direct URL import instead)
