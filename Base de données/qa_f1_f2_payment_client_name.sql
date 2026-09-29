-- QA finale : F1 paiement après COMPLETED + F2 nom client artisan.
-- À exécuter dans l'éditeur SQL Supabase.
-- Idempotent. Ne DROP aucune RLS, trigger, ni policy profiles.
-- Isolation A/B inchangée : bookings / services / messages / payments / reviews.

-- ---------------------------------------------------------------------------
-- F1 — Paiement si la réservation est ACCEPTED, IN_PROGRESS ou COMPLETED
-- Montant FIXED : snapshot accepted_amount (déjà en place).
-- Un seul paiement PENDING/PAID par réservation (EXISTS + index unique).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_payment_for_booking(p_booking_id bigint)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_booking public.bookings;
  v_service public.services;
  v_payment public.payments;
  v_amount numeric(12,2);
  v_currency text;
  v_reference text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF v_booking.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_booking.status NOT IN ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED') THEN
    RAISE EXCEPTION 'booking not payable';
  END IF;

  SELECT * INTO v_service
  FROM public.services
  WHERE id = v_booking.service_id;

  IF NOT FOUND OR v_service.artisan_id IS DISTINCT FROM v_booking.artisan_id THEN
    RAISE EXCEPTION 'invalid service';
  END IF;

  IF v_service.price_type IS DISTINCT FROM 'FIXED' THEN
    RAISE EXCEPTION 'quote required';
  END IF;

  IF v_booking.accepted_amount IS NULL OR v_booking.accepted_amount <= 0 THEN
    RAISE EXCEPTION 'accepted amount missing';
  END IF;

  v_amount := round(v_booking.accepted_amount, 2);
  v_currency := COALESCE(NULLIF(v_booking.accepted_currency, ''), 'XOF');

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = v_booking.id
      AND status IN ('PENDING', 'PAID')
  ) THEN
    RAISE EXCEPTION 'active payment exists';
  END IF;

  v_reference := 'AA-' || v_booking.id::text || '-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.payments (
    booking_id,
    client_id,
    artisan_id,
    amount,
    currency,
    status,
    payment_method,
    transaction_reference
  )
  VALUES (
    v_booking.id,
    v_booking.client_id,
    v_booking.artisan_id,
    v_amount,
    v_currency,
    'PENDING',
    'MANUAL',
    v_reference
  )
  RETURNING * INTO v_payment;

  PERFORM public.notify_account(
    v_booking.client_id,
    'Paiement créé',
    'Un paiement est en cours de préparation pour votre demande.'
  );

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_for_booking(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_for_booking(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_payment_for_accepted_quote(p_booking_id bigint)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_booking public.bookings;
  v_service public.services;
  v_quote public.booking_quotes;
  v_payment public.payments;
  v_reference text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF v_booking.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_booking.status NOT IN ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED') THEN
    RAISE EXCEPTION 'booking not payable';
  END IF;

  SELECT * INTO v_service
  FROM public.services
  WHERE id = v_booking.service_id;

  IF NOT FOUND OR v_service.artisan_id IS DISTINCT FROM v_booking.artisan_id THEN
    RAISE EXCEPTION 'invalid service';
  END IF;

  IF v_service.price_type NOT IN ('STARTING_FROM', 'ON_QUOTE') THEN
    RAISE EXCEPTION 'quote not required';
  END IF;

  SELECT * INTO v_quote
  FROM public.booking_quotes
  WHERE booking_id = v_booking.id
    AND status = 'ACCEPTED'
    AND client_id = v_booking.client_id
    AND artisan_id = v_booking.artisan_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_quote.amount IS NULL OR v_quote.amount <= 0 THEN
    RAISE EXCEPTION 'accepted quote required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = v_booking.id
      AND status IN ('PENDING', 'PAID')
  ) THEN
    RAISE EXCEPTION 'active payment exists';
  END IF;

  v_reference := 'AA-' || v_booking.id::text || '-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.payments (
    booking_id,
    client_id,
    artisan_id,
    amount,
    currency,
    status,
    payment_method,
    transaction_reference,
    quote_id
  )
  VALUES (
    v_booking.id,
    v_booking.client_id,
    v_booking.artisan_id,
    round(v_quote.amount, 2),
    COALESCE(NULLIF(v_quote.currency, ''), 'XOF'),
    'PENDING',
    'MANUAL',
    v_reference,
    v_quote.id
  )
  RETURNING * INTO v_payment;

  PERFORM public.notify_account(
    v_booking.client_id,
    'Paiement créé',
    'Un paiement est en cours de préparation pour le devis accepté.'
  );

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_for_accepted_quote(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_for_accepted_quote(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- F2 — Nom du client uniquement si l'appelant est l'artisan de la réservation.
-- Pas de SELECT profiles ouvert. Pas de téléphone / adresse / email.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artisan_client_display_names()
RETURNS TABLE (client_id uuid, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ARTISAN'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    b.client_id,
    NULLIF(btrim(p.full_name), '')
  FROM public.bookings AS b
  INNER JOIN public.profiles AS p
    ON p.id = b.client_id
  WHERE b.artisan_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.artisan_client_display_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artisan_client_display_names() TO authenticated;

CREATE OR REPLACE FUNCTION public.booking_client_display_name(p_booking_id bigint)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF auth.uid() IS NULL OR p_booking_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ARTISAN'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(btrim(p.full_name), '')
  INTO v_name
  FROM public.bookings AS b
  INNER JOIN public.profiles AS p
    ON p.id = b.client_id
  WHERE b.id = p_booking_id
    AND b.artisan_id = auth.uid();

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_client_display_name(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_client_display_name(bigint) TO authenticated;
