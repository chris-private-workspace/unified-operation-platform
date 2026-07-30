"""畫部署文件用嘅兩張 diagram(PIL,超取樣抗鋸齒)。

PIL 嘅 rectangle / line 冇 anti-alias,所以一律用 SCALE 倍大細畫,
最後 LANCZOS 縮返 —— 出嚟嘅邊同箭頭先夠平滑,印落 Word 唔會鋸。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
SCALE = 3

RED = (230, 0, 39)
INK = (26, 26, 26)
MUTED = (107, 114, 128)
LINE = (209, 213, 219)
LIGHT = (249, 250, 251)
WHITE = (255, 255, 255)
DARK = (17, 24, 39)
AMBER = (180, 83, 9)
AMBER_BG = (255, 251, 235)

JHENG = r"C:\Windows\Fonts\msjh.ttc"
CONSOLA = r"C:\Windows\Fonts\consola.ttf"


def font(size, mono=False, bold=False):
    s = size * SCALE
    if mono:
        return ImageFont.truetype(CONSOLA, s)
    # msjh.ttc:index 0 = 微軟正黑體,index 1 = 粗體
    return ImageFont.truetype(JHENG, s, index=1 if bold else 0)


def box(d, xy, *, fill=WHITE, outline=LINE, width=1, radius=8):
    x0, y0, x1, y1 = [v * SCALE for v in xy]
    d.rounded_rectangle([x0, y0, x1, y1], radius=radius * SCALE,
                        fill=fill, outline=outline, width=width * SCALE)


def text(d, xy, s, *, f, fill=INK, anchor="la"):
    d.text((xy[0] * SCALE, xy[1] * SCALE), s, font=f, fill=fill, anchor=anchor)


def arrow(d, start, end, *, color=MUTED, width=2, head=7):
    """直線箭頭(只支援垂直 / 水平,足夠呢兩張圖)。"""
    x0, y0 = [v * SCALE for v in start]
    x1, y1 = [v * SCALE for v in end]
    w = width * SCALE
    h = head * SCALE
    d.line([x0, y0, x1, y1], fill=color, width=w)
    if x0 == x1:                              # 垂直
        dy = h if y1 > y0 else -h
        d.polygon([(x1, y1), (x1 - h * 0.6, y1 - dy), (x1 + h * 0.6, y1 - dy)], fill=color)
    else:                                     # 水平
        dx = h if x1 > x0 else -h
        d.polygon([(x1, y1), (x1 - dx, y1 - h * 0.6), (x1 - dx, y1 + h * 0.6)], fill=color)


def canvas(w, h):
    img = Image.new("RGB", (w * SCALE, h * SCALE), WHITE)
    return img, ImageDraw.Draw(img)


def save(img, name, w):
    # 高度要跟住目標寬度按比例算。用 height/SCALE 會令縱向獨立縮放,
    # 圖被壓扁 —— 垂直箭頭首先陣亡。
    img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    out = HERE / name
    img.save(out, "PNG")
    print(f"{name}  {img.width}x{img.height}")
    return out


# ─────────────────────────────────────────────────────────────
# Diagram 1 — Topology
# ─────────────────────────────────────────────────────────────
def topology():
    W, H = 660, 372
    img, d = canvas(W, H)

    f_lbl = font(9.5)
    f_lbl_b = font(10, bold=True)
    f_mono = font(8, mono=True)
    f_tiny = font(8)
    f_tiny_b = font(8.5, bold=True)

    CX = 330            # 畫布中線

    # Internet
    text(d, (CX, 8), "Internet", f=f_lbl_b, fill=INK, anchor="ma")
    arrow(d, (CX, 26), (CX, 48))
    text(d, (CX + 8, 30), "HTTPS", f=f_mono, fill=MUTED)

    # ACA ingress
    box(d, (130, 50, 530, 84), fill=DARK, outline=DARK)
    text(d, (CX, 60), "Azure Container Apps — Ingress", f=f_lbl_b, fill=WHITE, anchor="ma")
    text(d, (CX, 73), "單一 hostname(對外只此一個)", f=f_tiny, fill=(190, 197, 210), anchor="ma")

    # 分岔去兩個 container
    d.line([CX * SCALE, 84 * SCALE, CX * SCALE, 100 * SCALE], fill=MUTED, width=2 * SCALE)
    d.line([195 * SCALE, 100 * SCALE, 465 * SCALE, 100 * SCALE], fill=MUTED, width=2 * SCALE)
    arrow(d, (195, 100), (195, 126))
    arrow(d, (465, 100), (465, 126))
    text(d, (188, 104), "/", f=f_mono, fill=MUTED, anchor="ra")
    text(d, (472, 104), "/api/*", f=f_mono, fill=MUTED)

    # web container
    box(d, (105, 128, 285, 186), outline=LINE)
    text(d, (195, 137), "ca-uop-web", f=f_lbl_b, anchor="ma")
    text(d, (195, 152), "nginx · serve SPA static", f=f_tiny, fill=MUTED, anchor="ma")
    text(d, (195, 165), "external ingress · :8080", f=f_mono, fill=MUTED, anchor="ma")

    # api container
    box(d, (375, 128, 555, 186), outline=LINE)
    text(d, (465, 137), "ca-uop-api", f=f_lbl_b, anchor="ma")
    text(d, (465, 152), "NestJS", f=f_tiny, fill=MUTED, anchor="ma")
    text(d, (465, 165), "internal ingress · :3000", f=f_mono, fill=MUTED, anchor="ma")

    # web → api（nginx proxy）
    arrow(d, (285, 157), (373, 157), color=RED, width=2)
    text(d, (329, 142), "proxy", f=f_tiny_b, fill=RED, anchor="ma")

    # api 底下分岔:落 DB(左)同 ACS(右)—— 兩個都係 api 嘅 downstream,
    # 唔可以將 ACS 掛喺 DB 底下,嗰樣讀落好似 DB 去寄信。
    d.line([465 * SCALE, 186 * SCALE, 465 * SCALE, 202 * SCALE], fill=MUTED, width=2 * SCALE)
    d.line([390 * SCALE, 202 * SCALE, 555 * SCALE, 202 * SCALE], fill=MUTED, width=2 * SCALE)
    arrow(d, (390, 202), (390, 222), width=2, head=6)
    arrow(d, (555, 202), (555, 222), color=AMBER, width=2, head=6)

    # PostgreSQL
    box(d, (312, 224, 468, 282), outline=LINE, fill=LIGHT)
    text(d, (390, 232), "PostgreSQL Flexible", f=f_lbl_b, anchor="ma")
    text(d, (390, 247), "v16 · DB platform", f=f_tiny, fill=MUTED, anchor="ma")
    text(d, (390, 262), "?sslmode=require", f=f_mono, fill=MUTED, anchor="ma")

    # ACS —— 未 wire,重點標示
    box(d, (478, 224, 634, 282), outline=AMBER, fill=AMBER_BG, width=2)
    text(d, (556, 230), "Azure Communication", f=f_lbl_b, fill=AMBER, anchor="ma")
    text(d, (556, 243), "Services(email)", f=f_lbl_b, fill=AMBER, anchor="ma")
    text(d, (556, 258), "CH-011 / ADR-0019", f=f_tiny, fill=AMBER, anchor="ma")
    text(d, (556, 269), "container 實測已配置 — 見 §6", f=f_tiny_b, fill=AMBER, anchor="ma")

    # 左側支援資源
    text(d, (30, 206), "支援資源", f=f_tiny_b, fill=MUTED)
    for i, (name, note) in enumerate([
        ("ACR  acruopuat", "image registry"),
        ("Log Analytics", "container log"),
        ("Key Vault", "建咗未 wire"),
    ]):
        y = 222 + i * 32
        box(d, (30, y, 270, y + 27), outline=LINE, fill=LIGHT, radius=6)
        text(d, (40, y + 3), name, f=f_tiny_b, anchor="la")
        text(d, (40, y + 15), note, f=f_tiny, fill=MUTED, anchor="la")

    # 底註
    text(d, (CX, 340), "單一 origin 係硬需求:本地 session 用 SameSite=Strict httpOnly cookie,",
         f=f_tiny, fill=MUTED, anchor="ma")
    text(d, (CX, 354), "跨 origin 唔會帶 → web 同 api 必須同一 hostname(ADR-0012)。",
         f=f_tiny, fill=MUTED, anchor="ma")

    return save(img, "topology.png", 1240)


# ─────────────────────────────────────────────────────────────
# Diagram 2 — 部署流程
# ─────────────────────────────────────────────────────────────
def pipeline():
    W, H = 620, 232
    img, d = canvas(W, H)

    f_step = font(8.5, bold=True)
    f_note = font(7.5)
    f_num = font(9, bold=True)
    f_tiny_b = font(8.5, bold=True)
    f_note_m = font(7, mono=True)

    steps = [
        ("前置", "az login · SP 權限\n命名 · region"),
        ("Provision", "ACR · PostgreSQL\nLAW · Key Vault"),
        ("Build", "az acr build\n(Azure 側)"),
        ("Secrets", "params 檔\nACA secureString"),
        ("Deploy", "az deployment\ngroup create"),
        ("Migrate", "container 自跑\n(entrypoint)"),
        ("Smoke", "逐層 curl\nHTTP code 定位"),
    ]

    x = 18
    bw, bh = 78, 74
    gap = 8
    for i, (title, note) in enumerate(steps):
        y = 56
        auto = i == 5
        box(d, (x, y, x + bw, y + bh),
            fill=LIGHT if not auto else (240, 253, 244),
            outline=LINE if not auto else (34, 150, 94), radius=7,
            width=1 if not auto else 2)
        # 步驟號
        d.ellipse([(x + 6) * SCALE, (y + 6) * SCALE, (x + 24) * SCALE, (y + 24) * SCALE],
                  fill=RED if not auto else (34, 150, 94))
        text(d, (x + 15, y + 9), str(i + 1), f=f_num, fill=WHITE, anchor="ma")
        text(d, (x + bw / 2, y + 30), title, f=f_step, anchor="ma")
        for j, ln in enumerate(note.split("\n")):
            text(d, (x + bw / 2, y + 45 + j * 11), ln, f=f_note, fill=MUTED, anchor="ma")

        if i < len(steps) - 1:
            arrow(d, (x + bw + 1, y + bh / 2), (x + bw + gap - 1, y + bh / 2), width=2, head=5)
        x += bw + gap

    # 頂部:兩條紀律
    box(d, (18, 10, 602, 42), fill=(254, 242, 242), outline=RED, radius=6)
    text(d, (30, 16), "兩條操作紀律(貫穿全部步驟)", f=f_tiny_b, fill=RED)
    # 唔用 ✔ / ⚠ 呢類符號 —— msjh 冇 glyph,PIL 會畫成豆腐格
    text(d, (30, 29), "① az 一律 sequential —— 並發會互鎖 hang    "
                      "② CLI 印 Unicode 勾號會 charmap crash(exit 1 假象)→ 真結果查 management plane",
         f=f_note, fill=RED)

    # 底部:自動 vs 人手
    text(d, (18, 146), "圖例", f=f_tiny_b, fill=MUTED)
    d.ellipse([26 * SCALE, 163 * SCALE, 38 * SCALE, 175 * SCALE], fill=RED)
    text(d, (46, 164), "operator(SP)執行", f=f_note, fill=MUTED)
    d.ellipse([26 * SCALE, 181 * SCALE, 38 * SCALE, 193 * SCALE], fill=(34, 150, 94))
    text(d, (46, 182), "container 啟動時自動(operator 喺公司網連唔到 DB data-plane)", f=f_note, fill=MUTED)

    text(d, (18, 206), "公司 proxy 只放行 management plane(management.azure.com),擋晒 data-plane ——",
         f=f_note, fill=MUTED)
    text(d, (18, 218), "所以 build 上 Azure 側做、secret 走 ARM、migrate 由容器自己跑。",
         f=f_note, fill=MUTED)

    return save(img, "pipeline.png", 1240)


if __name__ == "__main__":
    topology()
    pipeline()
