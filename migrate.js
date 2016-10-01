const fs = require('fs');

const dropSql = fs.readFileSync(`${__dirname}/share/drop-all-tables.sql`, 'utf8');

function migrate(path, connection, isSync) {
  if (connection instanceof Function) {
    const defer = Promise.defer();
    connection((err, client, done) => {
      if (err) {
        return defer.reject(err);
      }
      return defer.resolve(migrate(path, client, isSync).then(() => done()));
    });
    return defer.promise;
  }

  const executeMigration = migration => connection.query(migration.sql)
    .then(() => {
      const preHook = '0000-00-00T00:00:00:000Z';
      if (migration.filename.indexOf(preHook) === 0) {
        return null;
      }
      const postHook = '9999-99-99T99:99:99:999Z';
      if (migration.filename.indexOf(postHook) === 0) {
        return null;
      }
      const sql = 'INSERT INTO schema_info (version) VALUES ($1)';
      return connection.query(sql, [migration.filename]);
    })
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

  const schemaSql = 'CREATE TABLE IF NOT EXISTS schema_info (version text not null unique)';

  return Promise.resolve()
    .then(isSync ? connection.query(dropSql) : Function)
    .then(() => connection.query(schemaSql))
    .then(executeMigrations)
    .then(migrations => migrations.map(migration => `Added ${migration.filename} to database.`));
}
module.exports = migrate;
