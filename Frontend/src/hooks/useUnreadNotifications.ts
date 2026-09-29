"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useUnreadNotifications(): number {
  const supabase = useMemo(() => createClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshCount(userId: string) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (!cancelled && !error) {
        setUnreadCount(count ?? 0);
      }
    }

    async function stopListening() {
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    }

    async function startListening(userId: string) {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      await stopListening();

      if (cancelled || generation !== generationRef.current) {
        return;
      }

      await refreshCount(userId);

      if (cancelled || generation !== generationRef.current) {
        return;
      }

      const channel = supabase
        .channel(`notifications-unread:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void refreshCount(userId);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void refreshCount(userId);
          },
        )
        .subscribe();

      if (cancelled || generation !== generationRef.current) {
        await supabase.removeChannel(channel);
        return;
      }

      channelRef.current = channel;
    }

    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (!user) {
        setUnreadCount(0);
        return;
      }

      await startListening(user.id);
    }

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        generationRef.current += 1;
        void stopListening();
        setUnreadCount(0);
        return;
      }

      if (event === "SIGNED_IN" && session?.user.id) {
        void startListening(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      generationRef.current += 1;
      subscription.unsubscribe();
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase]);

  return unreadCount;
}
