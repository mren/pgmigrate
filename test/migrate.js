const assert = require('assert');

const mockFs = require('mock-fs');
const pg = require('pg');
const pgConnectionString = require('pg-connection-string');

const migrate = require('../migrate');

assert(process.env.DATABASE_URL, 'Should have a DATABASE_URL.');

const config = pgConnectionString.parse(process.env.DATABASE_URL);

const awaitError = promise => new Promise((resolve, reject) => promise
  .then(() => reject(new Error('No error was thrown.')))
  .catch(err => resolve(err)));

describe('migrate', () => {
  let pool;

  before('get pool', () => {
    pool = new pg.Pool(config);
  });

  after('destroy pool', async () => {
    await pool.end();
  });

  beforeEach('reset database', async () => {
    await pool.query('DROP TABLE IF EXISTS test, schema_info');
  });

  afterEach('cleanup', () => {
    mockFs.restore();
  });

  it('should migrate a schema', async () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'CREATE TABLE test (value TEXT);',
      'path/2016-01-01T19:00:00Z-another-name.sql': 'INSERT INTO test (value) VALUES (\'value\');',
    });
    const result = await migrate('path', pool);
    assert.deepStrictEqual(result, [
      'Added 2016-01-01T17:00:00Z-name.sql to database.',
      'Added 2016-01-01T19:00:00Z-another-name.sql to database.',
    ]);
    const { rows: selectTest } = await pool.query('SELECT * FROM test');
    assert.deepEqual(selectTest, [{ value: 'value' }]);
    const { rows: selectSchema } = await pool.query('SELECT * FROM schema_info');
    assert.deepEqual(selectSchema, [
      { version: '2016-01-01T17:00:00Z-name.sql' },
      { version: '2016-01-01T19:00:00Z-another-name.sql' },
    ]);
  });

  it('should not migrate an invalid schema', async () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'create invalid sql',
    });
    const error = await awaitError(migrate('path', pool));
    assert.strictEqual(error.message, 'syntax error at or near "invalid"');
  });

  it('should be idempotent', async () => {
    mockFs({
      'path/20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    });
    await migrate('path', pool);
    await migrate('path', pool);
  });

  it('should allow hooks', async () => {
    mockFs({
      'path/0000-00-00T00:00:00:000Z-prehook.sql': 'INSERT INTO test (value) VALUES (\'pre\')',
      'path/2016-01-01T00:00:00:000Z-name.sql': 'INSERT INTO test (value) VALUES (\'value\')',
      'path/9999-99-99T99:99:99:999Z-posthook.sql': 'INSERT INTO test (value) VALUES (\'post\')',
    });
    await pool.query('CREATE TABLE test (value TEXT)');
    await migrate('path', pool);
    await migrate('path', pool);
    const { rows: results } = await pool.query('SELECT * FROM test');
    assert.deepEqual(results, [
      { value: 'pre' },
      { value: 'value' },
      { value: 'post' },
      { value: 'pre' },
      { value: 'post' },
    ]);
  });

  it('should allow to sync database', async () => {
    mockFs({
      'path/20000000000000-name.sql': 'CREATE TABLE test (value TEXT);',
    });
    await migrate('path', pool);
    await pool.query('INSERT INTO test (value) VALUES (\'value\')');
    await migrate('path', pool, true);
    const { rows: result } = await pool.query('SELECT * FROM test');
    assert.deepEqual(result, [], 'oh');
  });

  it('should execute migrations in sequence', async () => {
    mockFs({
      'path/2016-01-01T17:00:00Z-name.sql': 'select pg_sleep(0.001); create table test (value text);',
      'path/2016-01-01T19:00:00Z-another-name.sql': 'insert into test (value) values (\'value\');',
    });
    await migrate('path', pool);
  });
});
