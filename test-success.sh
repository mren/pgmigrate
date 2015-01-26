#!/usr/bin/env bash

PATH="$PATH:`pwd`/bin"

DIR=`mktemp -d /tmp/megrim.XXXXX`
cd $DIR
REL_SCHEMA_PATH=`add-migration simple-migration`
echo "CREATE TABLE simple (value TEXT); INSERT INTO simple (value) VALUES ('hello');" > $REL_SCHEMA_PATH
psql -c 'DROP DATABASE IF EXISTS megrim_test'
psql -c 'CREATE DATABASE megrim_test'

DATABASE_URL=postgres://localhost/megrim_test migrate

RESULT=`psql -t -c 'SELECT value FROM simple' megrim_test | tr -d '\t\n\r '`
[ "$RESULT" == "hello" ] && exit 0 || exit 1
