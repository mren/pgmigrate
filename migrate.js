var fs = require('fs');

var bluebird = require('bluebird');
var mesa = require('mesa');
var _ = require('underscore');

var readFile = bluebird.promisify(fs.readFile);
var readdir = bluebird.promisify(fs.readdir);

function migrate(path, connection, isSync) {

  var query = bluebird.promisify(connection.query, {context: connection});

  var schemaInfo = mesa
    .setConnection(connection)
    .table('schema_info')
    .allow(['version'])
    .returning('version');

  return bluebird.resolve()
    .then(isSync ? syncDatabase : _.identity)
    .then(createSchemaInfoTableIfNotExists)
    .then(executeMigrations)
    .map(function(migration) {
      return 'Added ' + migration.description + ' to database.';
    });

  function syncDatabase() {
    var dropPath = __dirname + '/share/drop-all-tables.sql';
    return readFile(dropPath, 'utf8').then(query);
  }

  function createSchemaInfoTableIfNotExists() {
    var sql = 'CREATE TABLE IF NOT EXISTS ' +
      'schema_info (version bigint NOT NULL UNIQUE);';
    return query(sql);
  }

  function executeMigrations() {
    return bluebird.all([
      getAvailableMigrations(),
      getAllAlreadyExecutedMigrations(),
    ])
    .spread(getNewMigrations)
    .map(addSqlToMigration)
    .map(executeMigration);
  }

  function getAvailableMigrations() {
    return readdir(path)
      .map(parseSchemaFileName)
      .filter(isValidSchemaFile)
      .then(_.partial(_.sortBy, _, 'version'));

    function parseSchemaFileName(filename) {
      var date = filename.split('-').shift();
      var description = filename.substr(date.length + 1).split('.').shift();
      return {
        description: description,
        extension: filename.split('.').pop(),
        filename: filename,
        version: date,
      };
    }

    function isValidSchemaFile(schemaFile) {
      var isSqlExtension = schemaFile.extension === 'sql';
      var correctLength = schemaFile.version.toString().length === 14;
      return isSqlExtension && !isNaN(schemaFile.version) && correctLength;
    }
  }

  function getAllAlreadyExecutedMigrations() {
    return schemaInfo.find()
      .then(_.partial(_.pluck, _, 'version'));
  }

  function getNewMigrations(availableSchemas, executedVersions) {
    return availableSchemas.filter(function(schemaFile) {
      return !_.include(executedVersions, schemaFile.version.toString());
    });
  }

  function addSqlToMigration(migration) {
    return readFile(path + '/' + migration.filename, 'utf8')
      .then(function(sql) {
        return _.extend({sql: sql}, migration);
      });
  }

  function executeMigration(migration) {
    return query(migration.sql)
      .tap(function() {
        var isHook = _.contains(['00000000000000', '99999999999999'], migration.version);
        return isHook ? null : schemaInfo.insert({version: migration.version});
      })
      .return(migration);
  }
}
module.exports = migrate;
