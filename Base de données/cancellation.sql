-- Annulation des réservations V1.
-- À exécuter dans l'éditeur SQL Supabase.
-- Idempotent : CREATE OR REPLACE des fonctions. Ne DROP pas les RLS ni les triggers métier existants.
--
-- Transitions de statut conservées :
--   PENDING     → ACCEPTED | REFUSED | CANCELLED
--   ACCEPTED    → IN_PROGRESS | CANCELLED
--   IN_PROGRESS → COMPLETED | CANCELLED
-- Autres changements de statut : refusés.
--
-- Annulation (CANCELLED) selon auth.uid() :
--   PENDING     → CANCELLED : CLIENT propriétaire uniquement
--   ACCEPTED    → CANCELLED : CLIENT ou ARTISAN propriétaire
--   IN_PROGRESS → CANCELLED : ARTISAN propriétaire uniquement
--
-- Champs protégés : id, client_id, artisan_id, service_id, created_at,
-- address, description, scheduled_at, latitude, longitude.
-- Seul status peut changer, et uniquement selon les transitions ci-dessus.
--
-- Frontend : appeler public.cancel_booking(p_booking_id), pas un UPDATE libre.
-- Paiements : aucun remboursement automatique. Les RPC de paiement exigent déjà ACCEPTED.
-- Devis : les RPC artisan_create_booking_quote / client_respond_to_booking_quote
-- exigent déjà status = ACCEPTED, donc une réservation CANCELLED est déjà bloquée.
-- Les devis PENDING de la réservation sont passés à CANCELLED lors de l'annulation.

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

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_protect_artisan_booking_update'
      AND tgrelid = 'public.bookings'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_protect_artisan_booking_update
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_artisan_booking_update();
  END IF;
END
$$;

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

  IF v_booking.status = 'ACCEPTED'
     AND v_booking.client_id IS DISTINCT FROM v_uid
     AND v_booking.artisan_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not authorized';
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
    AND status = 'PENDING';

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_title text := 'Réservation annulée';
  v_message text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'CANCELLED' OR OLD.status IS NOT DISTINCT FROM 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.client_id THEN
    v_recipient := NEW.artisan_id;
    v_message := 'Le client a annulé la demande n°' || NEW.id::text || '.';
  ELSIF auth.uid() = NEW.artisan_id THEN
    v_recipient := NEW.client_id;
    v_message := 'L''artisan a annulé la demande n°' || NEW.id::text || '.';
  ELSE
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE user_id = v_recipient
      AND title = v_title
      AND message = v_message
      AND created_at > now() - interval '2 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_account(v_recipient, v_title, v_message);

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_bookings_notify_cancelled'
      AND tgrelid = 'public.bookings'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_bookings_notify_cancelled
    AFTER UPDATE OF status ON public.bookings
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'CANCELLED')
    EXECUTE FUNCTION public.notify_booking_cancelled();
  END IF;
END
$$;
