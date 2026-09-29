-- Audit workflow réservation → devis → paiement.
-- À exécuter dans l'éditeur SQL Supabase.
-- Idempotent. Ne DROP aucune RLS, RPC ni trigger.
--
-- Pourquoi :
-- Les RPC create_payment_for_booking et create_payment_for_accepted_quote
-- refusent déjà un second paiement PENDING ou PAID, mais deux appels
-- simultanés (double-clic / deux onglets) peuvent passer le EXISTS
-- avant l'INSERT. Cet index unique est la barrière réelle.
--
-- FAILED n'est pas couvert : un nouveau paiement reste possible.
-- REFUNDED n'est pas couvert : pas de recréation automatique dans le frontend ;
-- la RPC actuelle le permettrait encore si le booking est ACCEPTED.

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_per_booking
ON public.payments (booking_id)
WHERE status IN ('PENDING', 'PAID');
