import { BOM, csvField } from './csv';
import { formatDateTime } from './format';
import type { SkuCatalog } from './api-types';

// SKU catalog 匯出(CH-018)。純函數,唔掂 DOM —— 下載動作留喺 component,
// 同 `allocation-template.ts` 一樣。
//
// 為何要呢個:allocation import 認 `businessAlias`,而 catalog 畫面一頁得 8 行、
// 冇搜尋 ⇒ 91 個 active SKU 要揭 12 頁先睇得齊。template(W35 F2)已經解決咗
// 「填嗰陣唔知有咩 alias」,但佢只出「已 curate 且 active」嗰批 —— 睇唔到 catalog
// 全貌,亦唔知**未 curate** 嘅 SKU 叫咩、值唔值得 curate。呢個檔補嗰半。
//
// 🔴 只有 active SKU,而且係做唔到唔係唔想做:`catalog.service.ts` 嘅
// `listCatalog()` 硬 `where: { active: true }`,前端從來冇攞過 inactive。
// 對 import 嚟講足夠(import 本身都只讀 active catalog),但 UI 要講出嚟 —— 見
// spec §2.4。`Active` 欄照樣出(值永遠 Yes):一份寫住 `Active: Yes` 嘅檔,同一份
// 冇呢欄嘅檔,對讀嘅人講唔同嘢。

/** 欄序 = 畫面表格(少咗 Actions,多咗 Last synced)。 */
const HEADER = [
  'Display name',
  'Part number',
  'SkuId',
  'Business alias',
  'Category',
  'Base licence',
  'Active',
  'Last synced',
];

export interface CatalogExport {
  csv: string;
  fileName: string;
  skuCount: number;
}

/**
 * 砌 catalog CSV。唔再排序 —— 後端 `listCatalog()` 已經 `skuPartNumber` 升冪,
 * 而畫面就係照原序 render,再排一次只會令檔同畫面對唔上。
 */
export function buildCatalogCsv(catalog: SkuCatalog[]): CatalogExport {
  const lines = [HEADER.map(csvField).join(',')];

  for (const sku of catalog) {
    lines.push(
      [
        csvField(sku.displayName),
        csvField(sku.skuPartNumber),
        csvField(sku.skuId),
        csvField(sku.businessAlias ?? ''),
        csvField(sku.category ?? ''),
        sku.isBaseLicense ? 'Yes' : 'No',
        sku.active ? 'Yes' : 'No',
        csvField(syncedAt(sku.lastSyncedAt)),
      ].join(','),
    );
  }

  return {
    // BOM:令 Excel 用 UTF-8 開(alias / display name 可能有非 ASCII)。
    csv: BOM + lines.join('\r\n') + '\r\n',
    // 冇日期:重複下載直接覆蓋,好過喺 Downloads 堆一地版本。
    fileName: 'sku-catalog.csv',
    skuCount: catalog.length,
  };
}

/**
 * 同畫面一樣嘅時間格式,但 **空值出空格**。`formatDateTime` 對 null / invalid
 * 返 em-dash —— 嗰個係 UI placeholder,入到 Excel 只會變成要清嘅垃圾。
 */
function syncedAt(iso: string | null): string {
  const text = formatDateTime(iso);
  return text === '—' ? '' : text;
}
