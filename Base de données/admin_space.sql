-- Espace ADMIN — policies et RPC additives.
-- À coller dans l'éditeur SQL Supabase.
-- Ne supprime aucune policy existante.
-- Si une policy du même nom existe déjà, ignorez l'erreur et continuez.

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

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text;

-- SELECT admin (OR avec les policies existantes)

CREATE POLICY profiles_select_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY bookings_select_admin
ON public.bookings
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY reviews_select_admin
ON public.reviews
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY payments_select_admin
ON public.payments
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY categories_select_admin
ON public.categories
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY services_select_admin
ON public.services
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY artisans_select_admin
ON public.artisans
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY artisan_categories_select_admin
ON public.artisan_categories
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Catégories : écriture ADMIN uniquement
-- artisan_categories.category_id référence categories.id :
-- la suppression d'une catégorie encore liée doit échouer (pas de CASCADE).

CREATE POLICY categories_insert_admin
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY categories_update_admin
ON public.categories
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY categories_delete_admin
ON public.categories
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Paiements : transitions via RPC, jamais un UPDATE libre du frontend.

CREATE OR REPLACE FUNCTION public.admin_set_payment_status(
  p_payment_id bigint,
  p_new_status text
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_new_status NOT IN ('PAID', 'FAILED', 'REFUNDED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  IF NOT (
    (v_payment.status = 'PENDING' AND p_new_status IN ('PAID', 'FAILED'))
    OR (v_payment.status = 'PAID' AND p_new_status = 'REFUNDED')
  ) THEN
    RAISE EXCEPTION 'transition not allowed';
  END IF;

  UPDATE public.payments
  SET status = p_new_status
  WHERE id = p_payment_id
    AND status = v_payment.status
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_payment_status(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_status(bigint, text) TO authenticated;
