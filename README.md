# megrim

Migration Tool for Postgres databases in node.js

# usage

`node_modules/.bin` contains `add-migration` and `migrate`.

## add-migration

`add-migration <name>` will add a migration file to `schema/$timestamp-$name.sql`.
Custom SQl can be written into this file.

## migrate

`migrate` will execute all migrations which are not yet in the database.
Therefore `migrate` will look at the environment variable `DATABASE_URL`.


## Technical Implementaiton

```coffeescript
megrim = require 'megrim'
megrim path_to_migrations, psql_connection, (err, result) ->
    console.err err if err?
    console.log result
```

All sql files in `path_to_migrations` which are not yet in the database are executed.
After successful execution the timestamp of the migration file is added to the `schema_info` table.

The format of the migrations files should be

```
YYYYMMDDHHMMSS-description.sql
```


License MIT
