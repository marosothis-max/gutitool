#!/usr/bin/env bash
# Prueba las migraciones contra un PostgreSQL local (16+).
# Uso: PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=gutitool_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stub.sql 2>&1 | grep -v -i wal_level || true
for f in supabase/migrations/*.sql; do
  psql -q -d $DB -v ON_ERROR_STOP=1 -f "$f"
done
psql -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/10_scenarios.sql
