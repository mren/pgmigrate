#!/usr/bin/env node

var pg = require('pg');

var migrate = require('./migrate');

var databaseUrl = process.env.DATABASE_URL;

var isSync = process.argv[2] === '--sync';

if (!databaseUrl) {
    console.log('No DATABASE_URL found in environment.');
    return;
}

pg.connect(databaseUrl, function(err, client, done) {
    if (err) throw err;

    migrate('schema', client, isSync)
      .then(console.log)
      .catch(function(err) {
        console.error(err)
        process.exit(1);
      })
      .finally(function() {
        done();
        pg.end();
      });
});
