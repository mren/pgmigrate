var fs = require('fs');

var async = require('async');
var Mesa = require('mesa');
var _ = require('underscore');

function migrate(path, connection, isSync, cb) {

  var mesa = Mesa
    .connection(connection)
    .table('schema_info')
    .attributes(['version'])
    .returning('version');

  var results = [];

  function getSchemaVersion(cb) {
    return mesa.find(cb);
  }

  function createSchemaInfoTableIfNotExists(cb) {
    var sql = 'CREATE TABLE IF NOT EXISTS ' +
      'schema_info (version bigint NOT NULL UNIQUE);';
    return connection.query(sql, cb);
  }

  function addVersionToSchemaInfo(version, cb) {
    return mesa.insert({
      version: version
    }, cb);
  }

  function parseSchemaFileName(filename) {
    var date = filename.split('-').shift();
    var description = filename.substr(date.length + 1).split('.').shift();
    return {
      description: description,
      extension: filename.split('.').pop(),
      filename: filename,
      version: Number(date),
    };
  }

  function isValidSchemaFile(schemaFile) {
    var isSqlExtension = schemaFile.extension === 'sql';
    var correctLength = schemaFile.version.toString().length === 14;
    return isSqlExtension && !isNaN(schemaFile.version) && correctLength;
  }

  function getAvailableMigrations() {
    var filenames = fs.readdirSync(path);
    var availableSchemas = filenames.map(parseSchemaFileName);
    var validSchemas = availableSchemas.filter(isValidSchemaFile);
    return _.sortBy(validSchemas, function(schema) {
      return schema.version;
    });
  }

  function getAllAlreadyExecutedMigrations(cb) {
    getSchemaVersion(function(err, schemas) {
      cb(err, _.pluck(schemas, 'version'));
    });
  }
  function getNewMigrations(availableSchemas, executedVersions) {
    return availableSchemas.filter(function(schemaFile) {
      return !_.include(executedVersions, '' + schemaFile.version);
    });
  }
  function addSqlToMigration(migration) {
    migration.sql = fs.readFileSync(path + '/' + migration.filename, 'utf8');
    return migration;
  }

  function executeMigration(migration, cb) {
    connection.query(migration.sql, function(err, result) {
      if (err) return cb(err);
      addVersionToSchemaInfo(migration.version, function(err) {
        if (err) return cb(err);
        results.push('Added ' + migration.description + ' to database.');
        return cb();
      });
    });
  }

  function executeMigrations(cb) {
    createSchemaInfoTableIfNotExists(function(err) {
      if (err) return cb(err);
      var availableSchemas = getAvailableMigrations();
      getAllAlreadyExecutedMigrations(function(err, oldMigrations) {
        if (err) return cb(err);
        var newMigrations = getNewMigrations(availableSchemas, oldMigrations);
        var withSql = newMigrations.map(addSqlToMigration);
        async.forEach(withSql, executeMigration, function(err) {
          cb(err, err ? null : results);
        });
      });
    });
  }

  if (isSync) {
    var dropPath = __dirname + '/share/drop-all-tables.sql'
    var syncQuery = fs.readFileSync(dropPath, 'utf-8');
    connection.query(syncQuery, function(err, result) {
      if (err) throw err;
      executeMigrations(cb);
    });
  } else {
    executeMigrations(cb);
  }

}
module.exports = migrate;
