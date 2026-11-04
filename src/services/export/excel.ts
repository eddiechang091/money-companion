import * as XLSX from "xlsx";
import type { Expense } from "@/lib/types";
import { recordKind } from "@/lib/types";
import { sumByKind } from "@/lib/analytics";
import { categoryLabel } from "@/lib/categories";

export interface ExcelExportOptions {
  expenses: Expense[];
  /** e.g. "2026-10" — used in the filename. */
  monthKey: string;
  currency: string;
}

/** Export expenses and income as a .xlsx file and trigger download. */
export function exportExpensesExcel({ expenses, monthKey, currency }: ExcelExportOptions): void {
  const rows = expenses.map((e) => ({
    Date: e.date,
    Type: recordKind(e) === "income" ? "Income" : "Expense",
    Description: e.description || categoryLabel(e.categoryId),
    Category: categoryLabel(e.categoryId),
    Amount: e.amount,
    Currency: e.currency,
    "Payment Method": e.paymentMethod ?? "",
    Notes: e.notes ?? "",
    "Original Amount":
      e.originalAmount != null && e.originalCurrency ? `${e.originalAmount} ${e.originalCurrency}` : "",
    "FX Rate": e.fxRate ?? "",
  }));

  const totalOut = sumByKind(expenses, "expense");
  const totalIn = sumByKind(expenses, "income");
  const expenseCount = expenses.filter((e) => recordKind(e) === "expense").length;
  const incomeCount = expenses.length - expenseCount;

  const ws = XLSX.utils.json_to_sheet(rows);
  // Totals rows (the Amount column is 5th now that Type was added).
  const totals: Array<Array<string | number>> = [
    [`Total expenses (${expenseCount})`, "", "", "", totalOut, currency],
  ];
  if (incomeCount > 0) {
    totals.push([`Total income (${incomeCount})`, "", "", "", totalIn, currency]);
    totals.push(["Net", "", "", "", Math.round((totalIn - totalOut) * 100) / 100, currency]);
  }
  XLSX.utils.sheet_add_aoa(ws, totals, { origin: -1 });
  ws["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 28 },
    { wch: 14 },
    { wch: 12 },
    { wch: 9 },
    { wch: 14 },
    { wch: 36 },
    { wch: 16 },
    { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  XLSX.writeFile(wb, `money-companion-${monthKey}.xlsx`);
}
