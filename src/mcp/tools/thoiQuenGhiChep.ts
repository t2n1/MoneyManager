// Thói quen ghi chép — phần dữ liệu KHÔNG màn hình nào của app hiện.
//
// `transactions.created_at` (lúc user gõ vào) khác `occurred_on` (lúc tiền đi). App CÓ dùng
// created_at, nhưng chỉ làm tiêu chí phá hoà khi sắp giao dịch cùng ngày
// (features/transactions/filter.ts:67) — tức nó đang lặng lẽ quyết định thứ tự hiển thị mà
// chưa bao giờ được đọc như một dữ kiện. Tool này lấp đúng chỗ đó.
//
// Lưu ý về loại dữ liệu: đây là hành vi của người dùng (thức khuya hay không, cuối tuần có
// mở app không), không phải số tiền. Spec mục E ghi rõ và user đã đồng ý.
import { dungRo, type DuLieu, type Khoang, type PhamVi } from '../basket'

export interface ThoiQuenKetQua {
  do_tre: { nhom: string; so_lan: number }[]
  gio_nhap: { khung: string; so_lan: number }[]
  thu_trong_tuan: { thu: string; so_lan: number }[]
  danh_muc_ghi_muon_nhat: { ten: string; tre_trung_binh_ngay: number; so_lan: number }[]
  /**
   * Bao nhiêu LẦN NHẬP tạo ra rổ này, đếm theo `created_at` trùng nhau tới từng phút.
   *
   * Đây là chỗ phân biệt "gõ tay hằng ngày" với "nhập theo lô", và nó quyết định mọi con số
   * khác trong tool có nghĩa hay không: 186 khoản mà chỉ 6 phiên thì `do_tre` không đo thói
   * quen của người, nó đo độ trễ của lệnh nhập.
   */
  phien_nhap: { so_phien: number; lo_lon_nhat: number }
  pham_vi: PhamVi
  ghi_chu: string[]
}

/**
 * Số khoản tối thiểu để một danh mục được vào bảng "ghi muộn nhất".
 *
 * Vì sao cần: bản đầu không có ngưỡng, và trên sổ thật top 5 toàn dòng n = 1–2 — tức Claude
 * sẽ nói "danh mục Thuốc hay bị ghi muộn nhất" từ đúng một giao dịch. Một trung bình của một
 * điểm dữ liệu không phải một phát hiện.
 */
const TOI_THIEU_SO_LAN = 3

/** Lô lớn nhất chiếm từ mức này trở lên thì coi là dữ liệu vào sổ theo lô. */
const NGUONG_LO = 0.25

const NHOM_TRE = ['ghi ngay', '1–2 ngày', '3–7 ngày', 'hơn một tuần'] as const
const KHUNG = ['đêm 0–5', 'sáng 6–11', 'chiều 12–17', 'tối 18–23'] as const
const THU = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

function nhomTre(ngay: number): (typeof NHOM_TRE)[number] {
  if (ngay <= 0) return 'ghi ngay'
  if (ngay <= 2) return '1–2 ngày'
  if (ngay <= 7) return '3–7 ngày'
  return 'hơn một tuần'
}

function ngayTai(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(isoUtc))
}

function gioTai(isoUtc: string, tz: string): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(
        new Date(isoUtc),
      ),
    ) % 24
  )
}

function soNgayGiua(tuISO: string, denISO: string): number {
  const [y1, m1, d1] = tuISO.split('-').map(Number)
  const [y2, m2, d2] = denISO.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function thoiQuenGhiChep(input: { khoang: Khoang }, du: DuLieu): ThoiQuenKetQua {
  const ro = dungRo(du, input.khoang)
  const ghi_chu: string[] = []
  const tenDanhMuc = new Map(du.categories.map((c) => [c.id, c.name]))

  const demTre = new Map<string, number>()
  const demGio = new Map<string, number>()
  const demThu = new Map<string, number>()
  const theoDanhMuc = new Map<string, { tong: number; soLan: number }>()
  /** created_at cắt tới PHÚT → số khoản cùng phút đó. Một lệnh nhập ghi cả lô trong một phút. */
  const demPhien = new Map<string, number>()
  let coGhiTruoc = false

  for (const t of ro.txs) {
    const tre = soNgayGiua(t.occurred_on, ngayTai(t.created_at, du.tz))
    if (tre < 0) coGhiTruoc = true

    // Cắt tới phút: '2026-07-31T05:30:00.000Z' → '2026-07-31T05:30'
    const phut = t.created_at.slice(0, 16)
    demPhien.set(phut, (demPhien.get(phut) ?? 0) + 1)

    const nt = nhomTre(tre)
    demTre.set(nt, (demTre.get(nt) ?? 0) + 1)

    const h = gioTai(t.created_at, du.tz)
    const khung = KHUNG[Math.min(3, Math.floor(h / 6))]
    demGio.set(khung, (demGio.get(khung) ?? 0) + 1)

    const [y, m, d] = t.occurred_on.split('-').map(Number)
    const thu = THU[new Date(y, m - 1, d).getDay()]
    demThu.set(thu, (demThu.get(thu) ?? 0) + 1)

    const ten =
      t.category_id === null
        ? '(không danh mục)'
        : tenDanhMuc.get(t.category_id) ?? '(danh mục đã xoá)'
    const cu = theoDanhMuc.get(ten) ?? { tong: 0, soLan: 0 }
    cu.tong += tre
    cu.soLan += 1
    theoDanhMuc.set(ten, cu)
  }

  const so_phien = demPhien.size
  const lo_lon_nhat = demPhien.size === 0 ? 0 : Math.max(...demPhien.values())
  const tong = ro.txs.length

  // Nhập theo lô: nói TRƯỚC mọi con số khác, vì nó quyết định các số kia có nghĩa hay không.
  if (tong > 0 && lo_lon_nhat / tong >= NGUONG_LO && lo_lon_nhat > 1) {
    ghi_chu.push(
      `Dữ liệu này vào sổ THEO LÔ: ${tong} khoản chỉ đến từ ${so_phien} lần nhập (lô lớn nhất ` +
        `${lo_lon_nhat} khoản cùng một phút). Sổ có lịch sử nhập từ Zaim và sao kê nhập theo ` +
        'tháng, nên "độ trễ" dưới đây là độ trễ NHẬP KHẨU, không phải thói quen gõ tay của ' +
        'người dùng — và "giờ nhập" là giờ chạy lệnh nhập, không phải giờ người đó mở app. ' +
        'ĐỪNG kết luận gì về thói quen của người dùng từ những con số này.',
    )
  }

  const itKhoan = [...theoDanhMuc.values()].filter((g) => g.soLan < TOI_THIEU_SO_LAN).length
  if (itKhoan > 0) {
    ghi_chu.push(
      `Đã loại ${itKhoan} danh mục khỏi bảng "ghi muộn nhất" vì quá ít khoản (dưới ` +
        `${TOI_THIEU_SO_LAN}). Trung bình của một hai giao dịch không phải một phát hiện.`,
    )
  }

  if (coGhiTruoc) {
    ghi_chu.push(
      'Có khoản được ghi TRƯỚC ngày tiền đi (độ trễ âm) — thường là khoản đặt trước hoặc ' +
        'khoản định kỳ nhập sẵn. Dấu âm được giữ nguyên, không kẹp về 0.',
    )
  }
  if (ro.txs.length === 0) {
    ghi_chu.push(
      `Chưa có giao dịch nào trong khoảng ${ro.phamVi.tu_ngay} → ${ro.phamVi.den_ngay} ` +
        '(mốc cuối không tính), nên không đo được thói quen ghi chép.',
    )
  }

  return {
    do_tre: NHOM_TRE.filter((n) => demTre.has(n)).map((n) => ({
      nhom: n, so_lan: demTre.get(n) as number,
    })),
    gio_nhap: KHUNG.filter((k) => demGio.has(k)).map((k) => ({
      khung: k, so_lan: demGio.get(k) as number,
    })),
    thu_trong_tuan: THU.filter((t) => demThu.has(t)).map((t) => ({
      thu: t, so_lan: demThu.get(t) as number,
    })),
    danh_muc_ghi_muon_nhat: [...theoDanhMuc.entries()]
      .filter(([, g]) => g.soLan >= TOI_THIEU_SO_LAN)
      .map(([ten, g]) => ({
        ten, tre_trung_binh_ngay: Math.round(g.tong / g.soLan), so_lan: g.soLan,
      }))
      .sort((a, b) => b.tre_trung_binh_ngay - a.tre_trung_binh_ngay)
      .slice(0, 10),
    phien_nhap: { so_phien, lo_lon_nhat },
    pham_vi: ro.phamVi,
    ghi_chu,
  }
}
