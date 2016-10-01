#!/usr/bin/env node

const fs = require('fs');

const migrationName = process.argv[2];

if (!fs.existsSync('schema/')) {
  fs.mkdirSync('schema');
}

if (!migrationName) {
  console.log('Usage: script/add-migration {migration-name}');
  process.exit();
}

const filepath = `schema/${new Date().toISOString()}-${migrationName}.sql`;
fs.writeFileSync(filepath, '');
console.log(filepath);
