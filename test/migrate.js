const assert = require('assert');

const mockFs = require('mock-fs');
const pg = require('pg');
const sinon = require('sinon');

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

  afterEach(mockFs.restore);

  it('should migrate a schema', () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'CREATE TABLE test (value TEXT);',
      'path/2016-01-01T19:00:00Z-another-name.sql': 'INSERT INTO test (value) VALUES (\'value\');',
    });
    return migrate('path', getConnection)
      .then((result) => {
        assert.deepStrictEqual(result, [
          'Added 2016-01-01T17:00:00Z-name.sql to database.',
          'Added 2016-01-01T19:00:00Z-another-name.sql to database.',
        ]);
      })
      .then(() => client.query('SELECT * FROM test'))
      .then(result => assert.deepEqual(result.rows, [{ value: 'value' }]))
      .then(() => client.query('SELECT * FROM schema_info'))
      .then(result => assert.deepEqual(result.rows, [
        { version: '2016-01-01T17:00:00Z-name.sql' },
        { version: '2016-01-01T19:00:00Z-another-name.sql' },
      ]));
  });

  it('should not migrate an invalid schema', () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'create invalid sql',
    });
    return migrate('path', getConnection)
      .then(() => assert(false))
      .catch(err => assert.strictEqual(err.message, 'syntax error at or near "invalid"'));
  });

  it('should be idempotent', () => {
    mockFs({
      'path/20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    });
    return migrate('path', getConnection)
      .then(() => migrate('path', getConnection));
  });

  it('should allow hooks', () => {
    mockFs({
      'path/0000-00-00T00:00:00:000Z-prehook.sql': 'INSERT INTO test (value) VALUES (\'pre\')',
      'path/2016-01-01T00:00:00:000Z-name.sql': 'INSERT INTO test (value) VALUES (\'value\')',
      'path/9999-99-99T99:99:99:999Z-posthook.sql': 'INSERT INTO test (value) VALUES (\'post\')',
    });
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
      ]));
  });

  it('should allow to sync database', () => {
    mockFs({
      'path/20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    });
    return migrate('path', getConnection)
      .then(() => client.query('INSERT INTO test (value) VALUES (\'value\')'))
      .then(() => migrate('path', getConnection, true))
      .then(() => client.query('SELECT * FROM test'))
      .then(result => assert.deepEqual(result.rows, []));
  });

  it('should call done in happy case', () => {
    const done = sinon.stub();
    mockFs({ path: {} });
    const getConnectionStub = cb => cb(null, { query: () => Promise.resolve({ rows: [] }) }, done);
    return migrate('path', getConnectionStub)
      .then(() => sinon.assert.calledOnce(done));
  });

  it('should call done in error case', () => {
    const done = sinon.stub();
    mockFs({ path: {} });
    const getConnectionStub = cb => cb(null, { query: () => Promise.reject(new Error()) }, done);
    return migrate('path', getConnectionStub)
      .then(() => assert(false))
      .catch(() => sinon.assert.calledOnce(done));
  });
});
