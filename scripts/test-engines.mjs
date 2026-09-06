// Runs the TypeScript self-checks that live next to their sources (*.test.ts).
// Same no-framework approach as the other scripts here: esbuild bundles each check,
// then it executes in-process and throws on failure.
// Run: node scripts/test-engines.mjs
import path from 'node:path'
import esbuild from 'esbuild'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const CHECKS = [
  'src/main/services/engines/sliceEngine.test.ts',
  'src/main/services/engines/supportEngine.test.ts',
  'src/main/services/engines/threeMfEngine.test.ts',
  'src/renderer/utils/gcodeToolpath.test.ts',
]

let failed = 0

for (const check of CHECKS) {
  const built = esbuild.buildSync({
    entryPoints: [path.resolve(check)],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['electron'],
    write: false,
  })

  try {
    const mod = { exports: {} }
    new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require)
  } catch (err) {
    failed++
    console.error(`FAIL: ${check}\n${err instanceof Error ? err.message : err}`)
  }
}

if (failed > 0) {
  console.error(`${failed} of ${CHECKS.length} engine self-checks failed`)
  process.exit(1)
}

console.log(`PASS: ${CHECKS.length} engine self-checks (slicing, infill, 3MF, toolpath preview)`)
