"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { createClient } from "@/lib/supabase/client";

type AdminCategory = {
  id: string;
  name: string;
  description: string;
  usageCount: number;
};

const inputClassName = "aa-input";

export default function AdminCategoriesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [sqlHint, setSqlHint] = useState(false);

  const loadCategories = useCallback(async () => {
    const [{ data, error }, linksResult] = await Promise.all([
      supabase.from("categories").select("id, name, description").order("name"),
      supabase.from("artisan_categories").select("category_id"),
    ]);

    if (error) {
      const fallback = await supabase.from("categories").select("id, name").order("name");
      if (fallback.error) {
        return { categories: [] as AdminCategory[], error: true };
      }
      return mapCategories(fallback.data ?? [], linksResult.data ?? []);
    }

    return mapCategories(data ?? [], linksResult.data ?? []);
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

      const result = await loadCategories();
      if (cancelled) {
        return;
      }
      if (result.error) {
        setErrorMessage("Impossible de charger les catégories.");
        setCategories([]);
      } else {
        setCategories(result.categories);
      }
      setIsLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadCategories, router, supabase]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setSqlHint(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Veuillez renseigner un nom de catégorie.");
      return;
    }

    const session = await requireAdminSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setIsSaving(true);
    try {
      const payload: { name: string; description?: string | null } = { name: trimmedName };
      const trimmedDescription = description.trim();
      if (trimmedDescription !== "") {
        payload.description = trimmedDescription;
      }

      const { error } = await supabase.from("categories").insert(payload);
      if (error) {
        setErrorMessage("Impossible d'ajouter la catégorie.");
        setSqlHint(true);
        return;
      }

      setName("");
      setDescription("");
      setSuccessMessage("Catégorie ajoutée.");
      const result = await loadCategories();
      if (!result.error) {
        setCategories(result.categories);
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate(categoryId: string) {
    setErrorMessage("");
    setSuccessMessage("");
    setSqlHint(false);

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setErrorMessage("Le nom ne peut pas être vide.");
      return;
    }

    const session = await requireAdminSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("categories")
        .update({
          name: trimmedName,
          description: editDescription.trim() === "" ? null : editDescription.trim(),
        })
        .eq("id", categoryId);

      if (error) {
        setErrorMessage("Impossible de modifier cette catégorie.");
        setSqlHint(true);
        return;
      }

      setEditingId(null);
      setSuccessMessage("Catégorie mise à jour.");
      const result = await loadCategories();
      if (!result.error) {
        setCategories(result.categories);
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(category: AdminCategory) {
    setErrorMessage("");
    setSuccessMessage("");
    setSqlHint(false);

    if (category.usageCount > 0) {
      setErrorMessage(
        "Cette catégorie est encore liée à des artisans. Retirez d'abord les liaisons avant de la supprimer.",
      );
      return;
    }

    const confirmed = window.confirm(`Supprimer la catégorie « ${category.name} » ?`);
    if (!confirmed) {
      return;
    }

    const session = await requireAdminSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setDeletingId(category.id);
    try {
      const { error } = await supabase.from("categories").delete().eq("id", category.id);
      if (error) {
        setErrorMessage(
          "Suppression refusée. Une contrainte de clé étrangère ou une policy SQL empêche cette action.",
        );
        setSqlHint(true);
        return;
      }
      setSuccessMessage("Catégorie supprimée.");
      const result = await loadCategories();
      if (!result.error) {
        setCategories(result.categories);
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des catégories…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-3xl aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-[var(--aa-ink)]">Catégories</h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Ajoutez ou renommez un métier. Une catégorie utilisée ne peut pas être supprimée.
        </p>
        <AdminSectionNav current="/admin/categories" />

        <form className="mt-8 flex flex-col gap-3" onSubmit={handleCreate}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Nom
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClassName}
              placeholder="Ex. Plombier"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Description (optionnelle)
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-20`}
            />
          </label>
          <button
            type="submit"
            disabled={isSaving}
            className="aa-btn aa-btn-primary"
          >
            {isSaving ? "Enregistrement…" : "Ajouter la catégorie"}
          </button>
        </form>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {successMessage}
          </p>
        ) : null}
        {sqlHint ? (
          <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">
            Si l&apos;action est bloquée, exécutez le script SQL fourni dans{" "}
            <code>Base de données/admin_space.sql</code> sans supprimer les policies existantes.
          </p>
        ) : null}

        {categories.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--aa-ink-soft)]">
            Aucune catégorie. Ajoutez un métier avec le formulaire ci-dessus.
          </p>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {categories.map((category) => (
              <li
                key={category.id}
                className="aa-card p-4"
              >
                {editingId === category.id ? (
                  <div className="flex flex-col gap-3">
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className={inputClassName}
                    />
                    <textarea
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      className={`${inputClassName} min-h-20`}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          void handleUpdate(category.id);
                        }}
                        className="aa-btn aa-btn-primary"
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="aa-btn aa-btn-ghost"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-[var(--aa-ink)]">{category.name}</p>
                      {category.description ? (
                        <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
                          {category.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-[var(--aa-ink-soft)]">
                        {category.usageCount} artisan{category.usageCount > 1 ? "s" : ""} lié
                        {category.usageCount > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditName(category.name);
                          setEditDescription(category.description);
                        }}
                        className="aa-btn aa-btn-ghost"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === category.id}
                        onClick={() => {
                          void handleDelete(category);
                        }}
                        className="aa-btn aa-btn-danger"
                      >
                        {deletingId === category.id ? "Suppression…" : "Supprimer"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function mapCategories(
  rows: { id?: unknown; name?: unknown; description?: unknown }[],
  links: { category_id?: unknown }[],
): { categories: AdminCategory[]; error: false } {
  const usage = new Map<string, number>();
  for (const row of links) {
    const id = typeof row.category_id === "string" ? row.category_id : bookingIdToString(row.category_id);
    if (!id) {
      continue;
    }
    usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  return {
    error: false,
    categories: rows.flatMap((row) => {
      const id = typeof row.id === "string" ? row.id : bookingIdToString(row.id);
      if (!id || typeof row.name !== "string") {
        return [];
      }
      return [
        {
          id,
          name: row.name,
          description: typeof row.description === "string" ? row.description : "",
          usageCount: usage.get(id) ?? 0,
        } satisfies AdminCategory,
      ];
    }),
  };
}
