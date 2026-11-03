import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseCsv,
  sniffDelimiter,
  decodeFileBytes,
  findHeaderRow,
  detectColumnsByHeader,
  normalizeRows,
  parseDateLoose,
  parseAmountLoose,
  importKeyOf,
} from "@/features/import/csv";
import { detectPreset } from "@/features/import/presets";
import { mapCategoryName } from "@/features/import/fields";
import { readWorkbookSheets } from "@/features/import/workbook";

const YNAB_CSV = `Account,Date,Payee,Category,Category Group,Memo,Outflow,Inflow,Cleared
Chequing,10/05/2026,Tim Hortons,Dining Out,Food,,45.20,,Cleared
Chequing,10/06/2026,Shell,Gas & Fuel,Auto & Transport,,60.00,,Cleared
Chequing,10/07/2026,Employer,Paycheck,Income,, ,2000.00,Cleared`;

const MINT_CSV = `Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes
10/05/2026,Coffee,STARBUCKS,5.50,debit,Coffee Shops,Chequing,,
10/06/2026,Salary,EMPLOYER PAYROLL,2000.00,credit,Paycheck,Chequing,,`;

const MONARCH_CSV = `Date,Merchant,Category,Category Group,Account,Amount,Pending,Notes,Tags,Transaction ID
2026-10-05,Amazon,Shopping,Shopping,Chequing,-89.99,,Order 123,,
2026-10-06,Pending Store,Shopping,Shopping,Chequing,-10.00,Pending,,,
2026-10-07,Refund Store,Shopping,Shopping,Chequing,20.00,,,`;

const COPILOT_CSV = `date,name,amount,status,category,parent category,excluded,tags,type,account,account mask,note,recurring
2026-10-05,Shell,60.00,posted,Gas & Fuel,Auto & Transport,false,,regular,Chequing,1234,,,
2026-10-06,Salary,-2000.00,posted,Paycheck,Income,false,,income,Chequing,1234,,,
2026-10-07,Transfer to Savings,500.00,posted,Transfer,Transfer,false,,internal transfer,Chequing,1234,,,`;

const QIANJI_CSV = `时间,分类,二级分类,类型,金额,账户,备注
2018/4/8 22:15,餐饮,午餐,支出,25.5,微信,午饭
2018/4/9 08:00,餐饮,早餐,支出,12.00,支付宝,豆浆油条
2018/4/9 09:00,工资,,收入,8000.00,银行卡,发工资
2018/4/10 10:00,转账,,转账,500.00,微信,转给朋友`;

const SUISHOUJI_CSV = `随手记账本
导出时间：2026-11-02
类型,分类,二级分类,金额,币种,账户,转出账户,转入账户,备注,时间,标签,附件
支出,餐饮,午餐,25.5,CNY,微信,,,午饭,2026-10-05 12:30,,
支出,交通,打车,32.00,CNY,支付宝,,,去公司,2026-10-06 08:15,,
收入,工资,,8000.00,CNY,银行卡,,,发工资,2026-10-07 09:00,,
转账,转账,,500.00,CNY,微信,微信,支付宝,,2026-10-08 10:00,,`;

const SUISHOUJI_XLS_HEADER = `交易类型,日期,分类,子分类,账户1,账户2,金额,商家,项目,备注
支出,2026-10-05,餐饮,午餐,微信,,25.5,沙县小吃,,午饭
支出,2026-10-06,交通,打车,支付宝,,32.00,滴滴,,去公司`;

describe("named presets", () => {
  it("detects and normalizes YNAB (outflow/inflow pair)", () => {
    const rows = parseCsv(YNAB_CSV);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("ynab");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ amount: 45.2, isCredit: false, categoryHint: "food-dining" });
    expect(out[1]).toMatchObject({ amount: 60, isCredit: false, categoryHint: "around-car" });
    expect(out[2]).toMatchObject({ amount: 2000, isCredit: true, categoryHint: "inc-paycheck" });
  });

  it("detects and normalizes Mint (amount + transaction type)", () => {
    const rows = parseCsv(MINT_CSV);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("mint");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ amount: 5.5, isCredit: false, categoryHint: "food-coffee" });
    expect(out[1]).toMatchObject({ amount: 2000, isCredit: true, categoryHint: "inc-paycheck" });
  });

  it("detects and normalizes Monarch (signed amounts, skips pending)", () => {
    const rows = parseCsv(MONARCH_CSV);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("monarch");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ amount: 89.99, isCredit: false, categoryHint: "life-apparel" });
    expect(out[1]).toMatchObject({ amount: 20, isCredit: true, categoryHint: null });
  });

  it("detects and normalizes Copilot (type column wins over sign)", () => {
    const rows = parseCsv(COPILOT_CSV);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("copilot");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ amount: 60, isCredit: false, categoryHint: "around-car" });
    expect(out[1]).toMatchObject({ amount: 2000, isCredit: true, categoryHint: "inc-paycheck" });
  });

  it("detects and normalizes 钱迹 (datetime, 二级分类 wins)", () => {
    const rows = parseCsv(QIANJI_CSV);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("qianji");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ date: "2018-04-08", amount: 25.5, isCredit: false, categoryHint: "food-dining", description: "午饭" });
    expect(out[1]).toMatchObject({ date: "2018-04-09", amount: 12, isCredit: false, description: "豆浆油条" });
    expect(out[2]).toMatchObject({ date: "2018-04-09", amount: 8000, isCredit: true, categoryHint: "inc-paycheck", description: "发工资" });
  });

  it("detects and normalizes 随手记 app CSV with preamble rows", () => {
    const parsed = parseCsv(SUISHOUJI_CSV);
    expect(findHeaderRow(parsed)).toBe(2);
    const rows = parsed.slice(2);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("suishouji");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ amount: 25.5, isCredit: false, categoryHint: "food-dining", description: "午饭" });
    expect(out[1]).toMatchObject({ amount: 32, isCredit: false, categoryHint: "around-commute", description: "去公司" });
    expect(out[2]).toMatchObject({ amount: 8000, isCredit: true, categoryHint: "inc-paycheck", description: "发工资" });
  });

  it("detects and normalizes 随手记 web .xls headers", () => {
    const rows = parseCsv(SUISHOUJI_XLS_HEADER);
    const preset = detectPreset(rows);
    expect(preset?.id).toBe("suishouji");
    const out = preset!.normalize(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ amount: 25.5, description: "沙县小吃", categoryHint: "food-dining" });
    expect(out[1]).toMatchObject({ amount: 32, description: "滴滴", categoryHint: "around-commute" });
  });
});

describe("category name mapping", () => {
  it("maps English names and Parent:Child", () => {
    expect(mapCategoryName("Dining Out")).toBe("food-dining");
    expect(mapCategoryName("Auto & Transport:Gas & Fuel")).toBe("around-car");
    expect(mapCategoryName("Gas & Fuel")).toBe("around-car");
    expect(mapCategoryName("Rent/Mortgage")).toBe("nest-home");
    expect(mapCategoryName("Health Insurance")).toBe("cushion-insurance");
    expect(mapCategoryName("Paycheck")).toBeNull();
    expect(mapCategoryName("Paycheck", "income")).toBe("inc-paycheck");
    expect(mapCategoryName("Salary", "income")).toBe("inc-paycheck");
    expect(mapCategoryName("Refund", "income")).toBe("inc-refunds");
  });

  it("maps Chinese names, leaf wins", () => {
    expect(mapCategoryName("餐饮")).toBe("food-dining");
    expect(mapCategoryName("餐饮美食")).toBe("food-dining");
    expect(mapCategoryName("交通")).toBe("around-commute");
    expect(mapCategoryName("水电燃气")).toBe("nest-utilities");
    expect(mapCategoryName("其他")).toBeNull();
    expect(mapCategoryName("工资", "income")).toBe("inc-paycheck");
    expect(mapCategoryName("工资")).toBeNull();
  });
});

describe("generic alias import", () => {
  it("sniffs semicolon delimiters and maps headers", () => {
    const text = "Date;Description;Amount;Category\n2026-10-05;Coffee;-5.50;Dining\n";
    expect(sniffDelimiter(text)).toBe(";");
    const rows = parseCsv(text, ";");
    const mapping = detectColumnsByHeader(rows);
    expect(mapping).not.toBeNull();
    const out = normalizeRows(rows, mapping!);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ amount: 5.5, categoryHint: "food-dining" });
  });

  it("uses the direction column over amount sign", () => {
    const rows = parseCsv(
      "Date,Description,Amount,Type\n2026-10-05,Coffee,5.50,debit\n2026-10-06,Salary,2000,credit\n"
    );
    const mapping = detectColumnsByHeader(rows);
    expect(mapping!.direction).toBeGreaterThanOrEqual(0);
    const out = normalizeRows(rows, mapping!);
    expect(out).toHaveLength(2);
    expect(out[0].isCredit).toBe(false);
    expect(out[1].isCredit).toBe(true);
  });

  it("maps Parent:Child categories in generic files", () => {
    const rows = parseCsv(
      "Date,Description,Amount,Category\n2026-10-05,Shell,-60.00,Auto & Transport:Gas & Fuel\n"
    );
    const mapping = detectColumnsByHeader(rows);
    const out = normalizeRows(rows, mapping!);
    expect(out[0].categoryHint).toBe("around-car");
  });
});

describe("encoding and dates", () => {
  it("decodes GBK bytes", () => {
    // "时间,金额\n" in GBK: 时=CA B1, 间=BC E4, 金=BD F0, 额=B6 EE
    const bytes = new Uint8Array([0xca, 0xb1, 0xbc, 0xe4, 0x2c, 0xbd, 0xf0, 0xb6, 0xee, 0x0a]);
    const text = decodeFileBytes(bytes.buffer);
    expect(text).toBe("时间,金额\n");
    const rows = parseCsv(text);
    expect(findHeaderRow(rows)).toBe(0);
  });

  it("parses datetimes, 2-digit years and Chinese dates", () => {
    expect(parseDateLoose("2018/4/8 22:15")).toBe("2018-04-08");
    expect(parseDateLoose("10/05/26")).toBe("2026-10-05");
    expect(parseDateLoose("2026年10月5日")).toBe("2026-10-05");
  });

  it("parses ¥/元 amounts and the Unicode minus", () => {
    expect(parseAmountLoose("¥1,234.56")).toBe(1234.56);
    expect(parseAmountLoose("100元")).toBe(100);
    expect(parseAmountLoose("−25.50")).toBe(-25.5);
  });
});

describe("Chinese dedupe keys", () => {
  it("keeps different Chinese descriptions distinct", () => {
    const a = importKeyOf("2026-10-05", 25.5, "午饭沙县小吃");
    const b = importKeyOf("2026-10-05", 25.5, "晚饭兰州拉面");
    expect(a).not.toBe(b);
    expect(importKeyOf("2026-10-05", 25.5, "午饭沙县小吃")).toBe(a);
    expect(importKeyOf("2026-10-05", 25.5, "午饭沙县小吃", "income")).not.toBe(a);
    expect(importKeyOf("2026-10-05", 25.5, "午饭沙县小吃", "income")).toBe(
      importKeyOf("2026-10-05", 25.5, "午饭沙县小吃", "income")
    );
  });
});

describe("spreadsheet import", () => {
  it("round-trips an .xlsx sheet into rows", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["日期", "分类", "二级分类", "类型", "金额", "备注"],
      ["2026-10-05", "餐饮", "午餐", "支出", 25.5, "午饭"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const sheets = readWorkbookSheets(buf);
    expect(sheets).toHaveLength(1);
    const preset = detectPreset(sheets[0]);
    expect(preset?.id).toBe("qianji");
    expect(preset!.normalize(sheets[0])).toHaveLength(1);
  });
});
