#!/usr/bin/env node

const pg = require('pg');

const migrate = require('./migrate');

const databaseUrl = process.env.DATABASE_URL;
const isSync = process.argv[2] === '--sync';

if (!databaseUrl) {
  console.log('No DATABASE_URL found in environment.');
  process.exit(1);
}

const getConnection = cb => pg.connect(databaseUrl, cb);

migrate('schema', getConnection, isSync)
  .then((result) => {
    console.log(result);
    pg.end();
  })
  .catch((err) => {
    console.error(err);
    pg.end();
    process.exit(1);
  });
