// Prepack guard: ensure the packed bundle contains lib/ so installs get code.
import { statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
for (const p of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
  try {
    statSync(join(root, p))
  } catch {
    console.error(`prepack: missing ${p} — refusing to publish an empty bundle.`)
    process.exit(1)
  }
}
console.log('dsh-csv-and-image-preview: prepack ok.')
