-- =============================================================================
-- Artisan-Abidjan — diagnostic sécurité LIVE (LECTURE SEULE)
-- À coller dans l'éditeur SQL Supabase.
--
-- INTERDIT dans ce fichier (et respecté) :
--   CREATE, CREATE OR REPLACE, ALTER, DROP, INSERT, UPDATE, DELETE, TRUNCATE,
--   GRANT, REVOKE, COMMENT, SET (session), VACUUM, CALL, DO $$ ... $$
--
-- Uniquement des SELECT / fonctions de catalogue en lecture
-- (pg_get_functiondef, pg_get_triggerdef, pg_get_expr).
-- Plusieurs jeux de résultats : un par requête, dans l'ordre A → G.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. BOOKINGS — toutes les policies (dont INSERT)
-- -----------------------------------------------------------------------------
SELECT
  'A_BOOKINGS_POLICIES' AS diagnostic_section,
  pol.schemaname,
  pol.tablename,
  pol.policyname,
  pol.permissive,
  pol.roles,
  pol.cmd,
  pol.qual,
  pol.with_check
FROM pg_policies AS pol
WHERE pol.schemaname = 'public'
  AND pol.tablename = 'bookings'
ORDER BY pol.cmd, pol.policyname;

-- INSERT uniquement (facilite la lecture)
SELECT
  'A_BOOKINGS_INSERT_ONLY' AS diagnostic_section,
  pol.policyname,
  pol.roles,
  pol.cmd,
  pol.qual,
  pol.with_check,
  (COALESCE(pol.with_check, '') ILIKE '%client_id%' AND COALESCE(pol.with_check, '') ILIKE '%auth.uid()%')
    AS mentions_client_uid,
  (COALESCE(pol.with_check, '') ILIKE '%PENDING%')
    AS mentions_pending,
  (COALESCE(pol.with_check, '') ILIKE '%is_verified%')
    AS mentions_is_verified,
  (COALESCE(pol.with_check, '') ILIKE '%services%')
    AS mentions_services
FROM pg_policies AS pol
WHERE pol.schemaname = 'public'
  AND pol.tablename = 'bookings'
  AND pol.cmd = 'INSERT'
ORDER BY pol.policyname;

-- -----------------------------------------------------------------------------
-- B. TRIGGERS public.profiles (non internes) + définition des fonctions
-- -----------------------------------------------------------------------------
SELECT
  'B_PROFILES_TRIGGERS' AS diagnostic_section,
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition,
  p.proname AS function_name,
  nfn.nspname AS function_schema,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_type,
  p.proconfig AS proconfig,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger AS t
JOIN pg_class AS c
  ON c.oid = t.tgrelid
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
JOIN pg_proc AS p
  ON p.oid = t.tgfoid
JOIN pg_namespace AS nfn
  ON nfn.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND c.relname = 'profiles'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- -----------------------------------------------------------------------------
-- C. TRIGGERS public.artisans (non internes) + définition des fonctions
-- -----------------------------------------------------------------------------
SELECT
  'C_ARTISANS_TRIGGERS' AS diagnostic_section,
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition,
  p.proname AS function_name,
  nfn.nspname AS function_schema,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_type,
  p.proconfig AS proconfig,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger AS t
JOIN pg_class AS c
  ON c.oid = t.tgrelid
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
JOIN pg_proc AS p
  ON p.oid = t.tgfoid
JOIN pg_namespace AS nfn
  ON nfn.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND c.relname = 'artisans'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- -----------------------------------------------------------------------------
-- D. INDEX public.payments (tous + ciblage unique / one_active)
-- -----------------------------------------------------------------------------
SELECT
  'D_PAYMENTS_INDEXES' AS diagnostic_section,
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes AS i
WHERE i.schemaname = 'public'
  AND i.tablename = 'payments'
ORDER BY i.indexname;

SELECT
  'D_PAYMENTS_ONE_ACTIVE' AS diagnostic_section,
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes AS i
WHERE i.schemaname = 'public'
  AND i.tablename = 'payments'
  AND i.indexname = 'payments_one_active_per_booking';

SELECT
  'D_PAYMENTS_UNIQUE_INDEXES' AS diagnostic_section,
  n.nspname AS schemaname,
  t.relname AS tablename,
  i.relname AS indexname,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  pg_get_indexdef(ix.indexrelid) AS indexdef
FROM pg_index AS ix
JOIN pg_class AS i
  ON i.oid = ix.indexrelid
JOIN pg_class AS t
  ON t.oid = ix.indrelid
JOIN pg_namespace AS n
  ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'payments'
  AND ix.indisunique
ORDER BY i.relname;

-- -----------------------------------------------------------------------------
-- E. RPC — définitions (lecture seule)
-- -----------------------------------------------------------------------------
SELECT
  'E_RPC_DEFINITIONS' AS diagnostic_section,
  n.nspname AS routine_schema,
  p.proname AS routine_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_type,
  p.proconfig,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_payment_for_booking',
    'create_payment_for_accepted_quote',
    'cancel_booking',
    'artisan_create_booking_quote',
    'client_respond_to_booking_quote',
    'admin_verify_artisan',
    'is_admin'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- -----------------------------------------------------------------------------
-- F. POLICIES sensibles (tables listées)
-- -----------------------------------------------------------------------------
SELECT
  'F_SENSITIVE_POLICIES' AS diagnostic_section,
  pol.tablename AS table_name,
  pol.policyname,
  pol.permissive,
  pol.roles,
  pol.cmd,
  pol.qual,
  pol.with_check
FROM pg_policies AS pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN (
    'profiles',
    'artisans',
    'services',
    'bookings',
    'booking_quotes',
    'payments',
    'messages',
    'notifications',
    'reviews'
  )
ORDER BY pol.tablename, pol.cmd, pol.policyname;

-- -----------------------------------------------------------------------------
-- G. REALTIME — publication supabase_realtime
-- -----------------------------------------------------------------------------
SELECT
  'G_REALTIME_PUBLICATION' AS diagnostic_section,
  pt.pubname,
  pt.schemaname,
  pt.tablename
FROM pg_publication_tables AS pt
WHERE pt.pubname = 'supabase_realtime'
  AND pt.schemaname = 'public'
  AND pt.tablename IN ('messages', 'notifications')
ORDER BY pt.tablename;

SELECT
  'G_REALTIME_EXPECTED_TABLES' AS diagnostic_section,
  expected.tablename,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables AS pt
    WHERE pt.pubname = 'supabase_realtime'
      AND pt.schemaname = 'public'
      AND pt.tablename = expected.tablename
  ) AS in_supabase_realtime
FROM (
  SELECT 'messages'::text AS tablename
  UNION ALL
  SELECT 'notifications'::text
) AS expected
ORDER BY expected.tablename;
