#!/usr/bin/env node
'use strict';
const fs = require('fs');
const file = 'version.js';
const content = fs.readFileSync(file, 'utf8');
const m = content.match(/APP_VERSION = '(\d+\.\d+\.)(\d+)'/);
if (!m) { console.error('Could not find version in', file); process.exit(1); }
const next    = parseInt(m[2], 10) + 1;
const version = `${m[1]}${next}`;
fs.writeFileSync(file, content.replace(/APP_VERSION = '[\d.]+'/, `APP_VERSION = '${version}'`));

// Update sw.js cache name so the browser detects a new service worker on every deploy
const swFile    = 'sw.js';
const swContent = fs.readFileSync(swFile, 'utf8');
fs.writeFileSync(swFile, swContent.replace(/const CACHE = 'showdrinks-[^']+'/, `const CACHE = 'showdrinks-${version}'`));

console.log(`Version: ${version}`);
