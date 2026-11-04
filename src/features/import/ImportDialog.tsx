import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Expense } from "@/lib/types";
import { UNCATEGORIZED_LABEL } from "@/lib/constants";
import { categoriesForKind, categoryLabel } from "@/lib/categories";
import { useProfile } from "@/services/profile/useProfile";
import { getExpenseRepository } from "@/services/expenses/repository";
import { awardBadge } from "@/features/gamification/awardBadges";
import {
  parseCsv,
  sniffDelimiter,
  decodeFileBytes,
  findHeaderRow,
  detectColumns,
  detectColumnsByHeader,
  normalizeRows,
  isWealthsimpleExport,
  normalizeWealthsimpleRows,
  type ColumnMapping,
  type CsvRow,
  type NormalizedRow,
} from "./csv";
import { detectPreset, type Preset } from "./presets";
import { looksLikeWorkbook, readWorkbookSheets } from "./workbook";
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

const REVIEW_PAGE_SIZE = 20;

function statusLabel(s: ScoredRow): string {
  if (s.status === "duplicate") return "duplicate";
  return s.row.isCredit ? "income" : "new";
}

function statusClassName(s: ScoredRow): string {
  return s.status === "duplicate" ? "import-status import-status--duplicate" : "import-status";
}

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
  const [preset, setPreset] = useState<Preset | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [flipSign, setFlipSign] = useState(false);
  const [currency, setCurrency] = useState(profile.currency ?? "CAD");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Per-row overrides: rowKey -> categoryId | "skip"
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (open) {
      setStep("upload");
      setFileName("");
      setRows([]);
      setMapping(null);
      setPreset(null);
      setSourceLabel("");
      setFlipSign(false);
      setCurrency(profile.currency ?? "CAD");
      setError("");
      setImporting(false);
      setOverrides({});
      setPage(0);
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [open, onClose, profile.currency]);

  const normalized: NormalizedRow[] = useMemo(() => {
    if (rows.length === 0) return [];
    // Wealthsimple exports get dedicated parsing (sub-type aware).
    if (isWealthsimpleExport(rows)) return normalizeWealthsimpleRows(rows);
    // Named expense-app presets (YNAB, Mint, Monarch, Copilot, 钱迹, 随手记).
    if (preset) return preset.normalize(rows);
    if (!mapping) return [];
    return normalizeRows(rows, mapping, { positiveIsExpense: flipSign });
  }, [rows, mapping, flipSign, preset]);

  const scored: ScoredRow[] = useMemo(() => scoreRows(normalized, expenses), [normalized, expenses]);

  const selectable = useMemo(
    () => scored.filter((s) => s.status === "new"),
    [scored]
  );
  const incomeCount = scored.filter((s) => s.row.isCredit && s.status === "new").length;
  const dupCount = scored.filter((s) => s.status === "duplicate").length;

  const isIncluded = (s: ScoredRow) => overrides[s.key] !== "skip";
  const categoryOf = (s: ScoredRow): string => {
    const override = overrides[s.key];
    if (override !== undefined && override !== "skip") return override;
    return (
      s.row.categoryHint ??
      guessCategoryId(s.row.description, s.row.isCredit ? "income" : "expense") ??
      ""
    );
  };

  const includedCount = selectable.filter(isIncluded).length;

  interface Analyzed {
    rows: CsvRow[];
    mapping: ColumnMapping | null;
    preset: Preset | null;
    sourceLabel: string;
  }

  /** Try to make sense of one candidate table (one CSV file or one sheet). */
  function analyzeRows(parsed: CsvRow[]): Analyzed | null {
    if (parsed.length < 2) return null;
    // Strip preamble/title rows before the header (e.g. 随手记 exports).
    const headerIdx = findHeaderRow(parsed);
    const rows = headerIdx > 0 ? parsed.slice(headerIdx) : parsed;
    if (rows.length < 2) return null;
    if (isWealthsimpleExport(rows)) {
      if (normalizeWealthsimpleRows(rows).length === 0) return null;
      return { rows, mapping: null, preset: null, sourceLabel: "Wealthsimple" };
    }
    const detectedPreset = detectPreset(rows);
    if (detectedPreset) {
      if (detectedPreset.normalize(rows).length === 0) return null;
      return { rows, mapping: null, preset: detectedPreset, sourceLabel: detectedPreset.name };
    }
    const byHeader = detectColumnsByHeader(rows);
    if (byHeader && normalizeRows(rows, byHeader).length > 0) {
      return { rows, mapping: byHeader, preset: null, sourceLabel: "CSV" };
    }
    const detected = detectColumns(rows);
    if (!detected || normalizeRows(rows, detected).length === 0) return null;
    return { rows, mapping: detected, preset: null, sourceLabel: "Bank CSV" };
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    void file
      .arrayBuffer()
      .then((buf) => {
        try {
          const candidates: CsvRow[][] = [];
          if (looksLikeWorkbook(file.name, buf)) {
            const sheets = readWorkbookSheets(buf);
            if (sheets.length === 0) {
              setError("Couldn't find any data in this spreadsheet.");
              return;
            }
            candidates.push(...sheets);
          } else {
            const text = decodeFileBytes(buf);
            candidates.push(parseCsv(text, sniffDelimiter(text)));
          }
          for (const parsed of candidates) {
            const analyzed = analyzeRows(parsed);
            if (analyzed) {
              setFileName(file.name);
              setRows(analyzed.rows);
              setMapping(analyzed.mapping);
              setPreset(analyzed.preset);
              setSourceLabel(analyzed.sourceLabel);
              setOverrides({});
              setPage(0);
              setStep("review");
              return;
            }
          }
          setError(
            "Couldn't recognize the columns. Make sure the file has a date, description and amount column."
          );
        } catch {
          setError("Couldn't read this file. Try a CSV or Excel export from your bank or expense app.");
        }
      })
      .catch(() => setError("Couldn't read this file."));
  }

  function setMappingCol(
    field: "date" | "description" | "amount" | "debit" | "credit" | "outflow" | "inflow",
    value: number
  ) {
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
          kind: s.row.isCredit ? "income" : "expense",
          amount: Math.round(s.row.amount * 100) / 100,
          currency,
          categoryId: categoryOf(s) || null,
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
      const importedIncome = toImport.slice(0, done).filter((s) => s.row.isCredit).length;
      notify(
        importedIncome > 0
          ? `Imported ${done} entries (${importedIncome} income).`
          : `Imported ${done} expense${done === 1 ? "" : "s"}.`
      );
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

  const pageCount = Math.max(1, Math.ceil(scored.length / REVIEW_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * REVIEW_PAGE_SIZE;
  const pageRows = scored.slice(pageStart, pageStart + REVIEW_PAGE_SIZE);
  const pageEnd = Math.min(scored.length, pageStart + REVIEW_PAGE_SIZE);

  if (!open) return null;
  const cols = columnOptions();
  const useDebitPair = (mapping?.debit ?? -1) >= 0;
  const useOutflowPair = (mapping?.outflow ?? -1) >= 0 && (mapping?.inflow ?? -1) >= 0;
  const usePair = useDebitPair || useOutflowPair;
  // The Sign flip only applies to a single signed-amount column with no
  // explicit direction column (presets and direction columns decide themselves).
  const showSign =
    !!mapping && mapping.amount >= 0 && !usePair && mapping.direction < 0;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import expenses"
        onClick={(event) => event.stopPropagation()}
      >

        {step === "upload" && (
          <div className="import-dialog__pad">
            <p className="dialog-title">Import expenses</p>
            <div className="stack" style={{ margin: "12px 0", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Download a CSV or Excel export from your bank or expense app (YNAB, Mint,
              Monarch, Copilot, 钱迹, 随手记, Wealthsimple, RBC, TD, Scotia, BMO, CIBC),
              then pick the file here. Expenses and income are both imported —
              income rows are marked as money in. Review every row before importing.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose CSV or Excel file
            </Button>
            {error && <p style={{ fontSize: 13, color: "var(--danger, #c0392b)" }}>{error}</p>}
            </div>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="import-dialog__header">
              <p className="dialog-title">Import expenses</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                {fileName}
                {sourceLabel ? ` — detected ${sourceLabel} format` : ""} — {selectable.length} new
                {incomeCount > 0 ? ` (${incomeCount} income)` : ""}, {dupCount} duplicate{dupCount === 1 ? "" : "s"} skipped.
                {mapping ? " Check the column mapping below." : " Columns were mapped automatically."}
              </p>

              {mapping && (
                <div className="import-mapping" style={{ marginTop: 12 }}>
                  <label>
                    Date
                    <select
                      className="input"
                      value={mapping.date}
                      onChange={(e) => setMappingCol("date", Number(e.target.value))}
                    >
                      {cols.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Description
                    <select
                      className="input"
                      value={mapping.description}
                      onChange={(e) => setMappingCol("description", Number(e.target.value))}
                    >
                      {cols.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  {usePair ? (
                    <>
                      <label>
                        Debit (out)
                        <select
                          className="input"
                          value={useDebitPair ? mapping.debit : mapping.outflow}
                          onChange={(e) =>
                            setMappingCol(useDebitPair ? "debit" : "outflow", Number(e.target.value))
                          }
                        >
                          {cols.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Credit (in)
                        <select
                          className="input"
                          value={useDebitPair ? mapping.credit : mapping.inflow}
                          onChange={(e) =>
                            setMappingCol(useDebitPair ? "credit" : "inflow", Number(e.target.value))
                          }
                        >
                          {cols.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Amount
                        <select
                          className="input"
                          value={mapping.amount}
                          onChange={(e) => setMappingCol("amount", Number(e.target.value))}
                        >
                          {cols.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </label>
                      {showSign && (
                        <label>
                          Sign
                          <select
                            className="input"
                            value={flipSign ? "pos" : "neg"}
                            onChange={(e) => setFlipSign(e.target.value === "pos")}
                          >
                            <option value="neg">Negative = expense</option>
                            <option value="pos">Positive = expense</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  <label>
                    Currency
                    <select
                      className="input"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="import-dialog__body">
              <div className="import-table-scroll">
                <table className="import-table">
                  <colgroup>
                    <col className="col-check" />
                    <col className="col-date" />
                    <col />
                    <col className="col-amount" />
                    <col className="col-category" />
                    <col className="col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Date</th>
                      <th>Description</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Category</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((s) => {
                      const disabled = s.status === "duplicate";
                      const included = !disabled && isIncluded(s);
                      const rowKind = s.row.isCredit ? "income" : "expense";
                      return (
                        <tr key={s.key} className={disabled || !included ? "is-dim" : undefined}>
                          <td>
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
                          <td style={{ whiteSpace: "nowrap" }}>{s.row.date}</td>
                          <td className="desc">{s.row.description}</td>
                          <td className="amount">{formatMoney(s.row.amount, currency)}</td>
                          <td>
                            {disabled ? (
                              <span style={{ color: "var(--text-muted)" }}>{categoryLabel(categoryOf(s))}</span>
                            ) : (
                              <select
                                className="input"
                                value={categoryOf(s)}
                                onChange={(e) => setOverrides((o) => ({ ...o, [s.key]: e.target.value }))}
                                aria-label={`Category for ${s.row.description}`}
                              >
                                <option value="">{UNCATEGORIZED_LABEL}</option>
                                {categoriesForKind(rowKind).map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span className={statusClassName(s)}>{statusLabel(s)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="import-cards">
                {pageRows.map((s) => {
                  const disabled = s.status === "duplicate";
                  const included = !disabled && isIncluded(s);
                  const rowKind = s.row.isCredit ? "income" : "expense";
                  return (
                    <div key={s.key} className={`import-card${disabled || !included ? " is-dim" : ""}`}>
                      <div className="import-card__top">
                        <span className="import-card__desc">{s.row.description}</span>
                        <span className="import-card__amount">{formatMoney(s.row.amount, currency)}</span>
                      </div>
                      <div className="import-card__meta">
                        <span>{s.row.date}</span>
                        <span className={statusClassName(s)}>{statusLabel(s)}</span>
                      </div>
                      {disabled ? (
                        <p className="import-card__category-text">{categoryLabel(categoryOf(s))}</p>
                      ) : (
                        <select
                          className="input"
                          value={categoryOf(s)}
                          onChange={(e) => setOverrides((o) => ({ ...o, [s.key]: e.target.value }))}
                          aria-label={`Category for ${s.row.description}`}
                        >
                          <option value="">{UNCATEGORIZED_LABEL}</option>
                          {categoriesForKind(rowKind).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                      <label className="import-card__include">
                        <input
                          type="checkbox"
                          checked={included}
                          disabled={disabled}
                          onChange={() =>
                            setOverrides((o) => ({ ...o, [s.key]: o[s.key] === "skip" ? "" : "skip" }))
                          }
                        />
                        Include in import
                      </label>
                    </div>
                  );
                })}
              </div>

              {pageCount > 1 && (
                <div className="import-pager">
                  <span>
                    Showing {pageStart + 1}–{pageEnd} of {scored.length}
                  </span>
                  <span>
                    Page {safePage + 1} of {pageCount}
                  </span>
                  <div className="import-pager__buttons">
                    <Button variant="ghost" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
                      Previous
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setPage(safePage + 1)}
                      disabled={safePage >= pageCount - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {error && <p style={{ fontSize: 13, color: "var(--danger, #c0392b)" }}>{error}</p>}
            </div>

            <div className="import-dialog__footer">
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={importing}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing || includedCount === 0}>
                {importing ? `Importing ${progress.done}/${progress.total}…` : `Import ${includedCount} expense${includedCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
