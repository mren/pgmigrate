const fs = require('fs');

const dropSql = fs.readFileSync(`${__dirname}/share/drop-all-tables.sql`, 'utf8');

function migrate(path, connection, isSync) {
  if (connection instanceof Function) {
    return new Promise((resolve, reject) => {
      connection((err, client, done) => {
        if (err) {
          return reject(err);
        }
        return resolve(migrate(path, client, isSync)
          .then((result) => {
            done();
            return result;
          })
          .catch((migrateError) => {
            done();
            return Promise.reject(migrateError);
          })
        );
      });
    });
  }
  const hooks = [
    '0000-00-00T00:00:00:000Z',
    '9999-99-99T99:99:99:999Z',
  ];
  const isHook = migration => hooks.some(hook => migration.filename.indexOf(hook) === 0);

  const schemaSql = 'INSERT INTO schema_info (version) VALUES ($1)';
  const executeMigration = migration => Promise.resolve()
    .then(() => connection.query('BEGIN'))
    .then(() => connection.query(migration.sql))
    .then(() => (isHook(migration) ? null : connection.query(schemaSql, [migration.filename])))
    .then(() => connection.query('COMMIT'))
    .catch(err => connection.query('ROLLBACK').then(() => Promise.reject(err)))
    .then(() => migration);

  const endsWith = (str, suffix) => str.indexOf(suffix, str.length - suffix.length) !== -1;

  const isValidSchemaFile = schemaFile => endsWith(schemaFile, '.sql');

  const filesystemSchemas = fs.readdirSync(path).filter(isValidSchemaFile).sort();

  const getDatabaseSchemas = () => connection.query('SELECT * FROM schema_info')
    .then(result => result.rows.map(schema => schema.version));

  const filterNewSchemas = (available, existing) =>
    available.filter(schema => existing.indexOf(schema) === -1);

  const loadSql = filename => ({ filename, sql: fs.readFileSync(`${path}/${filename}`, 'utf8') });

  const executeMigrations = () => Promise.all([filesystemSchemas, getDatabaseSchemas()])
    .then(promises => filterNewSchemas(promises[0], promises[1]))
    .then(results => Promise.all(results.map(loadSql)))
    .then(results => Promise.all(results.map(executeMigration)));

  const schemaTableSql = 'CREATE TABLE IF NOT EXISTS schema_info (version text not null unique)';

  return Promise.resolve()
    .then(isSync ? connection.query(dropSql) : Function)
    .then(() => connection.query(schemaTableSql))
    .then(executeMigrations)
    .then(migrations => migrations.map(migration => `Added ${migration.filename} to database.`));
}
module.exports = migrate;
