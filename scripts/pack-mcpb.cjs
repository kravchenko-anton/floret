const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'desktop-extension');
const target = path.join(dir, 'floret-1.0.0.mcpb');

execSync('npx --yes @anthropic-ai/mcpb pack .', {
  cwd: dir,
  stdio: 'inherit',
});

for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.mcpb') || name === 'floret-1.0.0.mcpb') continue;
  fs.renameSync(path.join(dir, name), target);
  console.log(`Renamed ${name} → floret-1.0.0.mcpb`);
}

if (!fs.existsSync(target)) {
  console.error('Expected desktop-extension/floret-1.0.0.mcpb was not created');
  process.exit(1);
}

console.log(`Ready: ${target}`);
