#!/usr/bin/env bash

PATH="$PATH:`pwd`/bin"

DIR=`mktemp -d /tmp/megrim.XXXXX`
cd $DIR
REL_SCHEMA_PATH=`add-migration simple-migration`
echo "INVALID SQL" > $REL_SCHEMA_PATH
psql -c 'DROP DATABASE IF EXISTS megrim_test'
psql -c 'CREATE DATABASE megrim_test'

DATABASE_URL=postgres://localhost/megrim_test migrate

RESULT=`psql -t -c 'SELECT count(1) FROM schema_info' megrim_test | tr -d '\t\n\r '`
[ "$RESULT" == "0" ] && exit 0 || exit 1
