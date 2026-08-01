/**
 * Build a square app icon from assets/logo.jpg (flower-focused crop).
 * Tall botanical art reads poorly at connector size; square flower crop works better.
 */
const path = require('path');
const fs = require('fs');

async function main() {
  const sharp = (await import('sharp')).default;
  const root = path.join(__dirname, '..');
  const src = path.join(root, 'assets', 'logo.jpg');
  const buf = fs.readFileSync(src);
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Top square: flower + upper stem (logo is tall; flower is in the upper third).
  const side = Math.min(w, Math.floor(h * 0.42));
  const left = Math.max(0, Math.floor((w - side) / 2));
  const top = Math.max(0, Math.floor(h * 0.02));

  const png512 = await sharp(buf)
    .extract({ left, top, width: side, height: side })
    .resize(512, 512)
    .png()
    .toBuffer();

  const targets = [
    path.join(root, 'claude-plugin', 'icon.png'),
    path.join(root, 'claude-plugin', '.claude-plugin', 'icon.png'),
    path.join(root, 'public', 'logo.png'),
    path.join(root, 'public', 'favicon.png'),
    path.join(root, 'desktop-extension', 'icon.png'),
  ];

  for (const dest of targets) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, png512);
    console.log('Wrote', path.relative(root, dest));
  }

  // ICO-ish: browsers accept PNG bytes as favicon.ico often enough; also write png.
  fs.writeFileSync(path.join(root, 'public', 'favicon.ico'), png512);
  console.log('Wrote public/favicon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
