const fs = require('fs');
const path = require('path');

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..');
const sourceRoot = path.join(repoRoot, 'site', 'compiler-assets');
const resourceRoot = path.join(extensionRoot, 'resources');

const filesToCopy = [
  {
    source: ['Installers', 'ubuntu_install.sh'],
    target: ['installers', 'ubuntu_install.sh'],
  },
  { source: ['graphics', 'graphics.h'], target: ['graphics', 'graphics.h'] },
  { source: ['graphics', 'modified-graphics.h'], target: ['graphics', 'modified-graphics.h'] },
  { source: ['graphics', 'winbgim.h'], target: ['graphics', 'winbgim.h'] },
  { source: ['graphics', 'libbgi.a'], target: ['graphics', 'libbgi.a'] },
];

for (const file of filesToCopy) {
  const source = path.join(sourceRoot, ...file.source);
  const target = path.join(resourceRoot, ...file.target);

  if (!fs.existsSync(source)) {
    throw new Error(`Required extension asset is missing: ${source}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (target.endsWith('.sh')) {
    const script = fs.readFileSync(source, 'utf8').replace(/\r\n?/g, '\n');
    fs.writeFileSync(target, script, 'utf8');
  } else {
    fs.copyFileSync(source, target);
  }
  console.log(`synced ${path.relative(extensionRoot, target)}`);
}
