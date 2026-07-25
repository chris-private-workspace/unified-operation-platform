import type { AdminOpco, LedgerRow, SkuCatalog } from './api-types';

// Allocation CSV 範本生成(W35 F2)。純函數,唔掂 DOM —— 下載動作留喺 component。
//
// 為何要呢個:upload 面本身唔會講格式,而格式規則其實好嚴(header 逐字 === Opco.code、
// col-A 逐字 === SkuCatalog.businessAlias、exact match 零 fuzzy,ADR-0004 #2)。操作者
// 冇範本就唔可能知要餵咩 → 亂試 → 全部落 skippedSkuLabels。
//
// 設計決定(兩個,刻意):
//  1. **動態生成,唔用靜態檔** —— OpCo(CH-004 可增減)同 curated alias 都會變,
//     靜態範本一定過時。範本由 live `GET /opcos` + `GET /license/catalog` 砌出嚟。
//  2. **格 = 當前 allocatedQuantity,唔係空白** —— 咁樣「下載 → 原封上傳」= 零改動
//     (import 見 target === before 就 skip),操作者係**改現有數字**而唔係由白紙打全部。
//     全新系統仲未有 ledger row → 每格自然係 0,退化成純結構範本,同樣 round-trip 零改動。
//
// `Grand Total` 欄刻意唔生 —— import 會忽略佢(allocation-import.service.ts:60),
// 生出嚟只會令操作者以為要維護個總數。

/** U+FEFF。用 fromCharCode 而唔係字面字元 —— 隱形字元喺 source 裡係地雷。 */
const BOM = String.fromCharCode(0xfeff);

export interface TemplateInput {
  opcos: AdminOpco[];
  catalog: SkuCatalog[];
  ledger: LedgerRow[];
}

export interface TemplateReady {
  ok: true;
  csv: string;
  fileName: string;
  opcoCount: number;
  skuCount: number;
  /** Active SKU 但未 curate alias —— 提示操作者:呢啲入唔到 ledger(curation-as-scope)。 */
  uncuratedSkus: string[];
}

export interface TemplateBlocked {
  ok: false;
  /** no-opcos = 連 OpCo 都冇(未 seed);no-curated-sku = 有 SKU 但一個 alias 都未 curate。 */
  reason: 'no-opcos' | 'no-curated-sku';
  uncuratedSkus: string[];
}

export type TemplateResult = TemplateReady | TemplateBlocked;

/**
 * 砌 allocation import 範本。**唔會**生一個空範本 —— 一個 curated alias 都冇嘅時候
 * 回 `ok: false`,由 UI 叫操作者先去 curate(生個空檔比唔生更誤導:上傳完 0 mapped
 * 會令人以為 import 壞咗,其實係 curation 未做)。
 */
export function buildAllocationTemplate(input: TemplateInput): TemplateResult {
  // Active SKU 且 alias 有值(trim 後非空)= 真正入得 ledger 嘅 scope。
  const curated: { alias: string; sku: SkuCatalog }[] = [];
  const uncuratedSkus: string[] = [];
  const seenAlias = new Set<string>();

  for (const sku of input.catalog) {
    if (!sku.active) continue;
    const alias = (sku.businessAlias ?? '').trim();
    if (!alias) {
      uncuratedSkus.push(sku.skuPartNumber);
      continue;
    }
    // 同一個 alias 撞兩個 SKU = curation 出錯;後端 map 亦係一個 alias 一個 SKU,
    // 所以範本只出一行(first wins),唔靜靜生重複 row。
    if (seenAlias.has(alias)) continue;
    seenAlias.add(alias);
    curated.push({ alias, sku });
  }

  uncuratedSkus.sort((a, b) => a.localeCompare(b));

  const opcos = [...input.opcos].sort((a, b) => a.code.localeCompare(b.code));
  if (opcos.length === 0)
    return { ok: false, reason: 'no-opcos', uncuratedSkus };
  if (curated.length === 0)
    return { ok: false, reason: 'no-curated-sku', uncuratedSkus };

  curated.sort((a, b) => a.alias.localeCompare(b.alias));

  // 現有 allocatedQuantity 查表(key = skuCatalogId:opcoId)。
  const current = new Map<string, number>();
  for (const row of input.ledger) {
    current.set(`${row.skuCatalogId}:${row.opcoId}`, row.allocatedQuantity);
  }

  const header = ['SKU', ...opcos.map((o) => o.code)];
  const lines = [header.map(csvField).join(',')];
  for (const { alias, sku } of curated) {
    const cells = opcos.map((o) =>
      String(current.get(`${sku.id}:${o.id}`) ?? 0),
    );
    lines.push([csvField(alias), ...cells].join(','));
  }

  // BOM:令 Excel 用 UTF-8 開(alias 可能有非 ASCII)。後端 parseCsv 會 strip,
  // 所以 round-trip 唔受影響(csv.ts:13)。
  const csv = BOM + lines.join('\r\n') + '\r\n';

  return {
    ok: true,
    csv,
    fileName: 'license-allocation-template.csv',
    opcoCount: opcos.length,
    skuCount: curated.length,
    uncuratedSkus,
  };
}

/** RFC 4180 引號規則 —— 只在需要時加引號,`"` double escape(對得住後端 parseCsv)。 */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
