const fs = require('fs');
const path = require('path');

const extensionRoot = path.resolve(__dirname, '..');
const resourcesRoot = path.join(extensionRoot, 'resources');
const requiredFiles = [
  ['installers', 'ubuntu_install.sh'],
  ['graphics', 'graphics.h'],
  ['graphics', 'modified-graphics.h'],
  ['graphics', 'winbgim.h'],
  ['graphics', 'libbgi.a'],
];

for (const parts of requiredFiles) {
  const filePath = path.join(resourcesRoot, ...parts);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`Required extension asset is missing or empty: ${filePath}`);
  }
}

const installer = fs.readFileSync(path.join(resourcesRoot, 'installers', 'ubuntu_install.sh'));
if (installer.includes(13)) {
  throw new Error('ubuntu_install.sh must use LF line endings.');
}

const rawHeader = fs.readFileSync(path.join(resourcesRoot, 'graphics', 'graphics.h'), 'utf8');
const compatibilityHeader = fs.readFileSync(path.join(resourcesRoot, 'graphics', 'modified-graphics.h'), 'utf8');

if (!rawHeader.includes('char *pathtodriver')) {
  throw new Error('graphics.h must remain the raw upstream header.');
}

if (!compatibilityHeader.includes('const char *pathtodriver')) {
  throw new Error('modified-graphics.h must contain the const-correct compatibility signature.');
}

console.log('extension assets validated');
