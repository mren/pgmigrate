# megrim

Migration Tool for Postgres databases in node.js

# usage

```coffeescript
megrim = require 'megrim'
megrim path_to_migrations, psql_connection_string, (err, result) ->
    console.err err if err
    console.log result
```

All sql files in `path_to_migrations` which are not yet in the database are executed.
After successful execution the timestamp of the migration file is added to the `schema_info` table.

The format of the migrations files should be

```
YYYYMMDDHHMMSS-description.sql
```


