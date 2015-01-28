DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS foo ();
    EXECUTE (
        SELECT string_agg('DROP TABLE IF EXISTS "' || table_name || '" CASCADE;', '')
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    );
END
$$;
