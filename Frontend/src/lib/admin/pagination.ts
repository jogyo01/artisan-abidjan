export const ADMIN_PAGE_SIZE = 20;

export function paginate<T>(items: T[], page: number): { pageItems: T[]; pageCount: number; page: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * ADMIN_PAGE_SIZE;
  return {
    page: safePage,
    pageCount,
    pageItems: items.slice(start, start + ADMIN_PAGE_SIZE),
  };
}
