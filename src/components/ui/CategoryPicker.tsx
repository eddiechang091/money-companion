import type { Category, RecordKind } from "@/lib/types";
import { CATEGORY_GROUPS, UNCATEGORIZED_LABEL } from "@/lib/constants";
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
  /** Which kind's groups to offer. The list resets when the kind changes (see ExpenseForm). */
  kind?: RecordKind;
  categories?: Category[];
  includeUncategorized?: boolean;
  id?: string;
}) {
  const list = categories ?? categoriesForKind(kind);
  const groups = CATEGORY_GROUPS.filter((group) => group.kind === kind);
  return (
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {includeUncategorized ? <option value="">{UNCATEGORIZED_LABEL}</option> : null}
      {groups.map((group) => {
        const items = list.filter((category) => category.groupId === group.id);
        if (items.length === 0) return null;
        return (
          <optgroup key={group.id} label={`${group.icon} ${group.name}`}>
            {items.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
