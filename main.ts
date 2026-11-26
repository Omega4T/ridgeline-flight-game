// Ridgeline: Merapi Ridge Run — the entry program for make.fun
// best-flight-game-20261126-0057 (Node 22, stdlib only). It hands the game
// in: copy the repository's game/ and screenshots/ trees into the output
// directory and write /output/dossier.json with the kit's vendored
// buildDossier library, the summary the judge reads.
//
// Run it locally with:
//   MAKEFUN_OUTPUT_DIR=/tmp/ridgeline-out node main.ts
// The grader runs it twice and requires both runs to produce identical
// bytes, so nothing here depends on time, randomness or environment.

import { mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
  }
}

mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
