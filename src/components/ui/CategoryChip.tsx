import type { Category } from "@/lib/types";
import { UNCATEGORIZED_ICON } from "@/lib/constants";
import { categoryName } from "@/lib/categories";

export function CategoryChip({ category }: { category: Category | null }) {
  const name = categoryName(category?.id);
  const icon = category ? category.icon : UNCATEGORIZED_ICON;
  const color = category ? category.color : "var(--border-strong)";
  return (
    <span className="chip">
      <span className="dot" style={{ background: color }} aria-hidden="true" />
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{name}</span>
    </span>
  );
}
