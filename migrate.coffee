fs = require 'fs'

Mesa = require 'mesa'
_ = require 'underscore'
async = require 'async'

module.exports = (path, connection, cb = ->) ->

    mesa = Mesa
        .connection(connection)
        .table('schema_info')
        .attributes(['version'])
        .returning('version')

    results = []

    getSchemaVersion = (cb) -> mesa.find cb

    createSchemaInfoTableIfNotExists = (cb) ->
        connection.query "CREATE TABLE IF NOT EXISTS schema_info (version bigint NOT NULL UNIQUE);", cb

    addVersionToSchemaInfo = (version, cb) ->
        mesa.insert({version: version}, cb)

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
        _.sortBy validSchemas, (schema) -> schema.version

    getAllAlreadyExecutedMigrations = (cb) ->
        getSchemaVersion (err, schemas) ->
            return cb err if err?
            cb null, _.pluck schemas, 'version'

    getNewMigrations = (availableSchemas, executedVersions) ->
        availableSchemas.filter (schemaFile) ->
            not _.include executedVersions, "#{schemaFile.version}"

    addSqlToMigration = (migration) ->
        migration.sql = fs.readFileSync "#{path}/#{migration.filename}", 'utf8'
        migration

    executeMigration = (migration, cb) ->
        connection.query migration.sql, (err, result) ->
            return cb err if err?
            addVersionToSchemaInfo migration.version, (err) ->
                return cb err if err?
                results.push "added #{migration.description} to database"
                cb null

    executeMigrations = (cb) ->
        createSchemaInfoTableIfNotExists (err) ->
            return cb err if err?
            availableSchemas = getAvailableMigrations()
            getAllAlreadyExecutedMigrations (err, executedVersions) ->
                return cb err if err?
                newMigrations = getNewMigrations availableSchemas, executedVersions

                withSql = newMigrations.map addSqlToMigration

                async.forEach withSql, executeMigration, (err) ->
                    return console.error err if err?
                    cb null

    executeMigrations (err) ->
        return cb err if err?
        cb null, results
