import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()

function usage() {
  console.error('Usage: node scripts/vercel-sync.mjs <store|use> <user|admin>')
  process.exit(2)
}

const action = process.argv[2]
const target = process.argv[3]
if (!['store', 'use'].includes(action)) usage()
if (!['user', 'admin'].includes(target)) usage()

const activeDir = path.join(ROOT, '.vercel')
const storedDir = path.join(ROOT, `.vercel.${target}`)

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true })
  // Node 20+: fs.cp supports recursive copy
  await fs.cp(from, to, { recursive: true, force: true })
}

async function main() {
  if (action === 'store') {
    if (!(await exists(activeDir))) {
      throw new Error('Missing .vercel/. Run `npx vercel link` first.')
    }
    await copyDir(activeDir, storedDir)
    console.log(`Stored ${activeDir} -> ${storedDir}`)
    return
  }

  // action === 'use'
  if (!(await exists(storedDir))) {
    throw new Error(`Missing ${storedDir}/. Link & store it first (see README).`)
  }
  await copyDir(storedDir, activeDir)
  console.log(`Activated ${storedDir} -> ${activeDir}`)
}

main().catch((e) => {
  console.error(String(e?.message || e))
  process.exit(1)
})
