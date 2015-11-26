DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS foo ();
    --DROP EXTENSION IF EXISTS postgis;
    EXECUTE (
        SELECT string_agg('DROP TABLE IF EXISTS "' || table_name || '" CASCADE;', '')
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'spatial_ref_sys'
    );
END
$$;
