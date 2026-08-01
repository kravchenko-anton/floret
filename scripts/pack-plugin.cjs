const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'claude-plugin');
const zipOut = path.join(src, 'floret.zip');
const pluginOut = path.join(src, 'floret.plugin');

for (const f of [zipOut, pluginOut]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// Zip contents of claude-plugin/ so .claude-plugin is at archive root.
execSync(
  `tar -a -cf "${zipOut}" --exclude=floret.zip --exclude=floret.plugin -C "${src}" .`,
  {
    stdio: 'inherit',
    shell: true,
  },
);

fs.copyFileSync(zipOut, pluginOut);

const size = fs.statSync(zipOut).size;
console.log(`Ready: ${zipOut} (${size} bytes)`);
console.log(`Also:  ${pluginOut}`);
console.log('Upload floret.zip in Claude → Plugins → Upload plugin');
