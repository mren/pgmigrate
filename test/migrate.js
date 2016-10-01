const assert = require('assert');

const pg = require('pg');
// eslint-disable-next-line import/no-extraneous-dependencies
const mockFs = require('mock-fs');

const migrate = require('../migrate');

assert(process.env.DATABASE_URL, 'Should have a DATABASE_URL.');

describe('migrate', () => {
  const getConnection = cb => pg.connect(process.env.DATABASE_URL, cb);
  // eslint-disable-next-line no-var
  var client;

  beforeEach('get postgres connection', (done) => {
    getConnection((err, pgClient) => {
      client = pgClient;
      done(err);
    });
  });

  beforeEach('reset database', () =>
    client.query('DROP TABLE IF EXISTS test, schema_info')
  );

  it('should migrate a schema', () => {
    mockFs({
      path: {
        '2016-01-01T17:00:00Z-name.sql': 'CREATE TABLE test (value TEXT);',
        '2016-01-01T19:00:00Z-another-name.sql': 'INSERT INTO test (value) VALUES (\'value\');',
      },
    });
    return migrate('path', getConnection)
      .then(() => client.query('SELECT * FROM test'))
      .then(result => assert.deepEqual(result.rows, [{ value: 'value' }]))
      .then(() => client.query('SELECT * FROM schema_info'))
      .then(result => assert.deepEqual(result.rows, [
        { version: '2016-01-01T17:00:00Z-name.sql' },
        { version: '2016-01-01T19:00:00Z-another-name.sql' },
      ]))
      .then(() => mockFs.restore());
  });

  it('should be idempotent', () => {
    mockFs({ path: {
      '20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    } });
    return migrate('path', getConnection)
      .then(() => migrate('path', getConnection))
      .then(() => mockFs.restore());
  });

  it('should allow hooks', () => {
    mockFs({ path: {
      '0000-00-00T00:00:00:000Z-prehook.sql': 'INSERT INTO test (value) VALUES (\'pre\')',
      '2016-01-01T00:00:00:000Z-name.sql': 'INSERT INTO test (value) VALUES (\'value\')',
      '9999-99-99T99:99:99:999Z-posthook.sql': 'INSERT INTO test (value) VALUES (\'post\')',
    } });
    return client.query('CREATE TABLE test (value TEXT)')
      .then(() => migrate('path', getConnection))
      .then(() => migrate('path', getConnection))
      .then(() => client.query('SELECT * FROM test'))
      .then(results => assert.deepEqual(results.rows, [
        { value: 'pre' },
        { value: 'value' },
        { value: 'post' },
        { value: 'pre' },
        { value: 'post' },
      ]))
      .then(() => mockFs.restore());
  });

  it('should allow to sync database', () => {
    mockFs({ path: {
      '20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    } });
    return migrate('path', getConnection)
      .then(() => client.query('INSERT INTO test (value) VALUES (\'value\')'))
      .then(() => migrate('path', getConnection, true))
      .then(() => client.query('SELECT * FROM test'))
      .then(result => assert.deepEqual(result.rows, []))
      .then(() => mockFs.restore());
  });
});
