// Tang 2 — phan THUAN cua viec nhap phieu luong: map nhan, neo, dung dong.
// Khong I/O, khong Supabase -> test duoc bang vitest (nhap.test.ts).
// Xem docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md

import type { Phieu } from './boc'

export interface DongMoi {
  type: 'income' | 'expense'
  amount: number
  to_amount: null
  category_id: string | null
  account_id: string
  to_account_id: null
  occurred_on: string
  note: string
  is_refund: boolean
  exclude_from_stats: boolean
}

export interface KhoanNeo {
  id: string
  occurred_on: string
  amount: number
  account_id: string
  category_id: string | null
}

/**
 * Phieu 'loi' rong — dung khi khong doc duoc PDF. Web (ImportPhieuLuongPage.tsx)
 * va CLI (nhap-phieu-luong.mjs) dung CHUNG ham nay de tra ve CUNG MOT HINH DANG
 * Phieu (du 14 truong), thay vi moi ben tu dung mot vai truong roi trung nhau
 * TINH CO nho gomTrung() cho phieu mang loi di thang qua (khong doc p.period/
 * p.kind) va dungKeHoach() tu choi truoc khi doc toi cac truong do. CLI khong co
 * kieu nen se khong gi bat duoc neu bat bien do vo — dung chung ham nay khep no
 * lai o mot cho.
 */
export function phieuLoi(file: string, thongDiepLoi: string): Phieu {
  return {
    file, empno: null, period: null, kind: null, nguonKy: 'ten-file', canhBao: [],
    gross: null, deductTotal: null, net: null, bank: null, tru: {}, ngoaiTong: {},
    nhanLa: [], loi: [thongDiepLoi],
  }
}

/**
 * Nhan phieu -> danh muc app. Ten phai DUNG TUNG KY TU: taxCategoryIds
 * (src/features/tax/categories.ts) nhan nhom theo TEN, sai mot ky tu la khong tinh.
 */
export const MAP_THUE: Record<string, string> = {
  所得税: 'Thuế thu nhập (所得税)',
  過不足税額: 'Thuế thu nhập (所得税)',
  雇用保険料: 'Bảo hiểm việc làm (雇用保険)',
  住民税: 'Thuế cư trú (住民税)',
  健康保険料: 'Bảo hiểm y tế (健康保険)',
  厚生年金保険: 'Hưu trí (年金)',
  厚生年金基金: 'Hưu trí (年金)',
}

/**
 * 社内販売精算 NAM TRONG 控除合計額 (da chung minh bang so hoc: 5 file, dung bang
 * phan thieu 300 · 2.000 · 3.500 · 8.000 · 12.000 — so minh hoa, khong phai so
 * that tren phieu) nhung la MUA HANG NOI BO, khong phai thue. Cho vao nhom Thue &
 * An sinh la thoi phong tu so cua chi so — 3 trong 5 file do nam trong cua so 12
 * thang.
 *
 * Va no KHONG duoc la con cua 'Thuế & An sinh': taxCategoryIds gom MOI con cua cha
 * do. 'Đi chợ' (essential + variable) khong doi chi co dinh nen khong dung so thang
 * du phong — cho it tac dung phu nhat.
 */
export const MAP_KHAC: Record<string, string> = { 社内販売精算: 'Đi chợ' }

/** Khong biet la gi -> tu choi ca file, khong doan. Trong o ca 55 phieu. */
export const TU_CHOI = new Set(['その他'])

export const DANH_MUC_THUE_CHA = 'Thuế & An sinh'
export const DANH_MUC_THUE_CON: {
  name: string
  icon: string
  need_level: 'essential'
  cost_type: 'fixed' | 'variable'
}[] = [
  { name: 'Thuế thu nhập (所得税)', icon: '🧾', need_level: 'essential', cost_type: 'variable' },
  { name: 'Bảo hiểm việc làm (雇用保険)', icon: '💼', need_level: 'essential', cost_type: 'variable' },
  { name: 'Thuế cư trú (住民税)', icon: '🏙️', need_level: 'essential', cost_type: 'fixed' },
  { name: 'Bảo hiểm y tế (健康保険)', icon: '🏥', need_level: 'essential', cost_type: 'fixed' },
  { name: 'Hưu trí (年金)', icon: '👴', need_level: 'essential', cost_type: 'fixed' },
]

/**
 * cost_type chia HAI, khong gan dong loat 'fixed'.
 *
 * fund = tai san long / chi co dinh (HealthView.tsx:135). Mat viec thi 所得税 va
 * 雇用保険料 HET, con 住民税 (tinh tren thu nhap nam truoc) + 健保/年金 (chuyen sang
 * ban 国民) VAN NO. Gan dong loat 'fixed' dua chi co dinh 80.000 -> 160.000 ¥/thang
 * (so minh hoa); chia hai -> 150.000. Nut "Tao bo danh muc Thue & An sinh" cu gan
 * dong loat fixed.
 */

/** Nhan -> {nhom, danhMuc}. Nem loi khi khong map duoc: khong bao gio bo im lang. */
export function mapNhan(nhan: string): { nhom: 'thue' | 'khac'; danhMuc: string } {
  if (TU_CHOI.has(nhan)) throw new Error(`nhan '${nhan}' khong ro la gi — tu choi`)
  if (MAP_THUE[nhan]) return { nhom: 'thue', danhMuc: MAP_THUE[nhan] }
  if (MAP_KHAC[nhan]) return { nhom: 'khac', danhMuc: MAP_KHAC[nhan] }
  throw new Error(`nhan '${nhan}' khong co trong bang map`)
}

/**
 * Dau ghi chu. Hau to K|S BAT BUOC: 7 ky co hai phieu (202209, 202302, 202308,
 * 202402, 202408, 202502, 202602), va hai cap neo cung ngay —
 * 202302K/202302S deu 2023-02-10, 202207K/202209S deu 2022-07-08.
 * Khong co cot import_batch nen dau trong `note` la tay cam duy nhat de go lo nhap.
 */
export function dauGhiChu(ngayISO: string, kind: 'K' | 'S'): string {
  const [y, m] = ngayISO.split('-')
  return `給与 ${y}/${m}${kind}`
}

/** Chuoi ngay ISO + so ngay (thuan, khong dung Date.now). */
export function congNgay(ngayISO: string, songay: number): string {
  const [y, m, d] = ngayISO.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + songay * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

/** Cua so tim khoan neo quanh dau ky luong. */
export function cuaSoNeo(period: string): { tu: string; den: string } {
  const dau = `${period.slice(0, 4)}-${period.slice(4, 6)}-01`
  return { tu: congNgay(dau, -20), den: congNgay(dau, 75) }
}

/**
 * Tim khoan thu da co trong so de neo phieu vao.
 *
 * Ba rang buoc: type=income (caller da loc) + tai khoan Yucho + amount = so RONG.
 * Chu so xac nhan MOI khoan luong tu truoc toi nay deu vao Yucho, nen rang buoc
 * tai khoan la chot chan that. Do tren toan bo lich su Yucho (66 khoan thu):
 * 55/55 phieu khop duy nhat.
 *
 * Ngay lay tu DONG NEO, khong tu ky — chinh dieu nay cuu ca 202209S (ten file ghi
 * 202209, noi dung ghi 2022年7月分, khoan that o 2022-07-08).
 */
export function timNeo(
  khoanThu: KhoanNeo[],
  phieu: Phieu,
  yuchoId: string,
  daDung: Set<string> = new Set(),
): { ok: true; row: KhoanNeo } | { ok: false; lyDo: string } {
  // KHONG dung `!`: bat bien "period khong null" duoc giu boi CALLER (moi caller loc
  // `p.loi.length` truoc, va bocPhieu day 'khong doc duoc ky/loai' vao `loi` khi period
  // null). Dua vao caller ma khong kiem la mong manh — va neu bat bien vo, ta muon no
  // no ON AO ngay day, khong phai lang le troi xuong.
  if (!phieu.period) throw new Error(`phieu '${phieu.file}' thieu ky (period) — khong neo duoc`)
  const { tu, den } = cuaSoNeo(phieu.period)
  const ung = khoanThu.filter(
    (t) =>
      t.account_id === yuchoId &&
      t.amount === phieu.net &&
      t.occurred_on >= tu &&
      t.occurred_on <= den &&
      !daDung.has(t.id),
  )
  if (ung.length === 0) return { ok: false, lyDo: `khong thay khoan thu Yucho = ${phieu.net} trong ${tu}..${den}` }
  if (ung.length > 1) return { ok: false, lyDo: `${ung.length} khoan thu cung khop (mo ho): ${ung.map((t) => t.occurred_on).join(', ')}` }
  return { ok: true, row: ung[0] }
}

/**
 * Dung cac dong se ghi cho mot phieu. Chi THEM, khong sua dong sao ke.
 *
 * Tra {thu, chi[]} — cung ngay, cung tai khoan voi dong neo, nen thu vao chi ra
 * triet tieu: so du KHONG DOI o moi moc ngay.
 *
 * 過不足税額 am -> chi mang is_refund (amount van DUONG: DB co check(amount > 0) va
 * transactions_refund_check; expenseSign tra -1, view so du CONG khoan hoan).
 */
export function dungDong(
  phieu: Phieu,
  neo: KhoanNeo,
  idTheoTen: Map<string, string>,
): { thu: DongMoi; thuKhac: DongMoi | null; chi: DongMoi[] } {
  // Vi sao throw chu khong `!`: dauGhiChu voi kind null KHONG no — no noi chuoi thanh
  // `給与 2026/08null` roi ghi am tham vao `note` giao dich that. Ma `note` la tay cam
  // DUY NHAT de go lo nhap (khong co cot import_batch), nen mot dau ghi chu sai la mot
  // dong khong go duoc. Du lieu sai lang le te hon loi on ao.
  if (!phieu.kind) throw new Error(`phieu '${phieu.file}' thieu loai (K/S) — khong dung duoc dau ghi chu`)
  const dau = dauGhiChu(neo.occurred_on, phieu.kind)
  const muc = { ...phieu.tru, ...phieu.ngoaiTong }
  const chi: DongMoi[] = []
  for (const [nhan, so] of Object.entries(muc)) {
    if (so === 0) continue
    const { nhom, danhMuc } = mapNhan(nhan)
    const id = idTheoTen.get(danhMuc)
    if (!id) throw new Error(`thieu danh muc '${danhMuc}' (cho nhan '${nhan}')`)
    chi.push({
      type: 'expense',
      amount: Math.abs(so),
      to_amount: null,
      category_id: id,
      account_id: neo.account_id,
      to_account_id: null,
      occurred_on: neo.occurred_on,
      note: `${dau} · ${nhan}`,
      is_refund: so < 0,
      /**
       * Thue bi tru TAI NGUON khong phai khoan chi tuy y. Cong no vao o Chi lam
       * con so do mat nghia nhu tin hieu tieu tien. `exclude_from_stats` dua no ra
       * ngoai Thu/Chi ma VAN tinh so du (view account_balances khong loc co nay),
       * va So GD hien no mau XAM — dung quy uoc san co "xam = khong nam trong
       * Thu/Chi". Chi so ganh nang thue van dem duoc: snapshot.ts co tinh rieng.
       *
       * 社内販売精算 thi KHONG mang co: do la mua hang that, tien that ra khoi tay,
       * phai nam trong Chi.
       */
      exclude_from_stats: nhom === 'thue',
    })
  }
  const tong = (ds: DongMoi[]): number => ds.reduce((s, r) => s + r.amount * (r.is_refund ? -1 : 1), 0)
  const tongThue = tong(chi.filter((r) => r.exclude_from_stats))
  const tongKhac = tong(chi.filter((r) => !r.exclude_from_stats))

  const dongThu = (amount: number, ngoai: boolean): DongMoi => ({
    type: 'income',
    amount,
    to_amount: null,
    category_id: neo.category_id,
    account_id: neo.account_id,
    to_account_id: null,
    occurred_on: neo.occurred_on,
    note: `${dau} · ${ngoai ? 'phần bị giữ lại' : 'phần đã chi hộ'}`,
    // PHAI ghi ro false, khong duoc bo trong: PostgREST insert mot MANG thi HOP NHAT
    // tap khoa cua moi phan tu, nen khoa nao thieu o mot dong se thanh NULL thay vi
    // lay DEFAULT. Cac dong chi co is_refund, dong thu khong -> gui NULL -> vi pham
    // NOT NULL, va CA LO bi tu choi. Da gap that o phieu dau tien.
    is_refund: false,
    exclude_from_stats: ngoai,
  })

  // Hai dong thu, moi dong doi ung mot nhom chi, de CA HAI phia can bang TRONG
  // pham vi thong ke cua no: phan thue can bang ngoai thong ke, phan con lai can
  // bang trong thong ke. Nho vay Thu/Chi khong phong, ma chenh lech van dung.
  return {
    thu: dongThu(tongThue, true),
    thuKhac: tongKhac > 0 ? dongThu(tongKhac, false) : null,
    chi,
  }
}

/** Dau tay cua NOI DUNG tai chinh mot phieu — de so hai file co cung mot phieu khong. */
function dauTayNoiDung(p: Phieu): string {
  const sapXep = (o: Record<string, number>) =>
    Object.keys(o || {})
      .sort()
      .map((k) => `${k}=${o[k]}`)
      .join(',')
  return [p.gross, p.deductTotal, p.net, p.bank, sapXep(p.tru), sapXep(p.ngoaiTong)].join('|')
}

/**
 * Gom file trung theo (empno, period, kind).
 *
 * Vi sao can: thu muc that co ca '(0101)202608K.pdf' lan '(0101)202608K (1).pdf' —
 * TRUNG BYTE (cung SHA256). Khong co chot nay thi file thu hai bi chot NEO tu choi
 * voi thong diep "khong thay khoan thu Yucho = 400000", vi file dau da chiem khoan
 * neo. Thong diep do dan nguoi doc di sua SAI CHO: van de la file trung, khong phai
 * thieu khoan thu.
 *
 * Trung y het noi dung -> giu mot ban, bao da gop. Khac noi dung -> tu choi ca nhom:
 * script khong duoc doan file nao moi la ban that.
 *
 * Phieu mang `loi` (doc PDF loi, thieu ky/loai...) KHONG co danh tinh dang tin de so
 * sanh noi dung — dauTayNoiDung cua chung thuong RONG GIONG HET NHAU (vd ba file
 * khong doc duoc deu co empno/period/kind = null). Gop chung theo noi dung se NUOT
 * MAT hai trong ba file loi do, chi con lai MOT dong "tu choi" — nguoi dung tuong
 * chi co mot file hong. Nen phieu co loi luon DI THANG QUA, moi file mot dong,
 * khong tham gia gom/tu-choi-theo-noi-dung voi bat ky phieu nao khac.
 */
export function gomTrung(phieuList: Phieu[]): {
  giu: Phieu[]
  daGop: { key: string; files: string[] }[]
  boQua: { key: string; files: string[]; lyDo: string; phieu: Phieu }[]
} {
  const giu: Phieu[] = []
  const daGop: { key: string; files: string[] }[] = []
  const boQua: { key: string; files: string[]; lyDo: string; phieu: Phieu }[] = []

  // Phieu co loi: di thang qua, moi file mot dong — xem ly do o docstring.
  const coLoi = phieuList.filter((p) => p.loi.length > 0)
  const sach = phieuList.filter((p) => p.loi.length === 0)
  giu.push(...coLoi)

  const nhom = new Map<string, Phieu[]>()
  for (const p of sach) {
    const key = `${p.empno}|${p.period}|${p.kind}`
    if (!nhom.has(key)) nhom.set(key, [])
    nhom.get(key)!.push(p)
  }
  for (const [key, ds] of nhom) {
    if (ds.length === 1) {
      giu.push(ds[0])
      continue
    }
    const dauTay = new Set(ds.map(dauTayNoiDung))
    if (dauTay.size === 1) {
      giu.push(ds[0])
      daGop.push({ key, files: ds.map((p) => p.file) })
    } else {
      boQua.push({
        key,
        files: ds.map((p) => p.file),
        lyDo: `${ds.length} file cung ky ${key} nhung NOI DUNG KHAC NHAU — khong doan ban nao that`,
        // Mot phieu THAT thuoc dung nhom nay (period/kind/empno khop key) — de dong
        // tu-choi mang dung ky cua nhom bi tu choi, khong phai cua mot phieu bat ky
        // khac trong toan bo lo.
        phieu: ds[0],
      })
    }
  }
  return { giu, daGop, boQua }
}

/**
 * Chot bang-khong + chot DAU.
 *
 * Chot dau la bai hoc rieng: phep kiem "thu them == chi them == gop - rong" bao
 * DUNG ca 55 phieu, vi tat ca ba so bang nhau. Nhung 202312K co gop 400.000 < rong
 * 420.000 (duoc hoan thue cuoi nam 90.000 — so minh hoa, khong phai so that), nen
 * ca ba deu bang -20.000 — dong thu phai AM, ma DB cam. Bat bien so hoc dung nhung
 * VO NGHIA neu khong kiem dau.
 *
 * Ca nay khong the trung hoa so du bang duong nao trong Cach B (chi-them), nen tu
 * choi thay vi bia cach vong.
 */
export function kiemDong(phieu: Phieu, thu: DongMoi, chi: DongMoi[], thuKhac: DongMoi | null = null): string[] {
  const loi: string[] = []
  const tong = (ds: DongMoi[]): number => ds.reduce((s, r) => s + r.amount * (r.is_refund ? -1 : 1), 0)
  const tongChi = tong(chi)
  const tongThu = thu.amount + (thuKhac ? thuKhac.amount : 0)
  if (tongThu !== tongChi) loi.push(`tong thu ${tongThu} != tong chi ${tongChi}`)

  // Can bang TRONG TUNG pham vi thong ke, khong chi can bang tong: neu lech thi
  // Thu/Chi phong len dung phan lech do, dung cai loi ma mo hinh nay sinh ra de sua.
  const tThue = tong(chi.filter((r) => r.exclude_from_stats))
  const tKhac = tong(chi.filter((r) => !r.exclude_from_stats))
  if (thu.amount !== tThue) loi.push(`thu ngoai thong ke ${thu.amount} != chi thue ${tThue}`)
  if ((thuKhac ? thuKhac.amount : 0) !== tKhac) {
    loi.push(`thu trong thong ke ${thuKhac ? thuKhac.amount : 0} != chi khac ${tKhac}`)
  }
  if (thuKhac && thuKhac.exclude_from_stats) loi.push('dong thu "da chi ho" khong duoc mang co')
  if (!thu.exclude_from_stats) loi.push('dong thu "bi giu lai" phai mang co exclude_from_stats')

  if (phieu.gross != null && phieu.net != null && tongChi !== phieu.gross - phieu.net) {
    loi.push(`tong chi ${tongChi} != 総支給 - 差引支給 (${phieu.gross - phieu.net})`)
  }
  if (thu.amount <= 0) {
    loi.push(
      `phan bi giu lai = ${thu.amount} <= 0 (rong ${phieu.net} > gop ${phieu.gross}: ` +
        `hoan thue cuoi nam lon hon tong khau tru). Cach chi-them khong bieu dien ` +
        `duoc ca nay — xu tay.`,
    )
  }
  if (chi.some((r) => r.amount <= 0)) loi.push('co dong chi amount <= 0')
  return loi
}

export interface DongKeHoach {
  phieu: Phieu
  neo: KhoanNeo | null
  dau: string
  thu: DongMoi | null
  thuKhac: DongMoi | null
  chi: DongMoi[]
  trangThai: 'dat' | 'da-nhap' | 'tu-choi'
  lyDo: string
}

/**
 * Dung ke hoach cho ca lo. THUAN — nhan du lieu so da doc san, khong goi DB.
 *
 * Trang thai phai phan biet BA ca, khong duoc gop hai ca sau thanh "loi": nguoi
 * dung can biet "da nhap roi" (khong phai loi, khong can lam gi) khac "tu choi"
 * (co the phai xu tay).
 */
export function dungKeHoach(
  phieuList: Phieu[],
  khoanThu: KhoanNeo[],
  yuchoId: string,
  idTheoTen: Map<string, string>,
  dauDaCo: Set<string>,
): DongKeHoach[] {
  const trung = gomTrung(phieuList)
  const out: DongKeHoach[] = []
  const rong = (p: Phieu, tt: DongKeHoach['trangThai'], lyDo: string): DongKeHoach => ({
    phieu: p, neo: null, dau: '', thu: null, thuKhac: null, chi: [], trangThai: tt, lyDo,
  })
  for (const g of trung.boQua) {
    // g.phieu la mot phieu THAT thuoc dung nhom bi tu choi (period/kind/empno khop
    // key cua no) — KHONG dung phieuList[0]: do co the la mot phieu khac hoan toan,
    // mang nham ky/loai cua no vao dong tu-choi cua nhom nay.
    out.push(rong({ ...g.phieu, file: g.files.join(' + ') }, 'tu-choi', g.lyDo))
  }
  const daDung = new Set<string>()
  for (const p of trung.giu) {
    if (p.loi.length) { out.push(rong(p, 'tu-choi', p.loi.join(' ; '))); continue }
    const neo = timNeo(khoanThu, p, yuchoId, daDung)
    if (!neo.ok) { out.push(rong(p, 'tu-choi', neo.lyDo)); continue }
    const dau = dauGhiChu(neo.row.occurred_on, p.kind as 'K' | 'S')
    if (dauDaCo.has(dau)) { out.push({ ...rong(p, 'da-nhap', `đã nhập rồi (${dau})`), dau }); continue }
    let d
    try { d = dungDong(p, neo.row, idTheoTen) } catch (e) {
      out.push(rong(p, 'tu-choi', (e as Error).message)); continue
    }
    const loi = kiemDong(p, d.thu, d.chi, d.thuKhac)
    if (loi.length) { out.push(rong(p, 'tu-choi', loi.join(' ; '))); continue }
    daDung.add(neo.row.id)
    out.push({ phieu: p, neo: neo.row, dau, ...d, trangThai: 'dat', lyDo: '' })
  }
  return out
}
