# kuziSlicer VSCode Extension

A VSCode extension for kuziSlicer.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Debug the extension:
   - Open the project in VSCode
   - Press `F5` to launch the extension in debug mode
   - Run the `kuziSlicer: Hello World` command from the command palette (Ctrl+Shift+P / Cmd+Shift+P)

## Project Structure

- `src/extension.ts` - Extension entry point
- `package.json` - Extension manifest and dependencies
- `tsconfig.json` - TypeScript compiler options
- `.vscode/` - Debug and editor configuration
- `dist/` - Compiled JavaScript output (generated)

## Available Commands

- `kuziSlicer.helloWorld` - Shows an information message

## Build & Watch

- Compile once: `npm run compile`
- Watch for changes: `npm run watch`

## Next Steps

- S2: Integrate brandkit via script
- S3: Build splash screen UI
- S4: Set up npm scripts/Makefile
