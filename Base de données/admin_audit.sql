-- Audit espace ADMIN — correction minimale.
-- Pourquoi : la vérification artisan dans l'UI faisait
--   UPDATE artisans SET is_verified = true
-- depuis le client. Sans policy UPDATE admin, RLS bloque ;
-- avec une policy UPDATE trop large, l'admin pourrait modifier
-- id, téléphone, ville, etc.
-- Cette RPC SECURITY DEFINER ne pose que is_verified = true.
-- Ne DROP aucune policy, aucun trigger, aucune table.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_verify_artisan(p_artisan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_artisan_id IS NULL THEN
    RAISE EXCEPTION 'invalid artisan';
  END IF;

  UPDATE public.artisans
  SET is_verified = true
  WHERE id = p_artisan_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'artisan not found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_artisan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_verify_artisan(uuid) TO authenticated;
