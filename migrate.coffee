fs = require 'fs'

mohair = require('mohair').postgres
sqlhelper = require 'sqlhelper'
_ = require 'underscore'
async = require 'async'
pg = require 'pg'

module.exports = (path, connString, cb = ->) ->

    results = []

    getSchemaVersion = (connection, cb) ->
        m = mohair()
        m.select 'schema_info'
        connection.query m.sql(), m.params(), sqlhelper.getRows cb

    createSchemaInfoTableIfNotExists = (connection, cb) ->
        connection.query "CREATE TABLE IF NOT EXISTS schema_info (version bigint NOT NULL UNIQUE);", cb

    addVersionToSchemaInfo = (connection, version, cb) ->
        m = mohair()
        m.insert 'schema_info', {version: version}
        connection.query m.sql(), m.params(), cb

    parseSchemaFileName = (filename) ->
        date = parseInt filename.split('-').shift(), 10
        filename: filename
        extension: filename.split('.').pop()
        version: date
        description: filename.substr(date.toString().length+1).split('.').shift()

    isValidSchemaFile = (schemaFile) ->
        {version, extension} = schemaFile
        schemaFile.extension is 'sql' and not isNaN(version) and "#{version}".length is 14

    getAvailableMigrations = ->
        filenames = fs.readdirSync path
        availableSchemas = filenames.map (filename) -> parseSchemaFileName filename
        validSchemas = availableSchemas.filter isValidSchemaFile

    getAllAlreadyExecutedMigrations = (connection, cb) ->
        getSchemaVersion connection, (err, schemas) ->
            return cb err if err?
            cb null, _.pluck schemas, 'version'

    getNewMigrations = (availableSchemas, executedVersions) ->
        notInDatabase = (schemaFile) -> not _.include executedVersions, schemaFile.version
        newMigrations = availableSchemas.filter notInDatabase

    addSqlToMigration = (migration) ->
        migration.sql = fs.readFileSync "#{path}/#{migration.filename}", 'utf8'
        migration

    executeMigration = (connection, migration, cb) ->
        connection.query migration.sql, (err, result) ->
            return cb err if err?
            addVersionToSchemaInfo connection, migration.version, (err) ->
                return cb err if err?
                results.push "added #{migration.description} to database"
                cb null

    executeMigrations = (connection, cb) ->
        createSchemaInfoTableIfNotExists connection, (err) ->
            return cb err if err?
            availableSchemas = getAvailableMigrations()
            getAllAlreadyExecutedMigrations connection, (err, executedVersions) ->
                return cb err if err?
                newMigrations = getNewMigrations availableSchemas, executedVersions

                withSql = newMigrations.map addSqlToMigration

                async.forEach withSql, ((migration, cb) -> executeMigration connection, migration, cb), (err) ->
                    return console.error err if err?
                    cb null

    pg.connect connString, (err, connection) ->
        return cb err if err?
        throw new Error err if err?
        executeMigrations connection, (err) ->
            return cb err if err?
            pg.end()
            cb null, results
