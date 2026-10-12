import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Expense } from "@/lib/types";
import { DEFAULT_CATEGORIES } from "@/lib/constants";
import { categoryLabel } from "@/lib/categories";
import { useProfile } from "@/services/profile/useProfile";
import { getExpenseRepository } from "@/services/expenses/repository";
import { awardBadge } from "@/features/gamification/awardBadges";
import {
  parseCsv,
  detectColumns,
  normalizeRows,
  type ColumnMapping,
  type CsvRow,
  type NormalizedRow,
} from "./csv";
import { scoreRows, type ScoredRow } from "./dedupe";
import { guessCategoryId } from "./guess";

type Step = "upload" | "review";

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "CNY", "HKD", "AUD", "JPY"];

export function ImportDialog({
  open,
  onClose,
  expenses,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  expenses: Expense[];
  onImported: () => void;
}) {
  const { notify } = useToast();
  const { profile } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [flipSign, setFlipSign] = useState(false);
  const [currency, setCurrency] = useState(profile.currency ?? "CAD");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Per-row overrides: rowKey -> categoryId | "skip"
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setStep("upload");
      setFileName("");
      setRows([]);
      setMapping(null);
      setFlipSign(false);
      setCurrency(profile.currency ?? "CAD");
      setError("");
      setImporting(false);
      setOverrides({});
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [open, onClose, profile.currency]);

  const normalized: NormalizedRow[] = useMemo(() => {
    if (!mapping || rows.length === 0) return [];
    return normalizeRows(rows, mapping, { positiveIsExpense: flipSign });
  }, [rows, mapping, flipSign]);

  const scored: ScoredRow[] = useMemo(() => scoreRows(normalized, expenses), [normalized, expenses]);

  const selectable = useMemo(
    () => scored.filter((s) => !s.row.isCredit && s.status === "new"),
    [scored]
  );
  const skippedIncome = scored.filter((s) => s.row.isCredit).length;
  const dupCount = scored.filter((s) => s.status === "duplicate").length;

  const isIncluded = (s: ScoredRow) => overrides[s.key] !== "skip";
  const categoryOf = (s: ScoredRow) =>
    overrides[s.key] && overrides[s.key] !== "skip"
      ? overrides[s.key]
      : (guessCategoryId(s.row.description) ?? "other");

  const includedCount = selectable.filter(isIncluded).length;

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseCsv(text);
        if (parsed.length < 2) {
          setError("Couldn't find any data rows in this file. Is it a bank CSV export?");
          return;
        }
        const detected = detectColumns(parsed);
        if (!detected) {
          setError("Couldn't recognize the columns. Make sure the CSV has a date, description and amount column.");
          return;
        }
        setFileName(file.name);
        setRows(parsed);
        setMapping(detected);
        setOverrides({});
        setStep("review");
      } catch {
        setError("Couldn't read this file. Try a CSV export from your bank.");
      }
    };
    reader.onerror = () => setError("Couldn't read this file.");
    reader.readAsText(file);
  }

  function setMappingCol(field: "date" | "description" | "amount" | "debit" | "credit", value: number) {
    setMapping((m) => (m ? { ...m, [field]: value } : m));
  }

  function columnOptions(): Array<{ value: number; label: string }> {
    const colCount = Math.max(0, ...rows.map((r) => r.length));
    return Array.from({ length: colCount }, (_, i) => ({
      value: i,
      label: mapping?.hasHeader ? `${mapping.header[i] ?? `Column ${i + 1}`} (#${i + 1})` : `Column ${i + 1}`,
    }));
  }

  async function handleImport() {
    const toImport = selectable.filter(isIncluded);
    if (toImport.length === 0) {
      notify("Nothing to import.", "error");
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: toImport.length });
    try {
      const repo = await getExpenseRepository();
      let done = 0;
      for (const s of toImport) {
        await repo.create({
          amount: Math.round(s.row.amount * 100) / 100,
          currency,
          categoryId: categoryOf(s),
          description: s.row.description,
          date: s.row.date,
          paymentMethod: "Bank import",
          notes: `Imported from ${fileName}`,
          source: "import",
          importKey: s.key,
        });
        done++;
        setProgress({ done, total: toImport.length });
      }
      notify(`Imported ${done} expense${done === 1 ? "" : "s"}.`);
      // Celebrate the first import immediately.
      if (done > 0) void awardBadge("first-import");
      onImported();
      onClose();
    } catch {
      notify("Import stopped early — some rows may not have been saved.", "error");
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;
  const cols = columnOptions();
  const usePair = (mapping?.debit ?? -1) >= 0;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import bank statement"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <p className="dialog-title">Import bank statement</p>

        {step === "upload" && (
          <div className="stack" style={{ margin: "12px 0", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Download a CSV statement from your bank (RBC, TD, Scotia, BMO and CIBC all
              offer this), then pick the file here. Amounts are imported as expenses;
              income rows are skipped.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose CSV file
            </Button>
            {error && <p style={{ fontSize: 13, color: "var(--danger, #c0392b)" }}>{error}</p>}
          </div>
        )}

        {step === "review" && mapping && (
          <div className="stack" style={{ margin: "12px 0", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {fileName} — {selectable.length} new, {dupCount} duplicate{dupCount === 1 ? "" : "s"} skipped
              {skippedIncome > 0 ? `, ${skippedIncome} income row${skippedIncome === 1 ? "" : "s"} skipped` : ""}.
              Check the column mapping below.
            </p>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Date
                <select
                  className="input"
                  value={mapping.date}
                  onChange={(e) => setMappingCol("date", Number(e.target.value))}
                  style={{ display: "block", marginTop: 4, minWidth: 120 }}
                >
                  {cols.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Description
                <select
                  className="input"
                  value={mapping.description}
                  onChange={(e) => setMappingCol("description", Number(e.target.value))}
                  style={{ display: "block", marginTop: 4, minWidth: 120 }}
                >
                  {cols.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              {usePair ? (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Debit (out)
                    <select
                      className="input"
                      value={mapping.debit}
                      onChange={(e) => setMappingCol("debit", Number(e.target.value))}
                      style={{ display: "block", marginTop: 4, minWidth: 110 }}
                    >
                      {cols.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Credit (in)
                    <select
                      className="input"
                      value={mapping.credit}
                      onChange={(e) => setMappingCol("credit", Number(e.target.value))}
                      style={{ display: "block", marginTop: 4, minWidth: 110 }}
                    >
                      {cols.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Amount
                    <select
                      className="input"
                      value={mapping.amount}
                      onChange={(e) => setMappingCol("amount", Number(e.target.value))}
                      style={{ display: "block", marginTop: 4, minWidth: 120 }}
                    >
                      {cols.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Sign
                    <select
                      className="input"
                      value={flipSign ? "pos" : "neg"}
                      onChange={(e) => setFlipSign(e.target.value === "pos")}
                      style={{ display: "block", marginTop: 4, minWidth: 130 }}
                    >
                      <option value="neg">Negative = expense</option>
                      <option value="pos">Positive = expense</option>
                    </select>
                  </label>
                </>
              )}
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Currency
                <select
                  className="input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ display: "block", marginTop: 4, minWidth: 90 }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "6px 8px" }}></th>
                    <th style={{ padding: "6px 8px" }}>Date</th>
                    <th style={{ padding: "6px 8px" }}>Description</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "6px 8px" }}>Category</th>
                    <th style={{ padding: "6px 8px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((s) => {
                    const disabled = s.row.isCredit || s.status === "duplicate";
                    const included = !disabled && isIncluded(s);
                    return (
                      <tr key={s.key} style={{ borderBottom: "1px solid var(--border)", opacity: disabled || !included ? 0.55 : 1 }}>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={disabled}
                            onChange={() =>
                              setOverrides((o) => ({ ...o, [s.key]: o[s.key] === "skip" ? "" : "skip" }))
                            }
                            aria-label={`Include ${s.row.description}`}
                          />
                        </td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{s.row.date}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.row.description}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {formatMoney(s.row.amount, currency)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {disabled ? (
                            <span style={{ color: "var(--text-muted)" }}>{categoryLabel(categoryOf(s))}</span>
                          ) : (
                            <select
                              className="input"
                              value={categoryOf(s)}
                              onChange={(e) => setOverrides((o) => ({ ...o, [s.key]: e.target.value }))}
                              style={{ fontSize: 12, padding: "2px 4px" }}
                              aria-label={`Category for ${s.row.description}`}
                            >
                              {DEFAULT_CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          {s.row.isCredit ? (
                            <span style={{ color: "var(--text-muted)" }}>income</span>
                          ) : s.status === "duplicate" ? (
                            <span style={{ color: "var(--warning, #b7791f)" }}>duplicate</span>
                          ) : (
                            <span style={{ color: "var(--success, #2e7d32)" }}>new</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && <p style={{ fontSize: 13, color: "var(--danger, #c0392b)" }}>{error}</p>}

            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={importing}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing || includedCount === 0}>
                {importing ? `Importing ${progress.done}/${progress.total}…` : `Import ${includedCount} expense${includedCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
