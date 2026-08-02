// 前端 CSV 生成嘅共用零件(CH-018 由 `allocation-template.ts` 抽出,行為零改變)。
//
// 點解要抽:CSV escaping 寫錯**唔會爆**,只會靜靜咁生出一個 Excel 開錯欄嘅檔。
// 兩份各自實作嘅漂移代價,遠高於共用一個三行函數。

/** U+FEFF。用 fromCharCode 而唔係字面字元 —— 隱形字元喺 source 裡係地雷。 */
export const BOM = String.fromCharCode(0xfeff);

/** RFC 4180 引號規則 —— 只在需要時加引號,`"` double escape(對得住後端 parseCsv)。 */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
