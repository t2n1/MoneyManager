// Luật bóc phiếu lương 給与明細 — THUẦN, không đọc PDF.
// Xem docs/superpowers/specs/2026-08-15-import-phieu-luong-web-design.md
//
// Vì sao nhận OChu[] thay vì tự đọc PDF: một phần để chạy được cả trong trình duyệt
// lẫn Node, nhưng lý do quan trọng hơn là TEST KHÔNG CẦN FILE PDF NÀO — bơm ô chữ
// giả với toạ độ đã biết là kiểm được luật ghép trực tiếp, và một lỗi ghép không bị
// lẫn với một lỗi đọc.
//
// Hệ quy chiếu: y TĂNG LÊN TRÊN (hệ của pypdf). Adapter phải lật trước khi gọi vào
// đây — mọi hằng số dưới đây đã tinh chỉnh theo hệ này.

export interface OChu {
  text: string
  x: number
  y: number
}

const MONEY = /^-?\d{1,3}(?:,\d{3})*$|^-?\d+$/
/** Giờ (176:50) và ngày công (22.0) thuộc khối 勤怠, KHÔNG phải tiền. */
const TIMEISH = /\d+:\d\d|^\d+\.\d$/
const HAS_CJK = /[\u3040-\u9fff]/

/** Khối 控除 — cộng vào 控除合計額. Hai nhãn cuối KHÔNG phải thuế (xem nhap.ts). */
export const KHAU_TRU = [
  '健康保険料', '厚生年金保険', '厚生年金基金', '雇用保険料',
  '所得税', '住民税', '社内販売精算', 'その他',
] as const
/** Mục CON của 健康保険料 (layout từ 2026/06). KHÔNG cộng: đã nằm trong 健康保険料. */
export const MUC_CON = ['一般保険料', '子育支援金'] as const
/** NGOÀI 控除合計額 nhưng VẪN đổi tiền thật → ghi thành dòng riêng, không được bỏ. */
export const NGOAI_TONG = ['過不足税額'] as const
/** Sổ theo dõi phần ĐƯỢC GIẢM, không phải khoản bị trừ. Coi là khoản trừ làm thuế
 *  một tháng phồng lên bằng cả tổng bộ ba. */
export const DINH_MUC_GIAM = ['月次減税額', '定額減税額(所得税)', '定額減税未済額'] as const
const TONG = ['総支給金額', '控除合計額', '差引支給額', '銀行１振込額'] as const
/** Phía 支給 — không dùng để dựng bút toán, nhưng phải biết tên để không báo "nhãn lạ". */
const CAP = [
  '基本給', '残業手当', '通勤手当', '立替経費精算', '立替経費',
  '不就労控除', '基本賞与', 'DB掛金',
] as const
const KHONG_PHAI_TIEN = [
  '出勤時間', '遅早時間', '残業時間', '深夜残業時間', '休出残業時間', '欠勤時間',
  '出勤日数', '休出日数', '有休日数', '欠勤日数', '有休残', '時間有休残', '特休日数',
  '残業予備２', '残業予備３', '残業予備４', '残業予備５',
  '現金支給額', '翌月繰越額', '前月繰越額', '社員番号',
] as const
/**
 * Chữ KHỐI dựng dọc ở lề trái (支給/控除/勤怠...) và chữ header. KHÔNG BAO GIỜ mang
 * số, nhưng nằm ở x≈42 nên cách số cột đầu (x=95.2) đúng 53,2pt — TRONG ngưỡng 72pt
 * — nên chúng GIÀNH mất số của 健康保険料 rồi vòng lặp dừng. Phải loại TRƯỚC khi ghép.
 */
const MARKERS = new Set(['支', '給', '控', '除', '勤', '怠', '他', '氏', '名', '所', '属', '様', '氏名'])
export const BIET_HET = new Set<string>([
  ...KHAU_TRU, ...MUC_CON, ...NGOAI_TONG, ...DINH_MUC_GIAM,
  ...TONG, ...CAP, ...KHONG_PHAI_TIEN, ...MARKERS,
])

// Đã chạy đúng 60/60. KHÔNG đổi.
const YROW = 3.0
const YMAX = 64.0
const XMAX = 72.0
const XSLACK = 6.0

function tach(oChu: OChu[]): { so: OChu[]; nhan: OChu[] } {
  const so: OChu[] = []
  const nhan: OChu[] = []
  for (const o of oChu) {
    const t = o.text.replace(/ /g, '')
    if (!t || TIMEISH.test(t)) continue
    if (MONEY.test(t)) so.push({ ...o, text: t })
    else if (HAS_CJK.test(t)) nhan.push({ ...o, text: t })
  }
  return { so, nhan }
}

/** Gom theo y thành các hàng, giảm dần theo y (trên trang: từ trên xuống). */
function gomHang(items: OChu[]): { y: number; items: OChu[] }[] {
  const hang: { y: number; items: OChu[] }[] = []
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const cuoi = hang[hang.length - 1]
    if (cuoi && Math.abs(cuoi.y - it.y) <= YROW) cuoi.items.push(it)
    else hang.push({ y: it.y, items: [it] })
  }
  return hang
}

/**
 * {nhãn: số} theo luật: một số thuộc về NHÃN GẦN NHẤT VỀ PHÍA TRÁI nó, trong hàng
 * nhãn gần nhất BÊN DƯỚI mà có nhãn hợp lệ ở tầm.
 *
 * Phải duyệt NHIỀU hàng: layout từ 2026/06 chèn một hàng mục con giữa hàng số và
 * hàng nhãn tổng.
 */
export function ghep(oChu: OChu[]): Record<string, number> {
  const { so, nhan } = tach(oChu)
  const hangNhan = gomHang(nhan.filter((n) => !MARKERS.has(n.text)))
  const res: Record<string, number> = {}
  for (const s of so) {
    for (const h of hangNhan) {
      if (h.y >= s.y || s.y - h.y > YMAX) continue
      const ung = h.items.filter((n) => s.x - n.x >= -XSLACK && s.x - n.x <= XMAX)
      if (ung.length === 0) continue
      const n = ung.reduce((a, b) => (b.x > a.x ? b : a))
      if (!(n.text in res)) res[n.text] = Number(s.text.replace(/,/g, ''))
      break
    }
  }
  return res
}

const KY_TRONG_PDF = /(\d{4})\s*年\s*(\d{1,2})\s*月分\s*(給与|賞与)?/
const TEN_FILE = /\((\d+)\)(\d{4})(\d{2})?([KS])/

export interface Phieu {
  file: string
  empno: string | null
  period: string | null
  kind: 'K' | 'S' | null
  nguonKy: 'noi-dung' | 'ten-file'
  canhBao: string[]
  gross: number | null
  deductTotal: number | null
  net: number | null
  bank: number | null
  tru: Record<string, number>
  ngoaiTong: Record<string, number>
  nhanLa: string[]
  loi: string[]
}

/**
 * Kỳ: ưu tiên NỘI DUNG PDF, dự phòng tên file, lệch nhau thì báo.
 *
 * Vì sao cần cả hai: một file thật có tên ghi `202209` nhưng nội dung ghi
 * `2022年7月分賞与`, và khoản thật nằm ở 2022-07-08. Nhưng hai file khác lại KHÔNG
 * đọc được kỳ từ nội dung, và ở đó tên file mới đúng. Không nguồn nào đủ một mình.
 */
function docKy(oChu: OChu[], tenFile: string) {
  const fn = TEN_FILE.exec(tenFile)
  const tenKy = fn ? fn[2] + (fn[3] ?? '') : null
  const kind = (fn?.[4] as 'K' | 'S' | undefined) ?? null
  const m = KY_TRONG_PDF.exec(oChu.map((o) => o.text).join(''))
  const noiKy = m ? `${m[1]}${String(Number(m[2])).padStart(2, '0')}` : null
  const loaiPdf = m?.[3] ?? null

  const canhBao: string[] = []
  if (loaiPdf) {
    const mongDoi = kind === 'K' ? '給与' : '賞与'
    if (loaiPdf !== mongDoi) canhBao.push(`tên file '${kind}' nhưng nội dung '${loaiPdf}'`)
  }
  if (noiKy && tenKy && noiKy !== tenKy) {
    canhBao.push(`kỳ lệch: tên=${tenKy} nội-dung=${noiKy}`)
  }
  return {
    period: noiKy ?? tenKy,
    kind,
    empno: fn?.[1] ?? null,
    nguonKy: (noiKy ? 'noi-dung' : 'ten-file') as 'noi-dung' | 'ten-file',
    canhBao,
  }
}

/**
 * Hai đẳng thức tự kiểm + nhãn lạ. Rỗng = qua hết.
 *
 * Đẳng thức thứ hai là `gộp − 控除合計額 − 過不足税額 = ròng`, KHÔNG phải
 * `gộp − trừ = ròng`: 過不足税額 (quyết toán năm) nằm ngoài tổng khấu trừ nhưng vẫn
 * đổi tiền thật. Đo trên cả bốn phiếu tháng 12 của bộ dữ liệu, khớp tới từng đơn vị.
 */
function kiem(p: Omit<Phieu, 'loi'>): string[] {
  const loi: string[] = []
  const q = Object.values(p.ngoaiTong).reduce((s, v) => s + v, 0)
  if (p.deductTotal === null) loi.push('thiếu 控除合計額')
  else {
    const s = Object.values(p.tru).reduce((a, v) => a + v, 0)
    if (s !== p.deductTotal) {
      loi.push(`tổng mục trừ ${s} != 控除合計額 ${p.deductTotal} (lệch ${s - p.deductTotal})`)
    }
  }
  if (p.gross === null || p.deductTotal === null || p.net === null) {
    loi.push('thiếu một trong 総支給/控除合計/差引支給')
  } else if (p.gross - p.deductTotal - q !== p.net) {
    loi.push(
      `総支給−控除合計−過不足 != 差引支給 (${p.gross}−${p.deductTotal}−${q}=` +
        `${p.gross - p.deductTotal - q}, thực=${p.net})`,
    )
  }
  if (p.net !== null && p.bank !== null && p.net !== p.bank) {
    loi.push(`差引支給 ${p.net} != 銀行１振込額 ${p.bank}`)
  }
  if (p.nhanLa.length) loi.push('nhãn lạ (không có trong bộ nhãn): ' + p.nhanLa.join(', '))
  if (!p.period || !p.kind) loi.push('không đọc được kỳ/loại')
  return loi
}

export function bocPhieu(oChu: OChu[], tenFile: string): Phieu {
  const f = ghep(oChu)
  const ky = docKy(oChu, tenFile)
  const tru: Record<string, number> = {}
  for (const k of KHAU_TRU) if (k in f) tru[k] = f[k]
  const ngoaiTong: Record<string, number> = {}
  for (const k of NGOAI_TONG) if (k in f) ngoaiTong[k] = f[k]
  const than: Omit<Phieu, 'loi'> = {
    file: tenFile,
    empno: ky.empno,
    period: ky.period,
    kind: ky.kind,
    nguonKy: ky.nguonKy,
    canhBao: ky.canhBao,
    gross: f['総支給金額'] ?? null,
    deductTotal: f['控除合計額'] ?? null,
    net: f['差引支給額'] ?? null,
    bank: f['銀行１振込額'] ?? null,
    tru,
    ngoaiTong,
    nhanLa: Object.keys(f).filter((k) => !BIET_HET.has(k)).sort(),
  }
  return { ...than, loi: kiem(than) }
}
