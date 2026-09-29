"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mapNotificationRow, notificationKind, type NotificationItem } from "@/lib/notifications/map";
import { AnimatedList, AnimatedListItem, EmptyState, MotionAlert, PageSkeleton, ScaleIn } from "@/components/motion";

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

function mergeNotification(
  current: NotificationItem[],
  incoming: NotificationItem,
): NotificationItem[] {
  const existingIndex = current.findIndex((item) => item.id === incoming.id);
  if (existingIndex === -1) {
    return [incoming, ...current];
  }

  const next = [...current];
  next[existingIndex] = incoming;
  next.sort((left, right) => right.created_at.localeCompare(left.created_at));
  return next;
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [liveNotice, setLiveNotice] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);

  const loadNotifications = useCallback(
    async (currentUserId: string) => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, is_read, created_at")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      if (error) {
        return { notifications: [] as NotificationItem[], error: true };
      }

      return {
        error: false,
        notifications: (data ?? []).flatMap((row) => {
          const mapped = mapNotificationRow(row as Record<string, unknown>);
          return mapped ? [mapped] : [];
        }),
      };
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (userError || !user) {
        router.replace("/auth");
        return;
      }

      const result = await loadNotifications(user.id);
      if (cancelled) {
        return;
      }

      setUserId(user.id);
      if (result.error) {
        setErrorMessage("Impossible de charger les notifications.");
        setNotifications([]);
      } else {
        setNotifications(result.notifications);
      }

      setIsLoading(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadNotifications, router, supabase]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`notifications-list:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const mapped = mapNotificationRow((payload.new ?? {}) as Record<string, unknown>);
          if (!mapped) {
            return;
          }
          setLiveNotice(true);
          setNotifications((current) => mergeNotification(current, mapped));
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
        (payload) => {
          const mapped = mapNotificationRow((payload.new ?? {}) as Record<string, unknown>);
          if (!mapped) {
            return;
          }
          setNotifications((current) => mergeNotification(current, mapped));
        },
      )
      .subscribe((status) => {
        setIsRealtime(status === "SUBSCRIBED");
      });

    return () => {
      setIsRealtime(false);
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  async function markAsRead(notificationId: string) {
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    setUpdatingId(notificationId);
    setNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)),
    );

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        setErrorMessage("Impossible de marquer cette notification comme lue.");
        const result = await loadNotifications(user.id);
        if (!result.error) {
          setNotifications(result.notifications);
        }
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function markAllAsRead() {
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    setIsMarkingAll(true);
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    setLiveNotice(false);

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        setErrorMessage("Impossible de tout marquer comme lu.");
        const result = await loadNotifications(user.id);
        if (!result.error) {
          setNotifications(result.notifications);
        }
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsMarkingAll(false);
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des notifications…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-2xl aa-card p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
              Nouvelles demandes, changements de statut, messages, devis et paiements.
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--aa-ink-soft)]">
              {isRealtime
                ? "Notifications en temps réel"
                : "Les notifications se mettent à jour lors de vos actions."}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                void markAllAsRead();
              }}
              disabled={isMarkingAll}
              className="aa-btn aa-btn-ghost"
            >
              {isMarkingAll ? "Mise à jour…" : "Tout marquer comme lu"}
            </button>
          ) : null}
        </div>

        <ScaleIn show={Boolean(liveNotice)} className="mt-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Nouvelle notification
          </p>
        </ScaleIn>

        {errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-6" />
        ) : null}

        {!errorMessage && notifications.length === 0 ? (
          <EmptyState className="mt-8" title="Aucune notification">
            <p className="text-sm">
              Les demandes, messages, devis et paiements y apparaîtront.
            </p>
          </EmptyState>
        ) : null}

        {notifications.length > 0 ? (
          <AnimatedList className="mt-8 flex flex-col gap-3">
            {notifications.map((notification, index) => (
              <AnimatedListItem
                key={notification.id}
                index={index}
                className={`aa-card p-4 transition-[background-color,border-color] duration-200 ${
                  notification.is_read
                    ? ""
                    : "border-l-4 border-[var(--aa-terracotta)]"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[var(--aa-ink)]">
                        {notification.title}
                      </h2>
                      <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
                        {notificationKind(notification.title, notification.message)}
                      </span>
                      <span
                        className={`aa-chip ${
                          notification.is_read
                            ? "bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink-soft)]"
                            : "bg-[var(--aa-terracotta)] text-white"
                        }`}
                      >
                        {notification.is_read ? "Lue" : "Non lue"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--aa-ink)]">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-xs text-[var(--aa-ink-soft)]">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </div>
                  {notification.is_read ? null : (
                    <button
                      type="button"
                      disabled={updatingId === notification.id || isMarkingAll}
                      onClick={() => {
                        void markAsRead(notification.id);
                      }}
                      className="aa-btn aa-btn-primary shrink-0"
                    >
                      {updatingId === notification.id ? "Mise à jour…" : "Marquer comme lue"}
                    </button>
                  )}
                </div>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        ) : null}
      </main>
    </div>
  );
}
