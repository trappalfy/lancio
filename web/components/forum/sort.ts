import type { ForumSort } from "@/db/types";

export const SORT_ITEMS: readonly { value: ForumSort; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
];

export const parseSort = (s: string | string[] | undefined): ForumSort => (s === "new" || s === "top" ? s : "hot");

/** Link-tab items for URL-driven sorting (`?sort=`); Hot is the bare path. */
export const sortLinks = (base: string, active: ForumSort) =>
  SORT_ITEMS.map((i) => ({ href: i.value === "hot" ? base : `${base}?sort=${i.value}`, label: i.label, active: i.value === active }));
