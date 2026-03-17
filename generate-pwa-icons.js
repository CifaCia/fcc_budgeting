import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ICON_CONFIG = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function generateIcons() {
  const inputPath = 'public/favicon.svg';
  const outputDir = 'public';

  if (!existsSync(inputPath)) {
    console.error(`Error: ${inputPath} not found.`);
    process.exit(1);
  }

  console.log('🚀 Generating PWA icons from SVG...');

  try {
    for (const { name, size } of ICON_CONFIG) {
      await sharp(inputPath)
        .resize(size, size)
        .png()
        .toFile(join(outputDir, name));
      
      console.log(`✅ Generated ${name} (${size}x${size})`);
    }

    // Special case for maskable icon (adds padding/safe zone)
    // For 512px icon, we put the logo in a ~410px area (80%)
    const maskableSize = 512;
    const padding = Math.floor(maskableSize * 0.1); // 10% padding
    
    await sharp(inputPath)
      .resize(maskableSize - (padding * 2), maskableSize - (padding * 2))
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 0, g: 0, b: 0, alpha: 1 } // Pure black for AMOLED
      })
      .png()
      .toFile(join(outputDir, 'pwa-512x512-maskable.png'));

    console.log('✅ Generated pwa-512x512-maskable.png (Safe-zone respected)');
    console.log('✨ All icons are ready for production.');
    
  } catch (error) {
    console.error('❌ Failed to generate icons:', error);
    process.exit(1);
  }
}

generateIcons();
