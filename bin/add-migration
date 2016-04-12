#!/usr/bin/env node

var fs = require('fs');

var migrationName = process.argv[2]

if(!fs.existsSync('schema/')) {
  fs.mkdirSync('schema');
}

if(!migrationName) {
    console.log('Usage: script/add-migration {migration-name}');
    return;
}

var time = new Date().toISOString().slice(0, -5).replace(/[-:T]/g, '');
var filepath = 'schema/' + time + '-' + migrationName + '.sql';
fs.writeFileSync(filepath, '');
console.log(filepath);
