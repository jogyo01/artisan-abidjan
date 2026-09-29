"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { formatAdminDateTime, isUserRole, ROLE_LABELS, type UserRole } from "@/lib/admin/labels";
import { paginate } from "@/lib/admin/pagination";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";

type AdminUser = {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  created_at: string;
};

type RoleFilter = "all" | UserRole;

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return { users: [] as AdminUser[], error: true };
    }

    return {
      error: false,
      users: (data ?? []).flatMap((row) => {
        if (typeof row.id !== "string" || typeof row.role !== "string" || !isUserRole(row.role)) {
          return [];
        }
        return [
          {
            id: row.id,
            full_name:
              typeof row.full_name === "string" && row.full_name.trim() !== ""
                ? row.full_name
                : "Sans nom",
            phone: typeof row.phone === "string" ? row.phone : "",
            role: row.role,
            created_at: String(row.created_at ?? ""),
          } satisfies AdminUser,
        ];
      }),
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const session = await requireAdminSession(supabase);
      if (cancelled) {
        return;
      }
      if (session.kind === "unauthenticated") {
        router.replace("/auth");
        return;
      }
      if (session.kind === "forbidden") {
        router.replace("/");
        return;
      }

      const result = await loadUsers();
      if (cancelled) {
        return;
      }
      if (result.error) {
        setErrorMessage("Impossible de charger les utilisateurs.");
        setUsers([]);
      } else {
        setUsers(result.users);
      }
      setIsLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadUsers, router, supabase]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (filter !== "all" && user.role !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        user.full_name.toLowerCase().includes(query) || user.phone.toLowerCase().includes(query)
      );
    });
  }, [filter, search, users]);

  const { pageItems, pageCount, page: safePage } = paginate(visible, page);

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des utilisateurs…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-5xl aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-[var(--aa-ink)]">Utilisateurs</h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Consultation des profils. Les rôles ne sont pas modifiables depuis cette page.
        </p>
        <AdminSectionNav current="/admin/users" />

        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par nom ou téléphone"
            className="aa-input"
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tous"],
                ["CLIENT", ROLE_LABELS.CLIENT],
                ["ARTISAN", ROLE_LABELS.ARTISAN],
                ["ADMIN", ROLE_LABELS.ADMIN],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`aa-filter ${filter === value ? "aa-filter-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!errorMessage && visible.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--aa-ink-soft)]">
            {users.length === 0
              ? "Aucun utilisateur enregistré pour le moment."
              : "Aucun utilisateur ne correspond à votre recherche ou au filtre."}
          </p>
        ) : null}

        {pageItems.length > 0 ? (
          <>
            <ul className="mt-8 hidden divide-y divide-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] md:block">
              <li className="grid grid-cols-4 gap-3 bg-[color-mix(in_srgb,var(--aa-sand)_58%,transparent)] px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--aa-ink-soft)]">
                <span>Nom</span>
                <span>Téléphone</span>
                <span>Rôle</span>
                <span>Création</span>
              </li>
              {pageItems.map((user) => (
                <li
                  key={user.id}
                  className="grid grid-cols-4 gap-3 px-4 py-3 text-sm text-[var(--aa-ink)]"
                >
                  <span className="font-medium text-[var(--aa-ink)]">{user.full_name}</span>
                  <span>{user.phone || "—"}</span>
                  <span>{ROLE_LABELS[user.role]}</span>
                  <span>{formatAdminDateTime(user.created_at)}</span>
                </li>
              ))}
            </ul>

            <ul className="mt-8 flex flex-col gap-3 md:hidden">
              {pageItems.map((user) => (
                <li
                  key={user.id}
                  className="aa-card p-4 text-sm"
                >
                  <p className="font-semibold text-[var(--aa-ink)]">{user.full_name}</p>
                  <p className="mt-1 text-[var(--aa-ink)]">{ROLE_LABELS[user.role]}</p>
                  <p className="mt-1 text-[var(--aa-ink-soft)]">Tél. {user.phone || "—"}</p>
                  <p className="mt-1 text-[var(--aa-ink-soft)]">
                    {formatAdminDateTime(user.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {pageCount > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="aa-btn aa-btn-ghost"
            >
              Précédent
            </button>
            <p className="text-sm text-[var(--aa-ink-soft)]">
              Page {safePage} / {pageCount}
            </p>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="aa-btn aa-btn-ghost"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
