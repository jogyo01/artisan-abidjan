-- Artisan-Abidjan — association service ↔ métier + horaires hebdomadaires.
-- À coller dans l'éditeur SQL Supabase UNIQUEMENT après lecture.
-- Ne pas exécuter à l'aveugle : d'abord le bloc DIAGNOSTIC, puis le bloc MIGRATION.
--
-- Suppression d'un métier (DELETE artisan_categories artisan_id=X, category_id=Y) :
--   1) DELETE des services de X/Y QUI NE SONT RÉFÉRENCÉS PAR AUCUNE réservation ;
--   2) UPDATE category_id = NULL des services de X/Y déjà liés à bookings.service_id.
--   Les autres métiers restent. Les services déjà NULL restent NULL.
--   Aucun DELETE/UPDATE sur bookings, payments, booking_quotes, reviews, messages.
--
-- Pourquoi pas ON DELETE CASCADE depuis services.id :
--   bookings.service_id est un champ d'historique (immuable côté app).
--   Si la FK live est CASCADE, supprimer le service détruirait les bookings.
--   Si elle est RESTRICT/NO ACTION, le DELETE du service ferait échouer
--   le retrait du métier. D'où : ne jamais DELETE un service encore référencé.

-- ============================================================
-- 1) DIAGNOSTIC (lecture seule) — FK vers public.services(id)
-- ============================================================

SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'services'
ORDER BY ordinal_position;

SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'categories'
  AND column_name = 'id';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'artisans'
  AND column_name IN ('weekly_hours', 'photo_url', 'avatar_url');

-- Toutes les FK qui pointent vers public.services(id)
SELECT
  n.nspname AS from_schema,
  rel.relname AS from_table,
  att.attname AS from_column,
  fnsp.nspname AS to_schema,
  frel.relname AS to_table,
  fatt.attname AS to_column,
  con.conname,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE con.confdeltype::text
  END AS on_delete,
  CASE con.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE con.confupdtype::text
  END AS on_update,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = rel.relnamespace
JOIN pg_class AS frel ON frel.oid = con.confrelid
JOIN pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
JOIN pg_attribute AS att
  ON att.attrelid = rel.oid AND att.attnum = ck.attnum
JOIN pg_attribute AS fatt
  ON fatt.attrelid = frel.oid AND fatt.attnum = fk.attnum
WHERE con.contype = 'f'
  AND fnsp.nspname = 'public'
  AND frel.relname = 'services'
  AND fatt.attname = 'id'
ORDER BY from_table, from_column, con.conname;

-- Ciblage bookings.service_id → services.id
SELECT
  n.nspname AS from_schema,
  rel.relname AS from_table,
  att.attname AS from_column,
  con.conname,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE con.confdeltype::text
  END AS on_delete,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = rel.relnamespace
JOIN pg_class AS frel ON frel.oid = con.confrelid
JOIN pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
JOIN pg_attribute AS att
  ON att.attrelid = rel.oid AND att.attnum = ck.attnum
JOIN pg_attribute AS fatt
  ON fatt.attrelid = frel.oid AND fatt.attnum = fk.attnum
WHERE con.contype = 'f'
  AND n.nspname = 'public'
  AND rel.relname = 'bookings'
  AND att.attname = 'service_id'
  AND fnsp.nspname = 'public'
  AND frel.relname = 'services'
  AND fatt.attname = 'id';

SELECT
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'artisan_categories'
ORDER BY con.conname;

-- ============================================================
-- 2) MIGRATION MINIMALE (additive)
-- ============================================================

ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS weekly_hours jsonb;

COMMENT ON COLUMN public.artisans.weekly_hours IS
  'Horaires hebdomadaires V1, objet JSON par jour (open/close/closed).';

DO $$
DECLARE
  v_cat_type text;
  v_has_category_id boolean;
BEGIN
  SELECT c.data_type
  INTO v_cat_type
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'categories'
    AND c.column_name = 'id';

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'services'
      AND c.column_name = 'category_id'
  )
  INTO v_has_category_id;

  IF v_has_category_id THEN
    RAISE NOTICE 'services.category_id existe déjà — aucune colonne ajoutée.';
    RETURN;
  END IF;

  IF v_cat_type = 'uuid' THEN
    ALTER TABLE public.services
      ADD COLUMN category_id uuid REFERENCES public.categories(id);
  ELSIF v_cat_type = 'bigint' THEN
    ALTER TABLE public.services
      ADD COLUMN category_id bigint REFERENCES public.categories(id);
  ELSIF v_cat_type = 'integer' THEN
    ALTER TABLE public.services
      ADD COLUMN category_id integer REFERENCES public.categories(id);
  ELSE
    RAISE EXCEPTION 'Type de categories.id non géré : %', v_cat_type;
  END IF;

  RAISE NOTICE 'Colonne services.category_id ajoutée (type %).', v_cat_type;
END $$;

CREATE INDEX IF NOT EXISTS services_artisan_category_idx
  ON public.services (artisan_id, category_id);

COMMENT ON COLUMN public.services.category_id IS
  'Métier (categories.id) auquel rattacher la prestation. NULL = service non classé (héritage V1).';

CREATE OR REPLACE FUNCTION public.enforce_service_category_for_artisan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.artisan_categories AS ac
    WHERE ac.artisan_id = NEW.artisan_id
      AND ac.category_id = NEW.category_id
  ) THEN
    RAISE EXCEPTION 'category_id must belong to the artisan';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_category_artisan ON public.services;
CREATE TRIGGER trg_services_category_artisan
BEFORE INSERT OR UPDATE OF artisan_id, category_id
ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.enforce_service_category_for_artisan();

-- ============================================================
-- 3) RETRAIT D'UN MÉTIER — SANS CASSER L'HISTORIQUE DES BOOKINGS
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_services_for_removed_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.services AS s
  WHERE s.artisan_id = OLD.artisan_id
    AND s.category_id = OLD.category_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.service_id = s.id
    );

  UPDATE public.services AS s
  SET category_id = NULL
  WHERE s.artisan_id = OLD.artisan_id
    AND s.category_id = OLD.category_id
    AND EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.service_id = s.id
    );

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_services_for_removed_trade() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_artisan_categories_delete_services ON public.artisan_categories;
CREATE TRIGGER trg_artisan_categories_delete_services
BEFORE DELETE ON public.artisan_categories
FOR EACH ROW
EXECUTE FUNCTION public.delete_services_for_removed_trade();

-- Reclassement prudent : seulement si l'artisan n'a qu'un seul métier.
-- Ne supprime aucun service existant. Les autres restent category_id NULL.
UPDATE public.services AS s
SET category_id = only_one.category_id
FROM (
  SELECT artisan_id, MIN(category_id) AS category_id
  FROM public.artisan_categories
  GROUP BY artisan_id
  HAVING COUNT(*) = 1
) AS only_one
WHERE s.category_id IS NULL
  AND s.artisan_id = only_one.artisan_id;
