-- =============================================================================
-- Corrections métier post-audit LIVE
-- À coller dans l'éditeur SQL Supabase APRÈS relecture.
-- Ne pas exécuter automatiquement depuis l'agent.
--
-- 1) Snapshot du prix FIXED à l'acceptation (colonnes bookings)
-- 2) create_payment_for_booking utilise le snapshot, pas services.price live
-- 3) cancel_booking annule les devis PENDING et ACCEPTED
--
-- Paiements PENDING/PAID/REFUNDED : aucun remboursement automatique.
-- create_payment_for_accepted_quote : inchangé (montant = devis accepté).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colonnes de snapshot (NULL pour STARTING_FROM / ON_QUOTE)
-- -----------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS accepted_amount numeric(12,2);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS accepted_currency text;

-- Backfill des réservations déjà ACCEPTED / IN_PROGRESS / COMPLETED (FIXED).
UPDATE public.bookings AS b
SET
  accepted_amount = round(s.price, 2),
  accepted_currency = 'XOF'
FROM public.services AS s
WHERE s.id = b.service_id
  AND s.artisan_id = b.artisan_id
  AND s.price_type = 'FIXED'
  AND s.price IS NOT NULL
  AND s.price > 0
  AND b.accepted_amount IS NULL
  AND b.status IN ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED');

-- -----------------------------------------------------------------------------
-- 2. Trigger : figer le prix FIXED uniquement au passage PENDING → ACCEPTED
-- Conservé : champs immuables + transitions artisan/client existantes.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_artisan_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_client boolean;
  v_is_artisan boolean;
  v_status_ok boolean := false;
  v_price numeric(12,2);
  v_price_type text;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.artisan_id IS DISTINCT FROM OLD.artisan_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.address IS DISTINCT FROM OLD.address
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
  THEN
    RAISE EXCEPTION 'booking protected fields cannot change';
  END IF;

  IF (
       NEW.accepted_amount IS DISTINCT FROM OLD.accepted_amount
       OR NEW.accepted_currency IS DISTINCT FROM OLD.accepted_currency
     )
     AND NOT (OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED')
  THEN
    RAISE EXCEPTION 'booking protected fields cannot change';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_is_client := v_uid = OLD.client_id;
  v_is_artisan := v_uid = OLD.artisan_id;

  IF OLD.status = 'PENDING' AND NEW.status IN ('ACCEPTED', 'REFUSED') AND v_is_artisan THEN
    v_status_ok := true;
  ELSIF OLD.status = 'ACCEPTED' AND NEW.status = 'IN_PROGRESS' AND v_is_artisan THEN
    v_status_ok := true;
  ELSIF OLD.status = 'IN_PROGRESS' AND NEW.status = 'COMPLETED' AND v_is_artisan THEN
    v_status_ok := true;
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'CANCELLED' AND v_is_client THEN
    v_status_ok := true;
  ELSIF OLD.status = 'ACCEPTED' AND NEW.status = 'CANCELLED' AND (v_is_client OR v_is_artisan) THEN
    v_status_ok := true;
  ELSIF OLD.status = 'IN_PROGRESS' AND NEW.status = 'CANCELLED' AND v_is_artisan THEN
    v_status_ok := true;
  END IF;

  IF NOT v_status_ok THEN
    RAISE EXCEPTION 'booking status transition not allowed';
  END IF;

  IF OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED' THEN
    SELECT s.price, s.price_type
    INTO v_price, v_price_type
    FROM public.services AS s
    WHERE s.id = NEW.service_id
      AND s.artisan_id = NEW.artisan_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid service';
    END IF;

    IF v_price_type = 'FIXED' THEN
      IF v_price IS NULL OR v_price <= 0 THEN
        RAISE EXCEPTION 'invalid price';
      END IF;
      NEW.accepted_amount := round(v_price, 2);
      NEW.accepted_currency := 'XOF';
    ELSE
      NEW.accepted_amount := NULL;
      NEW.accepted_currency := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Paiement FIXED : montant = snapshot à l'acceptation
-- Signature, SECURITY DEFINER et search_path inchangés.
-- -----------------------------------------------------------------------------

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

  IF v_booking.status IS DISTINCT FROM 'ACCEPTED' THEN
    RAISE EXCEPTION 'booking not accepted';
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

-- -----------------------------------------------------------------------------
-- 4. Annulation : devis PENDING et ACCEPTED → CANCELLED
-- Paiements : inchangés (pas de remboursement automatique).
-- Les RPC de paiement exigent déjà booking.status = ACCEPTED.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id bigint)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_booking public.bookings;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_booking_id IS NULL OR p_booking_id <= 0 THEN
    RAISE EXCEPTION 'invalid booking';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF v_booking.client_id IS DISTINCT FROM v_uid
     AND v_booking.artisan_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_booking.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'booking already cancelled';
  END IF;

  IF v_booking.status = 'PENDING' AND v_booking.client_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'artisan cannot cancel pending booking';
  END IF;

  IF v_booking.status = 'IN_PROGRESS' AND v_booking.artisan_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'client cannot cancel in-progress booking';
  END IF;

  IF v_booking.status NOT IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'booking cannot be cancelled';
  END IF;

  UPDATE public.bookings
  SET status = 'CANCELLED'
  WHERE id = v_booking.id
    AND status = v_booking.status
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking status transition not allowed';
  END IF;

  UPDATE public.booking_quotes
  SET status = 'CANCELLED', updated_at = now()
  WHERE booking_id = v_booking.id
    AND status IN ('PENDING', 'ACCEPTED');

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking(bigint) TO authenticated;
