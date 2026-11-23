import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Expense } from "@/lib/types";
import { categoriesForKind, categoryLabel, categoryName } from "@/lib/categories";
import { useLanguage } from "@/lib/i18n";
import { getIntlLocale } from "@/lib/utils";
import { useProfile } from "@/services/profile/useProfile";
import { getExpenseRepository } from "@/services/expenses/repository";
import { awardBadge, refreshBadges } from "@/features/gamification/awardBadges";
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
import { getLlmService } from "@/services/anna/llm";
import { guessCategoryId } from "./guess";
import { suggestCategories, suggestionKey, type SuggestItem } from "./suggest";

type Step = "upload" | "review";

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(getIntlLocale(), { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "CNY", "HKD", "AUD", "JPY"];

const REVIEW_PAGE_SIZE = 20;

function statusLabel(s: ScoredRow, t: (key: string) => string): string {
  if (s.status === "duplicate") return t("import.statusDuplicate");
  return s.row.isCredit ? t("import.statusIncome") : t("import.statusNew");
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
  const { t } = useLanguage();
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
  // AI-suggested categories, keyed by kind + description. Advisory only:
  // a manual override always wins, and the user reviews every row.
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [suggesting, setSuggesting] = useState(false);

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
      setSuggestions({});
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
    const kind = s.row.isCredit ? "income" : "expense";
    return (
      suggestions[suggestionKey(s.row.description, kind)] ??
      s.row.categoryHint ??
      guessCategoryId(s.row.description, kind) ??
      ""
    );
  };

  // Distinct descriptions still sitting on Others — the only ones ever
  // sent to the AI, and only when the user taps Suggest categories.
  const suggestTargets: SuggestItem[] = useMemo(() => {
    const seen = new Set<string>();
    const items: SuggestItem[] = [];
    for (const s of selectable) {
      const override = overrides[s.key];
      if (override !== undefined && override !== "skip") continue;
      const kind = s.row.isCredit ? "income" : "expense";
      const base =
        s.row.categoryHint ?? guessCategoryId(s.row.description, kind) ?? "";
      if (base) continue;
      const key = suggestionKey(s.row.description, kind);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ description: s.row.description, kind });
    }
    return items;
  }, [selectable, overrides]);

  async function handleSuggest() {
    if (suggestTargets.length === 0 || suggesting) return;
    setSuggesting(true);
    try {
      const llm = await getLlmService();
      if (!llm.available) {
        notify(t("import.aiUnavailable"), "error");
        return;
      }
      const map = await suggestCategories(suggestTargets, (req) => llm.complete(req));
      const count = Object.keys(map).length;
      setSuggestions(map);
      notify(
        count > 0
          ? t("import.suggestedFor", { count })
          : t("import.noConfident")
      );
    } catch {
      notify(t("import.aiFailed"), "error");
    } finally {
      setSuggesting(false);
    }
  }

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
              setError(t("import.noData"));
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
              setSuggestions({});
              setPage(0);
              setStep("review");
              return;
            }
          }
          setError(t("import.badColumns"));
        } catch {
          setError(t("import.unreadableLong"));
        }
      })
      .catch(() => setError(t("import.unreadable")));
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
      label: mapping?.hasHeader ? `${mapping.header[i] ?? t("import.column", { n: i + 1 })} (#${i + 1})` : t("import.column", { n: i + 1 }),
    }));
  }

  async function handleImport() {
    const toImport = selectable.filter(isIncluded);
    if (toImport.length === 0) {
      notify(t("import.nothing"), "error");
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
          notes: t("import.importedFrom", { fileName }),
          source: "import",
          importKey: s.key,
        });
        done++;
        setProgress({ done, total: toImport.length });
      }
      const importedIncome = toImport.slice(0, done).filter((s) => s.row.isCredit).length;
      notify(
        importedIncome > 0
          ? t("import.importedEntries", { done, income: importedIncome })
          : t("import.importedExpenses", { count: done })
      );
      // Celebrate the first import immediately, then sweep state-derived
      // badges (first expense/income, months, streaks, counts) so everything
      // the imported data earns celebrates right after it. Without the sweep,
      // those badges only appeared when the profile page ran its mount-time
      // refresh. Awaited in sequence: both calls share the unlocked-badge
      // store, so firing them concurrently could lose one side's persist —
      // and sequencing keeps the import badge first in the celebration queue.
      if (done > 0) {
        await awardBadge("first-import");
        await refreshBadges();
      }
      onImported();
      onClose();
    } catch {
      notify(t("import.stoppedEarly"), "error");
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
        aria-label={t("import.title")}
        onClick={(event) => event.stopPropagation()}
      >

        {step === "upload" && (
          <div className="import-dialog__pad">
            <p className="dialog-title">{t("import.title")}</p>
            <div className="stack" style={{ margin: "12px 0", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {t("import.uploadIntro")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {t("import.chooseFile")}
            </Button>
            {error && <p style={{ fontSize: 13, color: "var(--danger, #c0392b)" }}>{error}</p>}
            </div>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="import-dialog__header">
              <p className="dialog-title">{t("import.title")}</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                {fileName}
                {sourceLabel ? t("import.detectedFormat", { source: sourceLabel }) : ""} — {t("import.newRows", { count: selectable.length })}
                {incomeCount > 0 ? ` ${t("import.incomeCount", { count: incomeCount })}` : ""}, {t("import.duplicatesSkipped", { count: dupCount })}.
                {mapping ? ` ${t("import.checkMapping")}` : ` ${t("import.mappedAuto")}`}
              </p>

              {mapping && (
                <div className="import-mapping" style={{ marginTop: 12 }}>
                  <label>
                    {t("common.date")}
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
                    {t("common.description")}
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
                        {t("import.debitOut")}
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
                        {t("import.creditIn")}
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
                        {t("common.amount")}
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
                          {t("import.sign")}
                          <select
                            className="input"
                            value={flipSign ? "pos" : "neg"}
                            onChange={(e) => setFlipSign(e.target.value === "pos")}
                          >
                            <option value="neg">{t("import.negativeExpense")}</option>
                            <option value="pos">{t("import.positiveExpense")}</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  <label>
                    {t("import.currency")}
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

              <div className="import-suggest">
                <Button
                  variant="secondary"
                  onClick={handleSuggest}
                  disabled={suggesting || suggestTargets.length === 0}
                >
                  {suggesting
                    ? t("import.suggesting")
                    : `${t("import.suggestCategories")}${suggestTargets.length > 0 ? ` (${suggestTargets.length})` : ""}`}
                </Button>
                <p>
                  {t("import.suggestNote")}
                </p>
              </div>
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
                      <th>{t("common.date")}</th>
                      <th>{t("common.description")}</th>
                      <th style={{ textAlign: "right" }}>{t("common.amount")}</th>
                      <th>{t("common.category")}</th>
                      <th>{t("common.status")}</th>
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
                              aria-label={t("import.include", { desc: s.row.description })}
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
                                aria-label={t("import.categoryFor", { desc: s.row.description })}
                              >
                                <option value="">{categoryName(null)}</option>
                                {categoriesForKind(rowKind).map((c) => (
                                  <option key={c.id} value={c.id}>{categoryName(c.id)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span className={statusClassName(s)}>{statusLabel(s, t)}</span>
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
                        <span className={statusClassName(s)}>{statusLabel(s, t)}</span>
                      </div>
                      {disabled ? (
                        <p className="import-card__category-text">{categoryLabel(categoryOf(s))}</p>
                      ) : (
                        <select
                          className="input"
                          value={categoryOf(s)}
                          onChange={(e) => setOverrides((o) => ({ ...o, [s.key]: e.target.value }))}
                          aria-label={t("import.categoryFor", { desc: s.row.description })}
                        >
                          <option value="">{categoryName(null)}</option>
                          {categoriesForKind(rowKind).map((c) => (
                            <option key={c.id} value={c.id}>{categoryName(c.id)}</option>
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
                        {t("import.includeInImport")}
                      </label>
                    </div>
                  );
                })}
              </div>

              {pageCount > 1 && (
                <div className="import-pager">
                  <span>
                    {t("import.showing", { a: pageStart + 1, b: pageEnd, total: scored.length })}
                  </span>
                  <span>
                    {t("import.pageOf", { a: safePage + 1, b: pageCount })}
                  </span>
                  <div className="import-pager__buttons">
                    <Button variant="ghost" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setPage(safePage + 1)}
                      disabled={safePage >= pageCount - 1}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}

              {error && <p style={{ fontSize: 13, color: "var(--danger, #c0392b)" }}>{error}</p>}
            </div>

            <div className="import-dialog__footer">
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={importing}>
                {t("common.back")}
              </Button>
              <Button onClick={handleImport} disabled={importing || includedCount === 0}>
                {importing ? t("import.importing", { done: progress.done, total: progress.total }) : t("import.importButton", { count: includedCount })}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
