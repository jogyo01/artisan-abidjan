-- Artisan-Abidjan : publication Realtime pour messages et notifications.
-- Idempotent. Ne recrée pas les tables. Ne modifie pas les RLS ni les triggers.
-- À exécuter dans l'éditeur SQL Supabase si les tables ne sont pas déjà dans supabase_realtime.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END
$$;

-- Permet aux événements UPDATE filtrés par user_id / is_read d'inclure ces colonnes.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
