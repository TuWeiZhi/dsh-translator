// Fail when the committed build output no longer matches its sources.
//
// lib/ is version-controlled so that installing from git or a GitHub tarball
// works without running a build script. That trade is only safe if a stale
// artifact cannot be committed by accident, which is what this checks —
// `npm run check` calls it, and so does CI.
//
// Both directions matter: an artifact that drifted from its source, and a file
// the build no longer produces but that is still sitting in lib/ waiting to be
// shipped by a git install.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildArtifacts } from './build-artifacts.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = await buildArtifacts(root)

const mismatched = []
for (const [relative, expected] of artifacts) {
	let actual = null
	try {
		actual = await readFile(join(root, relative), 'utf8')
	} catch {
		actual = null
	}
	if (actual !== expected) mismatched.push(relative)
}

// Every file under lib/ has to be one the build renders. A leftover module
// dropped from src/ still resolves, still ships, and is exactly the kind of
// thing a text comparison of the expected files alone would never notice.
const expected = new Set(artifacts.keys())
const extra = []
const present = await readdir(join(root, 'lib'), { withFileTypes: true }).catch(() => [])
for (const entry of present) {
	const relative = 'lib/' + entry.name
	if (!expected.has(relative)) extra.push(relative)
}

if (mismatched.length > 0) {
	console.error('lib/ is out of date with src/ and client/: ' + mismatched.join(', '))
	console.error('These files are committed so a git install needs no build script.')
	console.error('Run `npm run build` and commit the result.')
}
if (extra.length > 0) {
	console.error('lib/ contains files the build does not produce: ' + extra.join(', '))
	console.error('Run `npm run build` after removing them, and commit the result.')
}
if (mismatched.length > 0 || extra.length > 0) process.exit(1)

console.log('lib/ matches src/ and client/')
