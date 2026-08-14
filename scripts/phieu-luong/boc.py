# -*- coding: utf-8 -*-
"""Tang 1 — boc phieu luong 給与明細 (PDF) ra JSON. THUAN CUC BO: khong mang, khong DB.
Xem docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md

Chay:
  pip install pypdf cryptography          # PDF ma hoa AES mat khau rong
  python scripts/phieu-luong/boc.py "<thu muc PDF>" [-o phieu-luong.json]

VI SAO PYTHON, khong phai .mjs nhu cac script khac: pypdf da chay that tren ca 55
phieu cua so nay. Doi sang unpdf/pdfjs nghia la kiem lai 55 file bang thu vien
chua do, doi lay con so khong. Khong them vao package.json — day khong phai phu
thuoc cua app, va tang 2 (ghi DB) van la .mjs theo dung khuon repo.

============================================================================
LUAT GHEP NHAN <-> SO, va ba lan sai truoc khi ra luat nay
============================================================================

Do toa do that tren (0004)202202K.pdf:

  nhan  y=283.3:  健康保険料 69.4 · 厚生年金保険 138.1 · 厚生年金基金 211.8
                  雇用保険料 291.9 · 所得税 375.6 · 住民税 447.9
  so    y=309.5:  13,720 95.2 · 25,620 168.9 · 874 335.7 · 3,080 395.5 · 5,500 469.2

SO canh PHAI trong cot, NHAN canh TRAI. Nen do lech nhan->so thay doi theo do rong
so: 874 (ba chu so) lech 43.8pt, 13,720 lech 25.8pt.

LUAT: mot so thuoc ve NHAN GAN NHAT VE PHIA TRAI no, trong hang nhan gan nhat BEN
DUOI ma co nhan hop le. Nhan bo trong tu nhien khong nhan gi (厚生年金基金 o vi du
tren, va その他).

Ba cai bay, ca ba da mac that:

(1) Ghep theo "gan tam nhat" + nguong 42pt: roi han nhan 雇用保険料 o 6 file
    2022-2023, vi 874 cach 43.8pt — vua vuot nguong. Trong im lang.

(2) Chi nhin len DUNG MOT hang nhan: layout tu 2026/06 chen mot hang muc con
    一般保険料/子育支援金 giua hang so va hang nhan tong, nen 総支給金額 bat nham
    so 540. Phai duyet nhieu hang (YMAX du rong).

(3) Chu KHOI dung doc o le trai (支給/控除/勤怠...) nam o x~42, tuc cach 13,720
    (x=95.2) dung 53.2pt — TRONG nguong — nen chung GIANH mat so cua 健康保険料
    roi vong lap dung. Loi nay nam san tu dau nhung bi loi (1) che: sua (1) xong
    thi ca 55 file hong cung luc. Phai loai MARKERS truoc khi ghep.

Bai hoc: mot bo kiem "44/55 dung" co the dang che mot loi lam sai ca 55.
"""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("Thieu pypdf. Chay:  pip install pypdf cryptography")

# --- Nhan dang o chu -------------------------------------------------------
MONEY = re.compile(r"^-?\d{1,3}(?:,\d{3})*$|^-?\d+$")
# Gio (176:50) va ngay cong (22.0) thuoc khoi 勤怠, KHONG phai tien.
TIMEISH = re.compile(r"\d+:\d\d|^\d+\.\d$")
HAS_CJK = re.compile(r"[぀-鿿]")
KY_TRONG_PDF = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月分\s*(給与|賞与)?")
TEN_FILE = re.compile(r"\((\d+)\)(\d{4})(\d{2})?([KS])")

# --- Bo nhan (do tren ca 55 phieu) ----------------------------------------
# Cong vao 控除合計額. Tam nhan cuoi khong phai thue — xem map o tang 2.
KHAU_TRU = [
    "健康保険料", "厚生年金保険", "厚生年金基金", "雇用保険料",
    "所得税", "住民税", "社内販売精算", "その他",
]
# Muc CON cua 健康保険料 (layout tu 2026/06). KHONG cong: 23.148 + 540 = 23.688.
MUC_CON = ["一般保険料", "子育支援金"]
# NGOAI 控除合計額 nhung VAN doi tien thuc -> ghi thanh dong rieng, khong duoc bo.
NGOAI_TONG = ["過不足税額"]
# So theo doi phan DUOC GIAM, KHONG phai khoan bi tru. Coi la khoan tru lam
# 202406K phong dung 60.000 ¥ (30.000 + 9.750 + 20.250) trong mot thang.
DINH_MUC_GIAM = ["月次減税額", "定額減税額(所得税)", "定額減税未済額"]
TONG = ["総支給金額", "控除合計額", "差引支給額", "銀行１振込額"]
# Phia 支給 — Cach B khong dung, nhung phai biet ten de khong bao "nhan la".
CAP = [
    "基本給", "残業手当", "通勤手当", "立替経費精算", "立替経費",
    "不就労控除", "基本賞与", "DB掛金",
]
KHONG_PHAI_TIEN = [
    "出勤時間", "遅早時間", "残業時間", "深夜残業時間", "休出残業時間", "欠勤時間",
    "出勤日数", "休出日数", "有休日数", "欠勤日数", "有休残", "時間有休残", "特休日数",
    "残業予備２", "残業予備３", "残業予備４", "残業予備５",
    "現金支給額", "翌月繰越額", "前月繰越額", "社員番号",
]
# Chu khoi dung doc o le trai + chu header. Xem bay (3) o dau file.
MARKERS = {"支", "給", "控", "除", "勤", "怠", "他", "氏", "名", "所", "属", "様", "氏名"}
BIET_HET = set(KHAU_TRU + MUC_CON + NGOAI_TONG + DINH_MUC_GIAM + TONG
               + CAP + KHONG_PHAI_TIEN) | MARKERS

# --- Tham so hinh hoc (da chay dung 55/55) --------------------------------
YROW = 3.0      # sai so gom o chu ve cung mot hang
YMAX = 64.0     # xa nhat tu so xuong nhan; du de vuot mot hang chen — bay (2)
XMAX = 72.0     # xa nhat tu nhan sang phai den so cua no
XSLACK = 6.0    # so duoc nhu ra trai nhan mot chut


def o_chu(page):
    """[(text, x, y)] cho moi o chu khong rong."""
    out = []

    def visit(text, cm, tm, font_dict, font_size):
        s = (text or "").strip()
        if s:
            out.append((s, tm[4], tm[5]))

    page.extract_text(visitor_text=visit)
    return out


def tach(ch):
    so, nhan = [], []
    for s, x, y in ch:
        t = s.replace(" ", "")
        if TIMEISH.search(t):
            continue
        if MONEY.match(t):
            so.append((int(t.replace(",", "")), x, y))
        elif HAS_CJK.search(t):
            nhan.append((t, x, y))
    return so, nhan


def gom_hang(items):
    """[(y_dai_dien, [items])] giam dan theo y (tren xuong duoi tren trang)."""
    hang = []
    for it in sorted(items, key=lambda t: -t[2]):
        if hang and abs(hang[-1][0] - it[2]) <= YROW:
            hang[-1][1].append(it)
        else:
            hang.append((it[2], [it]))
    return hang


def ghep(so, nhan):
    """{nhan: so} theo luat canh le o dau file."""
    nhan = [n for n in nhan if n[0] not in MARKERS]
    hang_nhan = gom_hang(nhan)
    res = {}
    for v, sx, sy in so:
        for hy, items in hang_nhan:
            if hy >= sy or sy - hy > YMAX:
                continue
            ung = [n for n in items if -XSLACK <= (sx - n[1]) <= XMAX]
            if not ung:
                continue  # hang nay khong co nhan o tam -> thu hang duoi
            n = max(ung, key=lambda n: n[1])   # gan nhat VE PHIA TRAI
            res.setdefault(n[0], v)
            break
    return res


def doc_ky(chunks, ten_file):
    """(period 'YYYYMM', kind 'K'|'S', nguon, canh_bao).

    Uu tien NOI DUNG PDF: (0004)202209S.pdf ten ghi 202209 nhung trong ghi
    2022年7月分賞与, va khoan that nam o 2022-07-08. Nhung 202308S/202402S lai
    khong doc duoc ky tu noi dung, luc do ten file moi dung. KHONG nguon nao du
    mot minh — nen lay ca hai va bao khi lech.
    """
    fn = TEN_FILE.match(ten_file)
    ten_ky = (fn.group(2) + (fn.group(3) or "")) if fn else None
    kind = fn.group(4) if fn else None
    m = KY_TRONG_PDF.search("".join(chunks))
    noi_ky = "%s%02d" % (m.group(1), int(m.group(2))) if m else None
    loai_pdf = m.group(3) if (m and m.group(3)) else None

    canh_bao = []
    if loai_pdf:
        mong_doi = "給与" if kind == "K" else "賞与"
        if loai_pdf != mong_doi:
            canh_bao.append("ten file '%s' nhung noi dung '%s'" % (kind, loai_pdf))
    if noi_ky and ten_ky and noi_ky != ten_ky:
        canh_bao.append("ky lech: ten=%s noi-dung=%s" % (ten_ky, noi_ky))
    ky = noi_ky or ten_ky
    return ky, kind, ("noi-dung" if noi_ky else "ten-file"), canh_bao


def doc(path):
    r = PdfReader(str(path))
    ch = o_chu(r.pages[0])
    f = ghep(*tach(ch))
    ky, kind, nguon, canh_bao = doc_ky([c[0] for c in ch], Path(path).name)
    fn = TEN_FILE.match(Path(path).name)
    tru = {k: v for k, v in f.items() if k in KHAU_TRU}
    ngoai = {k: v for k, v in f.items() if k in NGOAI_TONG}
    return {
        "file": Path(path).name,
        "empno": fn.group(1) if fn else None,
        "period": ky,
        "kind": kind,
        "nguon_ky": nguon,
        "canh_bao": canh_bao,
        "gross": f.get("総支給金額"),
        "deduct_total": f.get("控除合計額"),
        "net": f.get("差引支給額"),
        "bank": f.get("銀行１振込額"),
        "tru": tru,
        "ngoai_tong": ngoai,
        "nhan_la": sorted(k for k in f if k not in BIET_HET),
    }


def kiem(r):
    """Hai dang thuc tu kiem + nhan la. Rong = qua het."""
    loi = []
    g, d, n, b = r["gross"], r["deduct_total"], r["net"], r["bank"]
    q = sum(r["ngoai_tong"].values())

    if d is None:
        loi.append("thieu 控除合計額")
    else:
        s = sum(r["tru"].values())
        if s != d:
            loi.append("tong muc tru %d != 控除合計額 %d (lech %d)" % (s, d, s - d))
    if None in (g, d, n):
        loi.append("thieu mot trong 総支給/控除合計/差引支給")
    elif g - d - q != n:
        loi.append("総支給-控除合計-過不足 != 差引支給 (%d-%d-%d=%d, thuc=%d)"
                   % (g, d, q, g - d - q, n))
    if n is not None and b is not None and n != b:
        loi.append("差引支給 %d != 銀行１振込額 %d" % (n, b))
    if r["nhan_la"]:
        loi.append("nhan la (khong co trong bo nhan): " + ", ".join(r["nhan_la"]))
    if not r["period"] or not r["kind"]:
        loi.append("khong doc duoc ky/loai")
    return loi


def main():
    ap = argparse.ArgumentParser(description="Boc phieu luong PDF ra JSON")
    ap.add_argument("thu_muc", help="thu muc chua cac file PDF")
    ap.add_argument("-o", "--ra", default="phieu-luong.json", help="file JSON dau ra")
    a = ap.parse_args()

    src = Path(a.thu_muc)
    if not src.is_dir():
        sys.exit("Khong phai thu muc: %s" % src)

    rows = []
    for p in sorted(src.glob("*.pdf")):
        try:
            r = doc(p)
            r["loi"] = kiem(r)
        except Exception as e:
            r = {"file": p.name, "loi": ["EXC %s: %s" % (type(e).__name__, e)]}
        rows.append(r)

    Path(a.ra).write_text(json.dumps(rows, ensure_ascii=False, indent=1),
                          encoding="utf-8")

    w = sys.stdout.buffer.write
    ok = [r for r in rows if not r["loi"]]
    w(("%d phieu | qua het chot: %d | con loi: %d  ->  %s\n"
       % (len(rows), len(ok), len(rows) - len(ok), a.ra)).encode())
    for r in rows:
        if r["loi"]:
            w(("  X %-26s %s\n" % (r["file"], " ; ".join(r["loi"]))).encode("utf-8"))
        elif r.get("canh_bao"):
            w(("  ! %-26s %s\n" % (r["file"], " ; ".join(r["canh_bao"]))).encode("utf-8"))
    return 0 if len(ok) == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
