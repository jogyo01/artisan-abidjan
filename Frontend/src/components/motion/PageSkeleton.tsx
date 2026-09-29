type PageSkeletonProps = {
  label: string;
  variant?: "page" | "dashboard" | "list";
};

export function PageSkeleton({ label, variant = "page" }: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="flex w-full max-w-4xl flex-col gap-4" aria-busy="true" aria-live="polite">
        <p className="sr-only">{label}</p>
        <div className="aa-skeleton h-40 w-full rounded-[1.75rem]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="aa-skeleton h-24 rounded-2xl" />
          <div className="aa-skeleton h-24 rounded-2xl" />
          <div className="aa-skeleton h-24 rounded-2xl" />
          <div className="aa-skeleton h-24 rounded-2xl" />
        </div>
        <div className="aa-skeleton h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="flex w-full max-w-lg flex-col gap-3" aria-busy="true" aria-live="polite">
        <p className="sr-only">{label}</p>
        <div className="aa-skeleton h-24 w-full rounded-2xl" />
        <div className="aa-skeleton h-24 w-full rounded-2xl" />
        <div className="aa-skeleton h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-3" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="aa-skeleton h-3 w-24 rounded-full" />
      <div className="aa-skeleton h-8 w-3/5 rounded-full" />
      <div className="aa-skeleton h-36 w-full rounded-[1.5rem]" />
      <div className="aa-skeleton h-20 w-full rounded-2xl" />
    </div>
  );
}
