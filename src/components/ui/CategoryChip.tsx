import type { Category } from "@/lib/types";
import { UNCATEGORIZED_LABEL } from "@/lib/constants";

export function CategoryChip({ category }: { category: Category | null }) {
  const name = category ? category.name : UNCATEGORIZED_LABEL;
  const icon = category ? category.icon : "";
  const color = category ? category.color : "var(--border-strong)";
  return (
    <span className="chip">
      <span className="dot" style={{ background: color }} aria-hidden="true" />
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{name}</span>
    </span>
  );
}
