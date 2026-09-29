-- =============================================================================
-- Inscription : rôle CLIENT | ARTISAN (jamais ADMIN)
-- À coller dans l'éditeur SQL Supabase APRÈS relecture.
-- Ne pas exécuter automatiquement depuis l'agent.
--
-- - handle_new_user : lit raw_user_meta_data.role (fallback account_type)
-- - ADMIN ignoré → CLIENT
-- - protect_profile_role : non modifié
-- - complete_artisan_signup : ligne artisans + artisan_categories
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  final_role text;
  v_full_name text;
BEGIN
  requested_role := upper(
    btrim(
      COALESCE(
        NEW.raw_user_meta_data->>'role',
        NEW.raw_user_meta_data->>'account_type',
        ''
      )
    )
  );

  IF requested_role = 'ARTISAN' THEN
    final_role := 'ARTISAN';
  ELSE
    final_role := 'CLIENT';
  END IF;

  v_full_name := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, v_full_name, final_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_signup_categories()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name
  FROM public.categories AS c
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.list_signup_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_signup_categories() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_artisan_signup(p_category_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_name text;
  v_ids uuid[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT p.role, p.full_name
  INTO v_role, v_name
  FROM public.profiles AS p
  WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'ARTISAN' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.id), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_category_ids, ARRAY[]::uuid[])) AS requested(id)
  INNER JOIN public.categories AS c ON c.id = requested.id;

  IF v_ids IS NULL OR cardinality(v_ids) < 1 THEN
    RAISE EXCEPTION 'categories required';
  END IF;

  INSERT INTO public.artisans (
    id,
    business_name,
    description,
    address,
    city,
    phone,
    is_verified,
    is_available
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(btrim(COALESCE(v_name, '')), ''), 'Mon atelier'),
    NULL,
    NULL,
    'Abidjan',
    NULL,
    false,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.artisan_categories (artisan_id, category_id)
  SELECT v_uid, category_id
  FROM unnest(v_ids) AS category_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.artisan_categories AS ac
    WHERE ac.artisan_id = v_uid
      AND ac.category_id = category_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_artisan_signup(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_artisan_signup(uuid[]) TO authenticated;
