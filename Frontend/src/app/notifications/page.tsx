"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

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

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNotifications = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, is_read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return { notifications: [] as NotificationItem[], error: true };
      }

      return {
        error: false,
        notifications: (data ?? []).flatMap((row) => {
          if (typeof row.id !== "string" || typeof row.title !== "string") {
            return [];
          }

          return [
            {
              id: row.id,
              title: row.title,
              message: typeof row.message === "string" ? row.message : "",
              is_read: row.is_read === true,
              created_at: String(row.created_at ?? ""),
            } satisfies NotificationItem,
          ];
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

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        setErrorMessage("Impossible de marquer cette notification comme lue.");
        return;
      }

      const result = await loadNotifications(user.id);
      if (result.error) {
        setErrorMessage("La notification a été mise à jour, mais la liste n'a pas pu être rechargée.");
      } else {
        setNotifications(result.notifications);
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

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        setErrorMessage("Impossible de tout marquer comme lu.");
        return;
      }

      const result = await loadNotifications(user.id);
      if (result.error) {
        setErrorMessage("Les notifications ont été mises à jour, mais la liste n'a pas pu être rechargée.");
      } else {
        setNotifications(result.notifications);
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
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement des notifications…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Consultez les alertes liées à votre compte.
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                void markAllAsRead();
              }}
              disabled={isMarkingAll}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {isMarkingAll ? "Mise à jour…" : "Tout marquer comme lu"}
            </button>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!errorMessage && notifications.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Vous n&apos;avez aucune notification.
          </p>
        ) : null}

        {notifications.length > 0 ? (
          <ul className="mt-8 flex flex-col gap-3">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={`rounded-xl border p-4 ${
                  notification.is_read
                    ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    : "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
                        {notification.title}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          notification.is_read
                            ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            : "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                        }`}
                      >
                        {notification.is_read ? "Lue" : "Non lue"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
                      className="shrink-0 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      {updatingId === notification.id ? "Mise à jour…" : "Marquer comme lue"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
