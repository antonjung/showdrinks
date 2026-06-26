#!/usr/bin/env node
'use strict';
const fs = require('fs');
const file = 'version.js';
const content = fs.readFileSync(file, 'utf8');
const m = content.match(/APP_VERSION = '(\d+\.\d+\.)(\d+)'/);
if (!m) { console.error('Could not find version in', file); process.exit(1); }
const next = parseInt(m[2], 10) + 1;
fs.writeFileSync(file, content.replace(/APP_VERSION = '[\d.]+'/, `APP_VERSION = '${m[1]}${next}'`));
console.log(`Version: ${m[1]}${next}`);
