const assert = require('assert');
const fs = require('fs');

const dropSql = fs.readFileSync(`${__dirname}/share/drop-all-tables.sql`, 'utf8');

function migrate(path, pool, isSync) {
  assert(pool.query, 'Should have pool.query. Please use pg.Pool.');
  assert(pool.connect, 'Should have pool.connect. Please use pg.Pool');
  const hooks = [
    '0000-00-00T00:00:00:000Z',
    '9999-99-99T99:99:99:999Z',
  ];
  const isHook = migration => hooks.some(hook => migration.filename.indexOf(hook) === 0);

  const schemaSql = 'INSERT INTO schema_info (version) VALUES ($1)';
  const executeMigration = migration => pool.connect().then(client => Promise.resolve()
    .then(() => client.query('BEGIN'))
    .then(() => client.query(migration.sql))
    .then(() => (isHook(migration) ? null : client.query(schemaSql, [migration.filename])))
    .then(() => client.query('COMMIT'))
    .catch(err => client.query('ROLLBACK').then(() => Promise.reject(err)))
    .then(() => client.release())
    .then(() => migration)
  );

  const endsWith = (str, suffix) => str.indexOf(suffix, str.length - suffix.length) !== -1;

  const isValidSchemaFile = schemaFile => endsWith(schemaFile, '.sql');

  const filesystemSchemas = fs.readdirSync(path).filter(isValidSchemaFile).sort();

  const getDatabaseSchemas = () => pool.query('SELECT * FROM schema_info')
    .then(result => result.rows.map(schema => schema.version));

  const filterNewSchemas = (available, existing) =>
    available.filter(schema => existing.indexOf(schema) === -1);

  const loadSql = filename => ({ filename, sql: fs.readFileSync(`${path}/${filename}`, 'utf8') });

  const executeMigrations = () => Promise.all([filesystemSchemas, getDatabaseSchemas()])
    .then(promises => filterNewSchemas(promises[0], promises[1]))
    .then(results => Promise.all(results.map(loadSql)))
    .then((migrations) => {
      const results = [];
      migrations.forEach(task =>
        results.push((results.slice(-1)[0] || Promise.resolve()).then(() => executeMigration(task)))
      );
      return Promise.all(results);
    });

  const schemaTableSql = 'CREATE TABLE IF NOT EXISTS schema_info (version text not null unique)';

  return Promise.resolve()
    .then(() => (isSync ? pool.query(dropSql) : null))
    .then(() => pool.query(schemaTableSql))
    .then(executeMigrations)
    .then(migrations => pool.end()
      .then(() => migrations.map(migration => `Added ${migration.filename} to database.`))
    );
}
module.exports = migrate;
