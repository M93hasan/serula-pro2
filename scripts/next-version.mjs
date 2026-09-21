import { readFileSync, writeFileSync } from 'node:fs';

const files = ['package.json', 'frontend/package.json', 'package-lock.json'];
const data = files.map(file => JSON.parse(readFileSync(file, 'utf8')));
const [major, minor, patch] = data[0].version.split('.').map(Number);
if (![major, minor, patch].every(Number.isInteger)) throw new Error('Geçersiz sürüm numarası.');
const version = `${major}.${minor}.${patch + 1}`;
data[0].version = version;
data[1].version = version;
data[2].version = version;
data[2].packages[''].version = version;
data[2].packages.frontend.version = version;
files.forEach((file, index) => writeFileSync(file, JSON.stringify(data[index], null, 2) + '\n'));
console.log(`v${version}`);
