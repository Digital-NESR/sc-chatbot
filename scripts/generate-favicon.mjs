/**
 * Generates a circular favicon PNG from nesr-logo.jpg.
 * Run with: node scripts/generate-favicon.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SIZE = 256;

// Create a circular SVG mask
const circleMask = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}">
    <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="white"/>
  </svg>`
);

const inputPath = join(root, 'public', 'nesr-logo.jpg');
const outputPath = join(root, 'src', 'app', 'icon.png');

await sharp(inputPath)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toFile(outputPath);

console.log(`✅ Circular favicon saved to: ${outputPath}`);
