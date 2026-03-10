/**
 * Script to process the scan receipt icon:
 * 1. Remove white/near-white background (make transparent)
 * 2. Trim whitespace
 * 3. Resize to icon sizes for different densities
 *
 * Usage: node scripts/process-scan-icon.js
 */

const sharp = require('sharp');
const path = require('path');

const INPUT = path.resolve(
  __dirname,
  '../apps/mobile/assets/photo_2026-03-01_00-10-21.jpg',
);
const OUTPUT_DIR = path.resolve(__dirname, '../apps/mobile/assets/icons');

async function processIcon() {
  // Read original image and get raw pixel data
  const image = sharp(INPUT);
  const { width, height, channels } = await image.metadata();

  console.log(`Input: ${width}x${height}, ${channels} channels`);

  // Convert to raw RGBA pixels
  const rawBuffer = await image
    .ensureAlpha()
    .raw()
    .toBuffer();

  const pixels = new Uint8Array(rawBuffer);

  // Process pixels: make white/near-white pixels transparent
  // The image has a neon orange icon on white background with glow
  const WHITE_THRESHOLD = 240; // pixels with R,G,B all above this become transparent
  const GLOW_THRESHOLD = 200; // pixels in glow zone get partial transparency

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // Pure white or near-white → fully transparent
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      pixels[i + 3] = 0; // alpha = 0
    }
    // Glow zone: light pixels that are slightly colored
    // These are the soft glow around the icon
    else if (r >= GLOW_THRESHOLD && g >= GLOW_THRESHOLD && b >= GLOW_THRESHOLD) {
      // Calculate how "white" this pixel is (higher = more white)
      const whiteness = Math.min(r, g, b);
      // Map whiteness from [GLOW_THRESHOLD..WHITE_THRESHOLD] to alpha [255..0]
      const alpha = Math.round(
        255 * (1 - (whiteness - GLOW_THRESHOLD) / (WHITE_THRESHOLD - GLOW_THRESHOLD)),
      );
      pixels[i + 3] = alpha;
    }
    // else: keep original alpha (255 = fully opaque)
  }

  // Create PNG from processed pixels first
  const pngBuffer = await sharp(Buffer.from(pixels.buffer), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  // Trim transparent edges
  const trimmed = await sharp(pngBuffer)
    .trim()
    .toBuffer();

  // Save at multiple sizes for different screen densities
  const sizes = [
    { name: 'scan-receipt.png', size: 96 },
    { name: 'scan-receipt@2x.png', size: 192 },
    { name: 'scan-receipt@3x.png', size: 288 },
  ];

  for (const { name, size } of sizes) {
    const output = path.join(OUTPUT_DIR, name);
    await sharp(trimmed)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(output);
    console.log(`Output saved: ${output} (${size}x${size})`);
  }

  console.log('Done!');
}

processIcon().catch(console.error);
