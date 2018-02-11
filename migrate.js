const assert = require('assert');
const fs = require('fs');

const dropSql = `do $$
begin
  create table if not exists foo ();
  execute (
    select string_agg('drop table if exists "' || table_name || '" cascade;', '')
    from information_schema.tables
    where
      table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'spatial_ref_sys'
    );
end
$$;`;

const migrate = async (path, pool, isSync) => {
  assert(pool.query, 'Should have pool.query. Please use pg.Pool.');
  assert(pool.connect, 'Should have pool.connect. Please use pg.Pool');
  const hooks = [
    '0000-00-00T00:00:00:000Z',
    '9999-99-99T99:99:99:999Z',
  ];
  const isHook = migration => hooks.some(hook => migration.filename.startsWith(hook));

  const executeMigration = async (migration) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(migration.sql);
      if (!isHook(migration)) {
        await client.query('insert into schema_info (version) values ($1)', [migration.filename]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      await client.release();
    }
  };

  const executeMigrations = async () => {
    const databaseSchemas = (await pool.query('select * from schema_info')).rows
      .map(schema => schema.version);
    const filesystemSchemas = fs.readdirSync(path).filter(file => file.endsWith('.sql')).sort();
    const newSchemas = filesystemSchemas.filter(schema => !databaseSchemas.includes(schema));
    const migrations = newSchemas
      .map(filename => ({ filename, sql: fs.readFileSync(`${path}/${filename}`, 'utf8') }));
    // We want to use await in a loop, because this executed the migrations in a sequence.
    // eslint-disable-next-line no-restricted-syntax
    for (const migration of migrations) {
      // eslint-disable-next-line no-await-in-loop
      await executeMigration(migration);
    }
    return migrations;
  };

  if (isSync) {
    await pool.query(dropSql);
  }
  await pool.query('create table if not exists schema_info (version text not null unique)');
  const migrations = await executeMigrations();
  return migrations.map(migration => `Added ${migration.filename} to database.`);
};
module.exports = migrate;
