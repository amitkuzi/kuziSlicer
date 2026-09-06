import fs from 'node:fs'
import path from 'node:path'
const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9-]+$/.test(name)) throw new Error('Usage: npm run printer:new -- manufacturer-model')
const target = path.resolve('src/printer-extensions', name)
if (fs.existsSync(target)) throw new Error('Extension already exists')
fs.cpSync(path.resolve('src/printer-extensions/template'), target, { recursive: true, errorOnExist: true, force: false })
for (const file of ['index.ts', 'manifest.json', 'package.json']) {
  const p = path.join(target, file)
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('printer-template', name))
}
console.log(`Created ${target}. Implement prepare/connect and profiles, then run printer:bench --extension ${target}/index.ts --file <sliced-project>.`)
