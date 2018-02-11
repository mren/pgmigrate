const assert = require('assert');

const mockFs = require('mock-fs');
const pg = require('pg');
const pgConnectionString = require('pg-connection-string');

const migrate = require('../migrate');

assert(process.env.DATABASE_URL, 'Should have a DATABASE_URL.');

const config = pgConnectionString.parse(process.env.DATABASE_URL);

describe('migrate', () => {
  beforeEach('reset database', () =>
    new pg.Pool(config).query('DROP TABLE IF EXISTS test, schema_info'));

  afterEach(mockFs.restore);

  it('should migrate a schema', () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'CREATE TABLE test (value TEXT);',
      'path/2016-01-01T19:00:00Z-another-name.sql': 'INSERT INTO test (value) VALUES (\'value\');',
    });
    return migrate('path', new pg.Pool(config))
      .then((result) => {
        assert.deepStrictEqual(result, [
          'Added 2016-01-01T17:00:00Z-name.sql to database.',
          'Added 2016-01-01T19:00:00Z-another-name.sql to database.',
        ]);
      })
      .then(() => new pg.Pool(config).query('SELECT * FROM test'))
      .then(result => assert.deepEqual(result.rows, [{ value: 'value' }]))
      .then(() => new pg.Pool(config).query('SELECT * FROM schema_info'))
      .then(result => assert.deepEqual(result.rows, [
        { version: '2016-01-01T17:00:00Z-name.sql' },
        { version: '2016-01-01T19:00:00Z-another-name.sql' },
      ]));
  });

  it('should not migrate an invalid schema', () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'create invalid sql',
    });
    return migrate('path', new pg.Pool(config))
      .then(() => assert(false))
      .catch(err => assert.strictEqual(err.message, 'syntax error at or near "invalid"'));
  });

  it('should be idempotent', () => {
    mockFs({
      'path/20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    });
    return migrate('path', new pg.Pool(config))
      .then(() => migrate('path', new pg.Pool(config)));
  });

  it('should allow hooks', () => {
    mockFs({
      'path/0000-00-00T00:00:00:000Z-prehook.sql': 'INSERT INTO test (value) VALUES (\'pre\')',
      'path/2016-01-01T00:00:00:000Z-name.sql': 'INSERT INTO test (value) VALUES (\'value\')',
      'path/9999-99-99T99:99:99:999Z-posthook.sql': 'INSERT INTO test (value) VALUES (\'post\')',
    });
    return new pg.Pool(config).query('CREATE TABLE test (value TEXT)')
      .then(() => migrate('path', new pg.Pool(config)))
      .then(() => migrate('path', new pg.Pool(config)))
      .then(() => new pg.Pool(config).query('SELECT * FROM test'))
      .then(results => assert.deepEqual(results.rows, [
        { value: 'pre' },
        { value: 'value' },
        { value: 'post' },
        { value: 'pre' },
        { value: 'post' },
      ]));
  });

  it('should allow to sync database', () => {
    mockFs({
      'path/20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    });
    return migrate('path', new pg.Pool(config))
      .then(() => new pg.Pool(config).query('INSERT INTO test (value) VALUES (\'value\')'))
      .then(() => migrate('path', new pg.Pool(config), true))
      .then(() => new pg.Pool(config).query('SELECT * FROM test'))
      .then(result => assert.deepEqual(result.rows, [], 'oh'));
  });
});
