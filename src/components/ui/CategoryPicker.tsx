import type { Category, RecordKind } from "@/lib/types";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_LABEL } from "@/lib/constants";
import { categoriesForKind } from "@/lib/categories";
import { Select } from "./Input";

export function CategoryPicker({
  value,
  onChange,
  kind = "expense",
  categories,
  includeUncategorized = true,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Which kind's categories to offer, flat. The list resets when the kind changes (see ExpenseForm). */
  kind?: RecordKind;
  categories?: Category[];
  includeUncategorized?: boolean;
  id?: string;
}) {
  const list = categories ?? categoriesForKind(kind);
  return (
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {includeUncategorized ? (
        <option value="">
          {UNCATEGORIZED_ICON} {UNCATEGORIZED_LABEL}
        </option>
      ) : null}
      {list.map((category) => (
        <option key={category.id} value={category.id}>
          {category.icon} {category.name}
        </option>
      ))}
    </Select>
  );
}
