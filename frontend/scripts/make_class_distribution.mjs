/**
 * Derive the per-class crop counts shown on the home page from data/manifest.csv
 * (the training pipeline's master index) into a small committed JSON file.
 *   node scripts/make_class_distribution.mjs      # from frontend/; rerun if the manifest changes
 *
 * Counts are crops (one per bounding box), not source photographs. A row is an augmented
 * copy when its file name starts with `aug_` (src/preprocessing writes them that way).
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const manifest = path.join(root, 'data', 'manifest.csv')
const out = path.resolve(import.meta.dirname, '..', 'src', 'content', 'class-distribution.json')

const lines = (await readFile(manifest, 'utf8')).trim().split(/\r?\n/)
const header = lines.shift().split(',')
const col = (name) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`manifest.csv has no ${name} column`)
  return i
}
const [iPath, iLabel, iSplit] = [col('filepath'), col('label'), col('split')]

const classes = new Map()
const totals = { train: 0, augmented: 0, val: 0, test: 0 }
for (const line of lines) {
  const cells = line.split(',')
  const label = cells[iLabel]
  const split = cells[iSplit]
  const file = cells[iPath].split(/[\\/]/).pop() ?? ''
  const row = classes.get(label) ?? { label, train: 0, augmented: 0, val: 0, test: 0 }
  const key = split === 'train' && file.startsWith('aug_') ? 'augmented' : split
  if (!(key in totals)) throw new Error(`unexpected split ${split}`)
  row[key] += 1
  totals[key] += 1
  classes.set(label, row)
}

const rows = [...classes.values()].sort((a, b) => b.train - a.train || a.label.localeCompare(b.label))
const data = {
  _source: 'data/manifest.csv via frontend/scripts/make_class_distribution.mjs',
  _note:
    'Crops per class. train = original training crops after the stratified train/val split; augmented = extra rare-class copies added to train; val/test = untouched.',
  totals: { ...totals, classes: rows.length, rows: lines.length },
  classes: rows,
}
await writeFile(out, JSON.stringify(data, null, 1) + '\n')
console.log(`${out}: ${rows.length} classes`, totals)
