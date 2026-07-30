// Unified Operation Platform — Azure UAT 部署流程(docx)
// 跑法:.\nodegen.ps1 build.js <out.docx>
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, VerticalAlign,
  ImageRun, PageBreak, TableOfContents, Header, Footer, PageNumber,
  LevelFormat, convertMillimetersToTwip, TabStopType,
} = require("docx");

const HERE = __dirname;
const OUT = process.argv[2] || path.join(HERE, "deployment.docx");

// ── 色 ─────────────────────────────────────────────
const RED = "E60027";        // Ricoh red — 主調
const RED_DK = "A8001C";
const INK = "1A1A1A";
const MUTED = "6B7280";
const LINE = "D1D5DB";
const LIGHT = "F9FAFB";
const HEAD_BG = "F3F4F6";
const AMBER = "B45309";
const AMBER_BG = "FFFBEB";
const GREEN = "15803D";
const GREEN_BG = "F0FDF4";
const RED_BG = "FEF2F2";

const SANS = "Microsoft JhengHei UI";
const MONO = "Consolas";

// A4 + 20mm margin → 內容寬 9638 DXA
const CONTENT_W = 9638;
const IMG_W = 640;   // px @96dpi ≈ 內容寬

// ── 小工具 ─────────────────────────────────────────
const t = (text, o = {}) => new TextRun({
  text, font: o.mono ? MONO : SANS,
  size: o.size ?? 20, bold: o.bold, italics: o.italics,
  color: o.color ?? INK, ...(o.break ? { break: o.break } : {}),
});

const p = (children, o = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [children],
  spacing: { before: o.before ?? 0, after: o.after ?? 120, line: o.line ?? 280 },
  alignment: o.align, indent: o.indent, border: o.border,
  numbering: o.numbering, keepNext: o.keepNext,
});

// s 可以係字串,亦可以係一個 TextRun array(混排 mono / 粗體嗰啲)。
// 唔判斷 array 嘅話,new TextRun({ text: [...] }) 會靜靜產生一個空 run ——
// 段落照樣存在,文字就無聲無息冇咗。
const body = (s, o = {}) => p(Array.isArray(s) ? s : t(s, o), o);

// 段落底邊框當水平線(唔用 table 扮 hr)
const rule = (color = RED, size = 12) => new Paragraph({
  children: [t("")],
  border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 1 } },
  spacing: { after: 160 },
});

// ── 表格 ───────────────────────────────────────────
const cell = (content, w, o = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade, color: "auto" } : undefined,
  margins: { top: 70, bottom: 70, left: 110, right: 110 },
  verticalAlign: VerticalAlign.CENTER,
  columnSpan: o.span,
  children: (Array.isArray(content) ? content : [content]).map((c) =>
    typeof c === "string"
      ? p(t(c, { size: o.size ?? 18, bold: o.bold, mono: o.mono, color: o.color }), { after: 0, line: 240 })
      : c),
});

const table = (widths, rows, o = {}) => new Table({
  columnWidths: widths,
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE },
  },
  rows,
});

// 表頭:紅底白字 —— 全文件表格統一
const headRow = (labels, widths) => new TableRow({
  tableHeader: true,
  children: labels.map((l, i) =>
    cell(l, widths[i], { shade: RED, bold: true, color: "FFFFFF", size: 18 })),
});

const dataRow = (cells, widths, o = {}) => new TableRow({
  // 唔好喺頁界劈開一行:拆開之後續頁只會見到其中一格有字、其餘欄空白,睇落似壞咗
  cantSplit: true,
  children: cells.map((c, i) => cell(c, widths[i], {
    shade: o.shade ?? (o.zebra ? LIGHT : undefined),
    mono: o.monoCols?.includes(i),
    size: 18,
    bold: o.boldCols?.includes(i),
    color: o.color,
  })),
});

// ── callout:單格表格 + 左粗邊 ──────────────────────
const callout = (title, lines, kind = "warn") => {
  const conf = {
    warn: { bg: AMBER_BG, bar: AMBER, fg: AMBER },
    danger: { bg: RED_BG, bar: RED, fg: RED_DK },
    ok: { bg: GREEN_BG, bar: GREEN, fg: GREEN },
  }[kind];
  return new Table({
    columnWidths: [CONTENT_W],
    width: { size: CONTENT_W, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: conf.bar },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: conf.bar },
      right: { style: BorderStyle.SINGLE, size: 2, color: conf.bar },
      left: { style: BorderStyle.SINGLE, size: 24, color: conf.bar },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({
      cantSplit: true,   // 唔好喺頁界劈開一個 callout —— 半個色框跨兩頁極醜
      children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: conf.bg, color: "auto" },
        margins: { top: 130, bottom: 130, left: 170, right: 150 },
        children: [
          p(t(title, { bold: true, color: conf.fg, size: 19 }), { after: lines.length ? 70 : 0 }),
          ...lines.map((ln, i) =>
            p(Array.isArray(ln) ? ln : t(ln, { size: 18, color: INK }),
              { after: i === lines.length - 1 ? 0 : 50 })),
        ],
      })],
    })],
  });
};

// ── code block ─────────────────────────────────────
const code = (lines) => new Table({
  columnWidths: [CONTENT_W],
  width: { size: CONTENT_W, type: WidthType.DXA },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 3, color: LINE },
    bottom: { style: BorderStyle.SINGLE, size: 3, color: LINE },
    left: { style: BorderStyle.SINGLE, size: 3, color: LINE },
    right: { style: BorderStyle.SINGLE, size: 3, color: LINE },
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: { style: BorderStyle.NONE },
  },
  rows: [new TableRow({
    children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" },
      margins: { top: 110, bottom: 110, left: 150, right: 120 },
      children: lines.map((ln, i) => p(
        t(ln === "" ? " " : ln, { mono: true, size: 16, color: ln.startsWith("#") ? MUTED : INK }),
        { after: i === lines.length - 1 ? 0 : 20, line: 240 })),
    })],
  })],
});

const image = (file, w) => {
  const buf = fs.readFileSync(path.join(HERE, file));
  const meta = pngSize(buf);
  const h = Math.round((w * meta.h) / meta.w);
  return new Paragraph({
    children: [new ImageRun({ data: buf, type: "png", transformation: { width: w, height: h } })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 80 },
  });
};

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const caption = (s) => p(t(s, { size: 16, color: MUTED, italics: true }),
  { align: AlignmentType.CENTER, after: 240 });

// bullet helpers —— 三種層級 + 編號 + 檢查項
const bul = (s, level = 0, o = {}) => p(
  typeof s === "string" ? t(s, { size: 20, ...o }) : s,
  { numbering: { reference: "uop-bullets", level }, after: 60, line: 270 });
// instance 要逐個列表分開 —— 同一個 reference 共用同一個 instance 會令編號
// 跨章節累加(第二張列表由 3 開始咁樣)。
const num = (s, level = 0, instance = 0) => p(
  typeof s === "string" ? t(s, { size: 20 }) : s,
  { numbering: { reference: "uop-steps", level, instance }, after: 60, line: 270 });
const chk = (s) => p(
  typeof s === "string" ? t(s, { size: 20 }) : s,
  { numbering: { reference: "uop-check", level: 0 }, after: 60, line: 270 });

// ── 內容 ───────────────────────────────────────────
const W3 = [3400, 3100, 3138];
const W2 = [3000, 6638];
// 「類型」欄要放得落 "PostgreSQL Flexible" 一行 —— 窄過呢個就會硬斷成
// 「Postgre / SQL Flexible」。
const W4 = [2100, 1700, 2700, 3138];

const coverTable = table([2400, 7238], [
  dataRow(["文件版本", "1.0(2026-07-30)"], [2400, 7238], { boldCols: [0], shade: undefined }),
  dataRow(["對應 commit", "uat-1bc7cdb(BUG-008 修復後首個成功部署)"], [2400, 7238], { boldCols: [0], monoCols: [1], zebra: true }),
  dataRow(["目標環境", "Ricoh RCI · Azure(rcitest sub)· eastasia"], [2400, 7238], { boldCols: [0] }),
  dataRow(["架構決定", "ADR-0012(UAT deployment topology)"], [2400, 7238], { boldCols: [0], zebra: true }),
  dataRow(["狀態", "UAT 已上線並通過 smoke test"], [2400, 7238], { boldCols: [0] }),
]);

const doc = new Document({
  creator: "Unified Operation Platform",
  title: "Azure UAT 部署流程",
  description: "as-built deployment runbook",
  features: { updateFields: true },   // 令 Word 開檔時更新目錄
  numbering: {
    config: [
      {
        reference: "uop-bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 220 } },
                     run: { color: RED, size: 16 } } },
          { level: 1, format: LevelFormat.BULLET, text: "○", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 220 } },
                     run: { color: MUTED } } },
          { level: 2, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 220 } },
                     run: { color: MUTED } } },
        ],
      },
      {
        reference: "uop-steps",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 380, hanging: 380 } },
                     run: { bold: true, color: RED } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2)", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 780, hanging: 340 } }, run: { color: MUTED } } },
        ],
      },
      {
        reference: "uop-check",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "□", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 260 } },
                     run: { color: INK, size: 20 } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: SANS, size: 20, color: INK }, paragraph: { spacing: { line: 280 } } },
      heading1: {
        run: { font: SANS, size: 30, bold: true, color: INK },
        paragraph: { spacing: { before: 360, after: 140 }, keepNext: true },
      },
      heading2: {
        run: { font: SANS, size: 24, bold: true, color: RED_DK },
        paragraph: { spacing: { before: 260, after: 110 }, keepNext: true },
      },
      heading3: {
        run: { font: SANS, size: 21, bold: true, color: INK },
        paragraph: { spacing: { before: 200, after: 90 }, keepNext: true },
      },
    },
  },
  sections: [
    // ── 封面(無頁碼)────────────────────────────
    {
      properties: {
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: {
            top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
            left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
          },
        },
        titlePage: true,
      },
      children: [
        p(t("", { size: 20 }), { after: 1600 }),
        p(t("Unified Operation Platform", { size: 22, color: MUTED, bold: true }), { after: 100 }),
        // 紅色粗橫條 = 品牌記號
        new Paragraph({
          children: [t("")],
          border: { bottom: { style: BorderStyle.SINGLE, size: 30, color: RED, space: 1 } },
          spacing: { after: 260 },
        }),
        p(t("Azure UAT 部署流程", { size: 52, bold: true }), { after: 120 }),
        p(t("as-built deployment runbook", { size: 26, color: MUTED }), { after: 100 }),
        p(t("公司網 proxy 限制下實際走得通嘅路徑", { size: 20, color: MUTED }), { after: 900 }),
        coverTable,
        p(t("", { size: 20 }), { after: 700 }),
        callout("本文件記錄實際成功部署嘅路徑,非理想藍圖", [
          "W32 原藍圖多處行唔通(公司 proxy 擋 data-plane)。下文每一步都經真環境驗證。",
          "第 8 章列出本文件驗證 docs/13-deployment 時發現嘅落差,含一項會令 email 功能失效嘅缺口。",
        ], "warn"),
      ],
    },

    // ── 正文 ──────────────────────────────────
    {
      properties: {
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: {
            top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
            left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                t("Unified Operation Platform", { size: 16, color: MUTED }),
                t("\tAzure UAT 部署流程", { size: 16, color: MUTED }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 6 } },
              spacing: { after: 200 },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                t("v1.0 · 2026-07-30", { size: 15, color: MUTED }),
                new TextRun({ children: ["\t", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
                  font: SANS, size: 15, color: MUTED }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
            }),
          ],
        }),
      },
      children: [
        // 目錄
        new Paragraph({
          children: [t("目錄", { size: 30, bold: true })],
          spacing: { after: 60 },
        }),
        rule(RED, 16),
        new TableOfContents("目錄", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({ children: [t("", { size: 16, color: MUTED })], spacing: { before: 200 } }),
        body("若目錄顯示為空白,喺 Word 內按 Ctrl+A 然後 F9 更新功能變數。", { size: 16, color: MUTED, italics: true }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 1 ──
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("1  文件用途與範圍", { size: 30, bold: true })] }),
        body("本文件描述 Unified Operation Platform(後端 uop-api + 前端 uop-web)部署到 Azure Container Apps 嘅完整流程。內容以 as-built 為準 —— 即實際成功部署所走嘅路徑,而非原本規劃嘅理想做法。"),
        body("讀者需具備:Azure CLI 操作經驗、對 repo 結構有基本認識、以及一個對目標 resource group 有 Contributor 權限嘅 service principal。"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("1.1  範圍內", { size: 24, bold: true, color: RED_DK })] }),
        bul("兩個 container image 嘅 build 與推送"),
        bul("Azure 基礎資源 provision(ACR、PostgreSQL、Log Analytics、Key Vault、ACA env)"),
        bul("Secret 管理策略與 ARM 部署"),
        bul("Database migration 與 seed(容器自動執行)"),
        bul("分層 smoke test 與 rollback"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("1.2  範圍外", { size: 24, bold: true, color: RED_DK })] }),
        bul([t("RCI 正式授權流程(PAR)", { size: 20 }), t(" —— 見 ", { size: 20, color: MUTED }), t("05-rci-par-process.md", { size: 18, mono: true, color: MUTED })]),
        bul([t("Production hardening 清單 —— 見 ", { size: 20, color: MUTED }), t("06-prod-hardening-checklist.md", { size: 18, mono: true, color: MUTED })]),
        bul([t("n8n 整合上線 —— 見 ", { size: 20, color: MUTED }), t("08-n8n-integration-go-live.md", { size: 18, mono: true, color: MUTED })]),
        bul("Entra SSO 啟用(待 IT 建立 app registration,目前以 break-glass 本地帳號運作)"),

        // ── 2 ──
        // 由新頁開始,同其餘章節一致。唔加嘅話 §2 會溢一兩行落下一頁,
        // 而 §3 帶住一張整幅圖又放唔落剩餘空間,結果中間夾一版空白。
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("2  環境規律(先讀)", { size: 30, bold: true })] }),
        body([
          t("公司網 proxy ", { size: 20 }),
          t("只放行 Azure management plane", { size: 20, bold: true }),
          t("(", { size: 20 }),
          t("management.azure.com", { size: 18, mono: true }),
          t("),而以 SSL-MITM 或 503 阻擋", { size: 20 }),
          t("所有 data-plane", { size: 20, bold: true }),
          t("。呢個單一事實決定咗成套部署做法 —— 以下每一條「直覺做法」都實測失敗過。", { size: 20 }),
        ]),
        table(W3, [
          headRow(["想做嘅事", "直覺做法(行唔通)", "as-built 做法"], W3),
          dataRow(["Build image", "本地 docker build", "az acr build(Azure 側 build)"], W3, { monoCols: [1, 2] }),
          dataRow(["存放 secret", "Key Vault data-plane", "ACA native secureString(經 ARM)"], W3, { zebra: true }),
          dataRow(["部署 ACA", "az containerapp create", "az deployment group create + 手寫 ARM"], W3, { monoCols: [1, 2] }),
          dataRow(["編譯 Bicep", "az bicep install", "直接用手寫 ARM JSON"], W3, { zebra: true, monoCols: [1] }),
          dataRow(["Migrate / seed", "operator 直連 DB 執行", "容器啟動時自動執行"], W3),
          dataRow(["睇 container log", "az containerapp logs", "逐層 HTTP 探測(見第 7 章)"], W3, { zebra: true, monoCols: [1] }),
        ]),
        p(t("", { size: 12 }), { after: 120 }),
        // 呢兩條刻意用列表而唔用 callout:callout 係 cantSplit 嘅表格,
        // 內容一長就會整塊推落下一頁,喺上一頁留一大片空白。
        new Paragraph({
          children: [t("兩條操作紀律 —— 貫穿全部步驟", { bold: true, size: 21, color: RED_DK })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RED, space: 3 } },
          spacing: { before: 120, after: 140 },
          keepNext: true,
        }),
        num([t("az 指令一律 sequential", { size: 20, bold: true }), t("。多個並發會互相鎖死並 hang。", { size: 20 })]),
        num([t("CLI 印 Unicode 勾號時會撞 Windows charmap 而 crash", { size: 20, bold: true }), t(",造成 exit 1 假象。真正結果要查 management plane —— 背景執行嘅話,即使 CLI 被殺,server-side 一樣會完成。", { size: 20 })]),
        p(t("", { size: 12 }), { after: 120 }),
        body("若喺唔受限嘅網路部署,以上多數限制會消失,可以走更直接嘅路。但 as-built 這條路兩種網路都行得通,建議照跟以保持一致。", { size: 19, color: MUTED }),

        // ── 3 ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("3  目標架構", { size: 30, bold: true })] }),
        image("topology.png", IMG_W),
        caption("圖 1 — Azure UAT 部署拓撲。琥珀色框 = email 能力,running container 實測已配置(見 6.2)。"),
        callout("單一 origin 係硬需求", [
          "本地 session 使用 SameSite=Strict 嘅 httpOnly cookie,跨 origin 唔會帶。因此 web 同 api 必須共用同一個 hostname —— 由 nginx 前置反向代理 /api 達成,而非兩個各自對外嘅 ingress。詳見 ADR-0012。",
        ], "warn"),
        p(t("", { size: 12 }), { after: 200 }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("3.1  資源清單(現行 UAT)", { size: 24, bold: true, color: RED_DK })] }),
        table(W4, [
          headRow(["資源", "類型", "名稱", "備註"], W4),
          dataRow(["Resource Group", "—", "RG-RCITest-RAPO-N8N", "shared;SP 僅限此 RG"], W4, { monoCols: [2] }),
          dataRow(["Container Registry", "ACR", "acruopuat", "Basic · admin enabled"], W4, { zebra: true, monoCols: [2] }),
          dataRow(["Database", "PostgreSQL Flexible", "psql-uop-uat", "v16 · Burstable B1ms · DB platform"], W4, { monoCols: [2] }),
          dataRow(["Log", "Log Analytics", "law-uop-uat", "綁 ACA env"], W4, { zebra: true, monoCols: [2] }),
          dataRow(["Secret store", "Key Vault", "kv-uop-uat", "已建但未接線(data-plane 被擋)"], W4, { monoCols: [2] }),
          dataRow(["ACA 環境", "Managed Env", "cae-uop-uat", "—"], W4, { zebra: true, monoCols: [2] }),
          dataRow(["後端", "Container App", "ca-uop-api", "internal ingress · :3000 · allowInsecure"], W4, { monoCols: [2] }),
          dataRow(["前端", "Container App", "ca-uop-web", "external ingress · :8080 · 1-2 replica"], W4, { zebra: true, monoCols: [2] }),
        ]),

        // ── 4 ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("4  流程總覽", { size: 30, bold: true })] }),
        image("pipeline.png", IMG_W),
        caption("圖 2 — 七個部署步驟。第 6 步由容器自行執行,其餘由 operator 執行。"),
        body("步驟 1 至 5 為 operator 以 service principal 身分執行;步驟 6 喺容器啟動時自動發生;步驟 7 為驗證。全程唯一需要人手判斷嘅係步驟 4 嘅 secret 值管理。"),

        // ── 5 ──
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("5  逐步執行", { size: 30, bold: true })] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.1  步驟 1 — 前置檢查", { size: 24, bold: true, color: RED_DK })] }),
        chk([t("az login", { mono: true, size: 19 }), t("(SP)後以 ", { size: 20 }), t("az account show", { mono: true, size: 19 }), t(" 確認 subscription 與 tenant 正確", { size: 20 })]),
        chk([t("確認 SP 權限:", { size: 20 }), t("az role assignment list --assignee <sp> --all", { mono: true, size: 19 })]),
        chk("決定資源命名與 region(eastasia = RCI1 HK)"),
        chk("產生強隨機 secret(見 5.4),只寫入 gitignored params 檔"),
        p(t("", { size: 12 }), { after: 140 }),
        body([
          t("注意:", { bold: true, size: 19 }),
          t("現行 SP 為該 resource group 嘅 Contributor,", { size: 19 }),
          t("無權建立 Entra app registration", { size: 19, bold: true }),
          t(" —— 所以 SSO 需要 IT 配合,UAT 目前以 break-glass 本地帳號運作。", { size: 19 }),
        ], { color: MUTED }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.2  步驟 2 — Provision 基礎資源", { size: 24, bold: true, color: RED_DK })] }),
        code([
          "# ACR:開 admin 令 ARM 攞得到 registry credential",
          "az acr create -n <acr> -g <rg> --sku Basic -l <loc>",
          "az acr update -n <acr> --admin-enabled true",
          "",
          "# PostgreSQL Flexible v16 —— 呢個 az 版本冇 --database-name,要分兩步",
          "az postgres flexible-server create -n <pg> -g <rg> -l <loc> \\",
          "  --tier Burstable --sku-name Standard_B1ms --version 16 --storage-size 32 \\",
          "  --admin-user uop --admin-password \"$DBPW\" --public-access 0.0.0.0 --yes",
          "az postgres flexible-server db create -s <pg> -g <rg> -d platform",
          "",
          "# ACA env 需要 Log Analytics;Key Vault 先建,留待 hardening 接線",
          "az monitor log-analytics workspace create -n <law> -g <rg> -l <loc>",
          "az keyvault create -n <kv> -g <rg> -l <loc>",
        ]),
        p(t("", { size: 12 }), { after: 160 }),
        bul([t("--public-access 0.0.0.0", { mono: true, size: 19 }), t(" 意思係「允許 Azure 服務連入」,令 ACA 到得到 DB。", { size: 20 })]),
        bul("Hardening 時改為 private access / VNet;但 operator 就更加連唔到 DB,所以容器自行 migrate 嘅設計仍然成立。"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.3  步驟 3 — Build 並推送 image", { size: 24, bold: true, color: RED_DK })] }),
        body("兩個 build 都以 repo root 為 context —— 前端需要 root 嘅 design token,後端需要 root 嘅 npm workspace 檔案。"),
        code([
          "TAG=uat-$(git rev-parse --short HEAD)",
          "az acr build --registry <acr> --image uop-api:$TAG -f apps/api/Dockerfile .",
          "az acr build --registry <acr> --image uop-web:$TAG -f apps/web/Dockerfile .",
          "",
          "# CLI 可能 charmap crash(exit 1 假象)。真結果:",
          "az acr task list-runs -r <acr> --top 3 -o table    # 睇 Status = Succeeded",
        ]),
        p(t("", { size: 12 }), { after: 200 }),
        callout("Build 成功唔等於容器起得身 —— BUG-008 嘅教訓", [
          [t("2026-07-29 發生過一次:626 個 test 全綠、lint 零 output、", { size: 19 }), t("az acr build", { mono: true, size: 18 }), t(" 報 Succeeded,但每個容器一啟動就 ", { size: 19 }), t("MODULE_NOT_FOUND", { mono: true, size: 18, bold: true }), t(" 而 CrashLoopBackOff。", { size: 19 })],
          [t("成因:", { bold: true, size: 19 }), t("TypeScript 喺冇 ", { size: 19 }), t("rootDir", { mono: true, size: 18 }), t(" 時,以「所有被編譯檔案嘅共同父目錄」做輸出根。CH-011 加入 ", { size: 19 }), t("src/", { mono: true, size: 18 }), t(" 以外第一個 ", { size: 19 }), t(".ts", { mono: true, size: 18 }), t(" 檔,輸出根即由 ", { size: 19 }), t("src/", { mono: true, size: 18 }), t(" 抬升到 ", { size: 19 }), t("apps/api/", { mono: true, size: 18 }), t(",令 entrypoint 指向嘅 ", { size: 19 }), t("dist/main.js", { mono: true, size: 18 }), t(" 唔再存在。", { size: 19 })],
          [t("現已落閘:", { bold: true, size: 19 }), t("tsconfig.build.json", { mono: true, size: 18 }), t(" pin 死 ", { size: 19 }), t("rootDir: \"./src\"", { mono: true, size: 18 }), t(",而 Dockerfile build stage 有 ", { size: 19 }), t("RUN test -f dist/main.js", { mono: true, size: 18 }), t(" —— 同類問題會喺 ACR 就爆,唔會再流到部署。", { size: 19 })],
        ], "danger"),
        p(t("", { size: 12 }), { after: 160 }),
        body([
          t("SSO(可選):", { bold: true, size: 19 }),
          t("前端 image 要烘入 Entra 值,需加 ", { size: 19 }),
          t("--build-arg VITE_ENTRA_*", { mono: true, size: 18 }),
          t(" 四個參數。因為屬 build-time,換 tenant 或 hostname 都要重新 build。redirect URI 有雞蛋問題 —— 先部署取得 web FQDN,再重 build 前端。", { size: 19 }),
        ]),

        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.4  步驟 4 — Secret 管理", { size: 24, bold: true, color: RED_DK })] }),
        body("Key Vault data-plane 被擋,所以 secret 改用 ACA native secureString,經 ARM parameters 檔傳入。"),
        num([t("複製範本:", { size: 20 }), t("deploy/azure/aca.params.example.json", { mono: true, size: 18 }), t(" → ", { size: 20 }), t("aca.params.uat.json", { mono: true, size: 18 })], 0, 1),
        num("填入真值(範本每個 placeholder 都有說明)。此檔即該環境 deployment secret 嘅單一真相來源。", 0, 1),
        num([t("部署時一律 ", { size: 20 }), t("--parameters @deploy/azure/aca.params.uat.json", { mono: true, size: 18 })], 0, 1),
        p(t("", { size: 12 }), { after: 140 }),
        callout("絕不 commit 真值檔", [
          [t(".gitignore", { mono: true, size: 19 }), t(" 已涵蓋 ", { size: 19 }), t("deploy/azure/*.params.*.json", { mono: true, size: 19 }), t(";repo 只收 template ", { size: 19 }), t("aca.json", { mono: true, size: 19 }), t(" 同無值範本。此檔會 persist(唔會隨 session 清除),重部署直接重用 —— 避免重演「舊 DB 密碼唔知、要繞道 image-only update」。", { size: 19 })],
        ], "danger"),
        p(t("", { size: 12 }), { after: 200 }),
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t("首次生成 secret 值", { size: 21, bold: true })] }),
        code([
          "openssl rand -hex 20         # DB 密碼底(尾加字類湊夠 3 類 → databaseUrl)",
          "openssl rand -base64 48      # authJwtSecret",
          "openssl rand -hex 32         # intakeApiKey",
          "",
          "# 以下經 management plane 取得(唔受 proxy 影響):",
          "az monitor log-analytics workspace show -g <rg> -n <law> --query customerId -o tsv",
          "az acr credential show -n <acr> --query 'passwords[0].value' -o tsv",
        ]),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.5  步驟 5 — 以 ARM 部署 ACA", { size: 24, bold: true, color: RED_DK })] }),
        code([
          "# 先 validate",
          "az deployment group validate -g <rg> --template-file deploy/azure/aca.json \\",
          "  --parameters @deploy/azure/aca.params.uat.json -o json",
          "",
          "az deployment group create -g <rg> -n uop-aca-deploy \\",
          "  --template-file deploy/azure/aca.json \\",
          "  --parameters @deploy/azure/aca.params.uat.json -o json",
          "",
          "# CLI 可能被殺,但 server-side 照跑。真結果:",
          "az deployment group show -g <rg> -n uop-aca-deploy \\",
          "  --query properties.provisioningState -o tsv    # Succeeded",
        ]),
        p(t("", { size: 12 }), { after: 160 }),
        body([
          t("aca.json", { mono: true, size: 19 }),
          t(" 會建立 ACA 環境、", { size: 19 }),
          t("ca-uop-api", { mono: true, size: 19 }),
          t("(internal ingress)同 ", { size: 19 }),
          t("ca-uop-web", { mono: true, size: 19 }),
          t("(external ingress),並輸出 ", { size: 19 }),
          t("webFqdn", { mono: true, size: 19 }),
          t(" 與 ", { size: 19 }),
          t("apiFqdn", { mono: true, size: 19 }),
          t("。", { size: 19 }),
        ]),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.6  步驟 6 — Migration 與 seed(自動)", { size: 24, bold: true, color: RED_DK })] }),
        callout("唔需要人手執行", [
          [t("api 容器 entrypoint(", { size: 19 }), t("apps/api/docker-entrypoint.sh", { mono: true, size: 19 }), t(")喺 ", { size: 19 }), t("RUN_MIGRATIONS_ON_START", { mono: true, size: 19 }), t(" 及 ", { size: 19 }), t("RUN_SEED_ON_START", { mono: true, size: 19 }), t(" 為 true 時,自行執行 ", { size: 19 }), t("prisma migrate deploy", { mono: true, size: 19 }), t(" 與 seed。", { size: 19 })],
          "兩者皆 idempotent,api 為單 replica 故無 race;失敗屬非致命,唔會令容器 crash。",
          "設計原因:operator 喺公司網連唔到 Azure DB data-plane。若喺唔受限網路,可改由 operator 執行並將兩個 flag 設為 false。",
        ], "ok"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("5.7  步驟 7 — Smoke test", { size: 24, bold: true, color: RED_DK })] }),
        body("container log 睇唔到嘅情況下,逐層 curl 用 HTTP status code 精準定位問題層。"),
        code([
          "WEB=https://<web-fqdn>",
          "curl -sS -k -m 30 -o /dev/null -w \"%{http_code}\\n\" $WEB/                    # SPA",
          "curl -sS -k -m 30 -L -o /dev/null -w \"%{http_code}\\n\" $WEB/api/docs/api      # api via proxy",
          "curl -sS -k -m 30 -X POST $WEB/api/auth/login -H 'Content-Type: application/json' \\",
          "  -d '{\"email\":\"admin@uop.local\",\"password\":\"<ADMINPW>\"}'                  # break-glass",
        ]),
        p(t("", { size: 12 }), { after: 200 }),
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t("HTTP code 對照表(W33 實戰)", { size: 21, bold: true })] }),
        table(W2, [
          headRow(["Status", "代表邊一層壞咗"], W2),
          dataRow(["404", "nginx Host header 錯,或 api replica 未 ready"], W2, { monoCols: [0] }),
          dataRow(["301", "ACA internal ingress 迫 https —— 需要 allowInsecure"], W2, { zebra: true, monoCols: [0] }),
          dataRow(["401(login)", "admin 未 seed,即 seed 步驟失敗"], W2, { monoCols: [0] }),
          dataRow(["500", "DB 連唔到,即 migrate 失敗"], W2, { zebra: true, monoCols: [0] }),
          dataRow(["200", "該層正常"], W2, { monoCols: [0] }),
        ]),
        p(t("", { size: 12 }), { after: 160 }),
        body("瀏覽器信任公司 CA,所以毋須 -k。Windows 上如撞 schannel revocation,加 --ssl-no-revoke。", { size: 19, color: MUTED }),

        // ── 6 ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("6  環境變數參考", { size: 30, bold: true })] }),
        body([
          t("完整清單見 ", { size: 20 }),
          t("docs/13-deployment/02-environment-reference.md", { mono: true, size: 18 }),
          t("。下表只列部署時必須決定嘅項目,並標明現行 ARM template 有冇接線。", { size: 20 }),
        ]),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("6.1  Boot-required(缺任何一個都起唔身)", { size: 24, bold: true, color: RED_DK })] }),
        table([3100, 1000, 5538], [
          headRow(["變數", "Secret", "說明"], [3100, 1000, 5538]),
          dataRow(["GRAPH_TENANT_ID", "", "Entra tenant(app-only)"], [3100, 1000, 5538], { monoCols: [0] }),
          dataRow(["GRAPH_CLIENT_ID", "", "app registration client id"], [3100, 1000, 5538], { zebra: true, monoCols: [0] }),
          dataRow(["GRAPH_CLIENT_SECRET", "是", "UAT 目前為 placeholder"], [3100, 1000, 5538], { monoCols: [0] }),
          dataRow(["SERVICENOW_INSTANCE_URL", "", "UAT-tier SN instance"], [3100, 1000, 5538], { zebra: true, monoCols: [0] }),
          dataRow(["SERVICENOW_USER", "", "整合服務帳號"], [3100, 1000, 5538], { monoCols: [0] }),
          dataRow(["SERVICENOW_PASSWORD", "是", "UAT 目前為 placeholder"], [3100, 1000, 5538], { zebra: true, monoCols: [0] }),
          dataRow(["INTAKE_API_KEY", "是", "即使唔用 n8n inbound 都 boot-required"], [3100, 1000, 5538], { monoCols: [0] }),
          dataRow(["AUTH_JWT_SECRET", "是", "本地登入簽名 key,≥32 bytes"], [3100, 1000, 5538], { zebra: true, monoCols: [0] }),
          dataRow(["DATABASE_URL", "是", "含 DB 密碼,需 ?sslmode=require"], [3100, 1000, 5538], { monoCols: [0] }),
        ]),
        p(t("", { size: 12 }), { after: 160 }),
        body([
          t("Graph 與 ServiceNow 喺 constructor 用 ", { size: 19 }),
          t("getOrThrow", { mono: true, size: 18 }),
          t(",所以即使 UAT 唔實測整合都要有值先 boot。淨係要 app 起身 = 合格式佔位值。", { size: 19 }),
        ], { color: MUTED }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("6.2  可選功能 —— 兩本帳:template 同 running container", { size: 24, bold: true, color: RED_DK })] }),
        callout("講 env 狀態必須分清「template 有冇」同「container 有冇」", [
          [t("呢兩樣係", { size: 19 }), t("兩本獨立嘅帳", { size: 19, bold: true }), t("。日常部署走 ", { size: 19 }), t("az containerapp update --image", { mono: true, size: 18 }), t(",完全唔碰 template;而 env 亦可以直接設落 container。所以由「template 冇某個 parameter」", { size: 19 }), t("推論唔到", { size: 19, bold: true }), t("「running container 冇嗰個 env」。", { size: 19 })],
          [t("實測(2026-07-30):", { bold: true, size: 19 }), t("running api container 有 ", { size: 19 }), t("19 個 env", { size: 19, bold: true }), t(";其中 ", { size: 19 }), t("ACS_CONNECTION_STRING", { mono: true, size: 18 }), t("(secretRef)同 ", { size: 19 }), t("ACS_SENDER_ADDRESS", { mono: true, size: 18 }), t(" 早於 2026-07-29 由 owner 直接設落 container。", { size: 19 }), t("即 email 配置齊、寄得出。", { size: 19, bold: true })],
          [t("查法(唔好信文件):", { bold: true, size: 19 }), t("az containerapp show --query \"…env[].{name,secretRef}\"", { mono: true, size: 18 })],
        ], "ok"),
        p(t("", { size: 12 }), { after: 200 }),
        body([
          t("CH-012 嘅真正價值 = 防 regression,唔係「令 email work」。", { bold: true, size: 20 }),
          t("email 本來就 work。但 template 當時冇呢三個 parameter,所以一旦有人走全量 ARM 部署(", { size: 20 }),
          t("az deployment group create", { mono: true, size: 19 }),
          t("),宣告式 template 就會", { size: 20 }),
          t("抹走", { size: 20, bold: true }),
          t("手設落 container 嘅 env,email 靜靜死掉。接線之後兩本帳對齊,呢個風險消失。", { size: 20 }),
        ]),
        p(t("", { size: 12 }), { after: 120 }),
        callout("但「配置齊」仍然唔等於「信寄得出」", [
          [t("呢個 connector ", { size: 19 }), t("冇 probe", { size: 19, bold: true }), t(":sender domain 唔對嗰陣 ACS 會收貨但唔送達,而 API 仍然返 ", { size: 19 }), t("Succeeded", { mono: true, size: 18 }), t("(CH-011 R1)。密碼重設漏 ", { size: 19 }), t("APP_BASE_URL", { mono: true, size: 18 }), t(" 更深一層 —— audit 會寫 ", { size: 19 }), t("reason:'issued'", { mono: true, size: 18 }), t(" 而信一封都冇寄,連 audit 都答唔到「為咩收唔到信」。", { size: 19 })],
          [t("⇒ 唯一證據係收件人真係收到。", { bold: true, size: 19 })],
        ], "warn"),
        p(t("", { size: 12 }), { after: 200 }),
        table([2620, 900, 1350, 1350, 3418], [
          headRow(["變數", "Secret", "template", "container", "注意"], [2620, 900, 1350, 1350, 3418]),
          // cell 收字串時唔會 render markdown —— 寫 **粗體** 會原樣印出星號
          dataRow(["ACS_CONNECTION_STRING", "是", "已接線", "實測已設", "必填(跟 graphClientSecret 嘅 pattern)。env-only,絕不入 DB 或 log"], [2620, 900, 1350, 1350, 3418], { monoCols: [0] }),
          dataRow(["ACS_SENDER_ADDRESS", "", "已接線", "實測已設", "必須係 ACS 已驗證 domain,否則收貨但唔送達。ADMIN 可喺 Settings 覆寫(DB 蓋 env)"], [2620, 900, 1350, 1350, 3418], { zebra: true, monoCols: [0] }),
          dataRow(["APP_BASE_URL", "", "已接線", "實測已設", "砌密碼重設連結用。手填(唔用 reference() —— web 已 dependsOn api,反向會循環依賴)"], [2620, 900, 1350, 1350, 3418], { monoCols: [0] }),
          dataRow(["SYNC_SWEEP_*", "", "刻意唔接", "用 default", "三個 default 就係想要嘅值。要臨時調用 az containerapp update --set-env-vars"], [2620, 900, 1350, 1350, 3418], { zebra: true, monoCols: [0] }),
          dataRow(["N8N_OUTBOUND_*", "是", "刻意唔接", "未設", "provider 現時寫死 direct;要用 n8n outbound 先擴 template"], [2620, 900, 1350, 1350, 3418], { monoCols: [0] }),
        ]),
        p(t("", { size: 12 }), { after: 160 }),
        body([
          t("走全量 ARM 部署之前:", { bold: true, size: 19 }),
          t("確認 gitignored ", { size: 19 }),
          t("aca.params.uat.json", { mono: true, size: 18 }),
          t(" 有 ", { size: 19 }),
          t("acsConnectionString", { mono: true, size: 18 }),
          t(" 真值、", { size: 19 }),
          t("appBaseUrl", { mono: true, size: 18 }),
          t(" 仍係現行 web FQDN —— 否則宣告式 template 會抹走 container 現有嘅值。走 ", { size: 19 }),
          t("--image", { mono: true, size: 18 }),
          t(" 則唔碰 env,無此風險。詳見 CH-012 §8。", { size: 19 }),
        ]),

        // ── 7 ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("7  Rollback 與已烘入配置", { size: 30, bold: true })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("7.1  Rollback", { size: 24, bold: true, color: RED_DK })] }),
        bul("ACA revision:每個 image tag 對應一個 revision。改 params 檔嘅 image tag 返舊版,重跑步驟 5(宣告式,會自動 roll)。"),
        bul([t("捷徑(唔掂 secret):", { bold: true, size: 20 }), t("az containerapp update --image", { mono: true, size: 19 }), t(" 只換 image、保留現有 secret 與 config,DB 密碼同 admin 密碼全部不變。", { size: 20 })]),
        bul("DB:Prisma migrate 冇 auto-down,靠 RCI daily 備份還原。部署前應確認備份生效。"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("7.2  已烘入 artifact 嘅五項配置", { size: 24, bold: true, color: RED_DK })] }),
        body("以下皆為落地時踩過、現已修入 artifact 嘅配置。重部署唔會再遇,但改動相關檔案時要知。"),
        table([700, 4400, 4538], [
          headRow(["#", "配置", "所在檔案"], [700, 4400, 4538]),
          dataRow(["1", "entrypoint 非致命(migrate / seed 失敗唔 crash 容器)", "apps/api/docker-entrypoint.sh"], [700, 4400, 4538], { monoCols: [2], boldCols: [0] }),
          dataRow(["2", "nginx 用 Host $proxy_host(唔可用 $host,否則 404)", "nginx.conf.template"], [700, 4400, 4538], { zebra: true, monoCols: [2], boldCols: [0] }),
          dataRow(["3", "api ingress allowInsecure: true(否則 http upstream 被 301)", "deploy/azure/aca.json"], [700, 4400, 4538], { monoCols: [2], boldCols: [0] }),
          dataRow(["4", "runtime npm ci --include=dev(否則 ts-node seed 跑唔到)", "apps/api/Dockerfile"], [700, 4400, 4538], { zebra: true, monoCols: [2], boldCols: [0] }),
          dataRow(["5", "rootDir 釘死 emit 佈局 + build gate(BUG-008)", "tsconfig.build.json · Dockerfile"], [700, 4400, 4538], { monoCols: [2], boldCols: [0] }),
        ]),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("7.3  Gotchas 清單", { size: 24, bold: true, color: RED_DK })] }),
        bul("az 指令必須 sequential;並發會互鎖 hang"),
        bul("CLI charmap crash 屬假象,真結果查 management plane"),
        bul([t("az postgres flexible-server create", { mono: true, size: 19 }), t(" 此版本冇 ", { size: 20 }), t("--database-name", { mono: true, size: 19 }), t(",要分兩步建 DB", { size: 20 })]),
        bul([t("NODE_ENV=production", { mono: true, size: 19 }), t(" 加 ", { size: 20 }), t("npm ci", { mono: true, size: 19 }), t(" 會 omit devDependencies,連累 ts-node seed", { size: 20 })]),
        bul("ACA app-to-app:Host 必須係 upstream host;internal ingress 需要 allowInsecure 或 https upstream"),
        bul([t("--public-access 0.0.0.0", { mono: true, size: 19 }), t(" 等於「允許 Azure 服務」,hardening 時應收窄", { size: 20 })]),

        // ── 8 ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("8  文件現況核對結果", { size: 30, bold: true })] }),
        body([
          t("本節記錄 2026-07-30 對 ", { size: 20 }),
          t("docs/13-deployment/", { mono: true, size: 18 }),
          t(" 全部文件所做嘅新鮮度核對。方法:比對每份文件最後 commit 日期、其後合併嘅變更、以及 artifact(", { size: 20 }),
          t("aca.json", { mono: true, size: 18 }),
          t("、", { size: 20 }),
          t(".env.example", { mono: true, size: 18 }),
          t("、", { size: 20 }),
          t("tsconfig.build.json", { mono: true, size: 18 }),
          t(")嘅實際內容。", { size: 20 }),
        ]),
        table([3150, 1050, 5438], [
          headRow(["文件", "最後更新", "核對結果"], [3150, 1050, 5438]),
          dataRow(["README.md", "07-27", "狀態段仍以 W33 / W34 為最新,未反映 BUG-008 後嘅實際 image"], [3150, 1050, 5438], { monoCols: [0, 1] }),
          dataRow(["01-topology.md", "07-22", "🔴 四處把 hardening 目標當成現況寫:secret / DB 存取 / ACR 認證 / SSO"], [3150, 1050, 5438], { zebra: true, monoCols: [0, 1] }),
          dataRow(["02-environment-reference.md", "07-22", "缺六個變數:ACS 兩個、APP_BASE_URL、SYNC_SWEEP 三個"], [3150, 1050, 5438], { monoCols: [0, 1] }),
          dataRow(["03-build-images.md", "07-22", "仍寫 node dist/main 而未提 rootDir 約束;「未驗證項」已過時"], [3150, 1050, 5438], { zebra: true, monoCols: [0, 1] }),
          dataRow(["04-deploy-runbook.md", "07-23", "§8 只列四項(BUG-008 應為第五);secret 清單缺 ACS"], [3150, 1050, 5438], { monoCols: [0, 1] }),
          dataRow(["05-rci-par-process.md", "07-22", "亦寫 secret 存 Key Vault;但 PAR 係提交畀 RCI 嘅申請文件 → 交 owner 判斷"], [3150, 1050, 5438], { zebra: true, monoCols: [0, 1] }),
          dataRow(["06-prod-hardening-checklist.md", "07-22", "已確認無落差 —— 佢本身係 unchecked 目標清單,寫 Key Vault 正確"], [3150, 1050, 5438], { monoCols: [0, 1] }),
          dataRow(["07-uat-as-built.md", "07-23", "image tag 過時;secret 策略與 04 矛盾"], [3150, 1050, 5438], { zebra: true, monoCols: [0, 1] }),
          dataRow(["08-n8n-integration-go-live.md", "07-28", "§1.0 前提過時 —— 仍以 uat-0cf0cf3 推斷 W36 route 未部署"], [3150, 1050, 5438], { monoCols: [0, 1] }),
        ]),
        p(t("", { size: 12 }), { after: 220 }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t("8.1  修正狀態", { size: 24, bold: true, color: RED_DK })] }),
        body("全部七項已於同日處理。部署 artifact 那項走 Change 流程(CH-012,spec approved 後才動 template)。"),
        table([1150, 5450, 3038], [
          headRow(["狀態", "項目", "檔案"], [1150, 5450, 3038]),
          dataRow(["已接線", "CH-012:+3 parameter · +1 secret · +3 env;bicep 同步 · params 範本加 placeholder。令 template 同 container 對齊,消除「全量 ARM 部署抹走手設 env」嘅風險", "deploy/azure/aca.json"], [1150, 5450, 3038], { monoCols: [2], boldCols: [0], shade: AMBER_BG }),
          dataRow(["已修", "補六個可選變數,逐個標明 secret 與 code 呼叫點", "02-environment-reference.md"], [1150, 5450, 3038], { monoCols: [2] }),
          dataRow(["已修", "新增「emit 佈局」一節記錄 rootDir 約束;「未驗證項」改為驗證狀態", "03-build-images.md"], [1150, 5450, 3038], { zebra: true, monoCols: [2] }),
          dataRow(["已修", "§8 加入 BUG-008 成為第五項;§10 加兩條 gotcha", "04-deploy-runbook.md"], [1150, 5450, 3038], { monoCols: [2] }),
          dataRow(["已修", "image tag 改 uat-1bc7cdb + revision;secret 策略對齊 04;deferred 加 email 接線", "07-uat-as-built.md"], [1150, 5450, 3038], { zebra: true, monoCols: [2] }),
          dataRow(["已修", "§1.0 前提更正 —— route 應已隨 uat-1bc7cdb 部署(未實測,保留探測法)", "08-n8n-integration-go-live.md"], [1150, 5450, 3038], { monoCols: [2] }),
          dataRow(["已修", "狀態段更新現行 image + 標示 email 缺口;文件索引加本 docx", "README.md"], [1150, 5450, 3038], { zebra: true, monoCols: [2] }),
          dataRow(["已修", "四處由 hardening 目標改回 as-built(secret / DB / ACR / SSO);刪走一條唔存在嘅 Key Vault 連線;加對照表", "01-topology.md"], [1150, 5450, 3038], { monoCols: [2] }),
        ]),
        p(t("", { size: 12 }), { after: 200 }),
        callout("核對範圍聲明", [
          [t("九份文件已全部核對。", { size: 18, bold: true }), t("餘下唯一未決:", { size: 18 }), t("05-rci-par-process.md", { mono: true, size: 17 }), t(" 亦寫「secret 存 Key Vault」,但佢係提交畀 RCI 治理嘅申請文件,描述目標架構有可能係刻意 —— ", { size: 18 }), t("需 owner 判斷要唔要改成 as-built,或者補一句「上線後 hardening」。", { size: 18, bold: true })],
          [t("01 一度被判為「架構本身無變、未逐項核對」——", { size: 18, bold: true }), t(" 實際上佢嘅「資源清單(UAT)」把四樣 hardening 目標當成現況寫。教訓同 08 那條一樣:", { size: 18 }), t("「內容應該無變」係假設,唔係核對。", { size: 18, bold: true })],
          [t("08 一度被判為「無落差」,後來發現 §1.0 仍以 ", { size: 18 }), t("uat-0cf0cf3", { mono: true, size: 17 }), t(" 推斷 W36 route 未部署 —— 已更正。可見「最後 commit 日期新」唔等於內容最新。", { size: 18 })],
          [t("🔴 本核對本身犯過一次同類錯:", { size: 18, bold: true }), t("由 ", { size: 18 }), t("aca.json", { mono: true, size: 17 }), t(" 冇 ACS parameter,推論 running container「只有 16 個 env、email 唔會 work」。", { size: 18 }), t("實測係 19 個,ACS 兩個早已直接設落 container ——", { size: 18, bold: true }), t(" email 一直寄得出。根因係「template 有冇」同「container 有冇」兩本帳被混埋一齊講(見 6.2)。教訓:講 env 狀態一律實測,唔好由 template 推論。", { size: 18 })],
        ], "warn"),

        p(t("", { size: 12 }), { after: 300 }),
        rule(LINE, 6),
        body([
          t("本文件由 ", { size: 16, color: MUTED }),
          t("docs/13-deployment/", { mono: true, size: 15, color: MUTED }),
          t(" 各份 runbook、ADR-0012 / 0015 / 0019、BUG-008 報告及 repo artifact 彙整而成。內容以核對當日(2026-07-30)嘅 ", { size: 16, color: MUTED }),
          t("main", { mono: true, size: 15, color: MUTED }),
          t(" 為準。", { size: 16, color: MUTED }),
        ], { align: AlignmentType.LEFT }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("wrote " + OUT + "  (" + buf.length + " bytes)");
});
