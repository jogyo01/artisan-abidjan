export const WEEK_DAYS = [
  { key: "lundi", label: "Lundi" },
  { key: "mardi", label: "Mardi" },
  { key: "mercredi", label: "Mercredi" },
  { key: "jeudi", label: "Jeudi" },
  { key: "vendredi", label: "Vendredi" },
  { key: "samedi", label: "Samedi" },
  { key: "dimanche", label: "Dimanche" },
] as const;

export type WeekDayKey = (typeof WEEK_DAYS)[number]["key"];

export type DayHours = {
  closed: boolean;
  open: string;
  close: string;
};

export type WeeklyHours = Record<WeekDayKey, DayHours>;

function emptyDay(): DayHours {
  return { closed: false, open: "08:00", close: "18:00" };
}

export function defaultWeeklyHours(): WeeklyHours {
  return {
    lundi: emptyDay(),
    mardi: emptyDay(),
    mercredi: emptyDay(),
    jeudi: emptyDay(),
    vendredi: emptyDay(),
    samedi: { closed: false, open: "08:00", close: "13:00" },
    dimanche: { closed: true, open: "08:00", close: "18:00" },
  };
}

export function parseWeeklyHours(value: unknown): WeeklyHours {
  const fallback = defaultWeeklyHours();
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const next = { ...fallback };

  for (const day of WEEK_DAYS) {
    const raw = record[day.key];
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    next[day.key] = {
      closed: entry.closed === true,
      open: typeof entry.open === "string" && entry.open !== "" ? entry.open : "08:00",
      close: typeof entry.close === "string" && entry.close !== "" ? entry.close : "18:00",
    };
  }

  return next;
}
