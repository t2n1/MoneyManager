// Đọc kết quả model trả về — THUẦN, không React, không mạng.
//
// LUẬT XUYÊN SUỐT: KHÔNG ĐOÁN. Mỗi ca hỏng ở đây đều trả về một mã lỗi để UI nói thẳng
// ra, chứ không có nhánh nào "sửa tạm cho chạy tiếp". Lý do: con số này đi vào một bản
// chiếu 40 năm rồi được vẽ thành đồ thị trơn tru — một cú đoán sai ở đây không có gì
// bắt được về sau. Thà không có số còn hơn có số sai (cùng quy ước `hasMissingRate`).
//
// Riêng ca SAI ĐỒNG TIỀN: KHÔNG tự quy đổi. Model trả lời bằng USD trong khi chặng dùng
// JPY nghĩa là nó đã hiểu sai câu hỏi, nên con số đó sai ở tầng NGHĨA chứ không phải sai
// đơn vị — quy đổi chỉ làm một câu trả lời sai trông như đúng.
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'
import { toISODate } from '../../lib/dates'
import { formatMoneyReal } from '../../lib/money'

export interface KetQuaTra {
  thapMinor: number
  giuaMinor: number
  caoMinor: number
  tien: CurrencyCode
  dienGiai: string
  canhBao: string[]
  nguon: { ten: string; url: string; nam: number | null }
}

/**
 * Năm kiểu hỏng, khớp đúng năm dòng bảng "Xử lý hỏng" của bản thiết kế.
 *
 * `khong-goi-duoc` tách riêng khỏi `doc-khong-ra` là CỐ Ý: mất mạng và "kết quả lộn xộn"
 * là hai chuyện khác nhau, và tiêu chí nghiệm thu của bản thiết kế là "hỏng thì hỏng ồn
 * ào, nói rõ hỏng ở đâu". Gộp lỗi mạng vào lỗi phân tích là nói sai chỗ hỏng.
 */
export type LoiTra = {
  loi: 'khong-goi-duoc' | 'doc-khong-ra' | 'sai-tien' | 'khong-nguon' | 'khong-tim-duoc'
  noiDung: string
}

export function laLoi(r: KetQuaTra | LoiTra): r is LoiTra {
  return 'loi' in r
}

/** Số tiền nhập theo đơn vị LỚN rồi quy về minor. Cùng phép tính với EventEditorPopover. */
function sangMinor(major: number, tien: CurrencyCode): number {
  return Math.round(major * 10 ** CURRENCIES[tien].decimals)
}

function laSoDuong(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

function laChuoiCo(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Trần cho MỘT mức, tính ở đơn vị LỚN.
 *
 * Vì sao phải có: mọi phép kiểm khác ở đây soi hình dạng ("là số dương", "tăng dần"), nên
 * `1e18` lọt qua sạch sẽ. Nhưng `sangMinor` còn nhân thêm tới 100 lần (USD), và trên
 * `Number.MAX_SAFE_INTEGER` thì phép cộng của JS im lặng sai — bất biến "tiền là số
 * nguyên minor units" của cả repo vỡ ở một chỗ không ai nhìn. Chia 100 vì đó là `decimals`
 * lớn nhất trong `CURRENCIES`; lấy trần chung cho mọi đồng thì không phải nhớ ngoại lệ.
 *
 * Một con số thật không bao giờ chạm tới đây (¥90 nghìn tỷ), nên chặn ở mức này chỉ bắt
 * đúng thứ đáng bắt: model trả về rác dạng số.
 */
const TRAN_MAJOR = Number.MAX_SAFE_INTEGER / 100

export function docKetQua(tho: unknown, tienChang: CurrencyCode): KetQuaTra | LoiTra {
  if (typeof tho !== 'object' || tho === null) {
    return { loi: 'doc-khong-ra', noiDung: 'Kết quả không phải một đối tượng.' }
  }
  const o = tho as Record<string, unknown>

  // Model tự nhận không biết — đây là câu trả lời ĐÚNG, không phải hỏng.
  if (o.khong_biet === true) {
    return {
      loi: 'khong-tim-duoc',
      noiDung: laChuoiCo(o.dien_giai) ? o.dien_giai : 'Không tìm được nguồn đáng tin.',
    }
  }

  if (!laSoDuong(o.thap) || !laSoDuong(o.giua) || !laSoDuong(o.cao)) {
    return { loi: 'doc-khong-ra', noiDung: 'Thiếu hoặc sai một trong ba mức thấp/giữa/cao.' }
  }
  if (o.thap > TRAN_MAJOR || o.giua > TRAN_MAJOR || o.cao > TRAN_MAJOR) {
    return { loi: 'doc-khong-ra', noiDung: 'Có mức lớn đến mức không còn là một số tiền thật.' }
  }
  if (!(o.thap <= o.giua && o.giua <= o.cao)) {
    return { loi: 'doc-khong-ra', noiDung: 'Ba mức không tăng dần: thấp ≤ giữa ≤ cao.' }
  }
  if (!laChuoiCo(o.tien)) {
    return { loi: 'doc-khong-ra', noiDung: 'Thiếu đồng tiền.' }
  }
  if (o.tien !== tienChang) {
    return {
      loi: 'sai-tien',
      noiDung: `Trả lời bằng ${o.tien} trong khi chặng này dùng ${tienChang}.`,
    }
  }

  // Không có nguồn thì không có số. UI dựa vào đây để KHÔNG hiện nút "Lấy".
  const nguon = o.nguon
  if (typeof nguon !== 'object' || nguon === null) {
    return { loi: 'khong-nguon', noiDung: 'Không kèm nguồn nào.' }
  }
  const n = nguon as Record<string, unknown>
  if (!laChuoiCo(n.ten) || !laChuoiCo(n.url)) {
    return { loi: 'khong-nguon', noiDung: 'Nguồn thiếu tên hoặc link.' }
  }

  return {
    thapMinor: sangMinor(o.thap, tienChang),
    giuaMinor: sangMinor(o.giua, tienChang),
    caoMinor: sangMinor(o.cao, tienChang),
    tien: tienChang,
    dienGiai: laChuoiCo(o.dien_giai) ? o.dien_giai : '',
    canhBao: Array.isArray(o.canh_bao) ? o.canh_bao.filter(laChuoiCo) : [],
    nguon: { ten: n.ten, url: n.url, nam: laSoDuong(n.nam) ? n.nam : null },
  }
}

/**
 * Câu ghi vào ô Ghi chú của mốc. Sáu tháng sau mở lại còn biết số ở đâu ra và CŨ CHƯA.
 *
 * `ngayTra` là THAM SỐ chứ không phải `new Date()` bên trong: hàm giữ thuần nên test được,
 * và đó là điều kiện để câu này đáng tin. Nó KHÁC `nguon.nam` — `nguon.nam` là năm KHẢO
 * SÁT, nên một khảo sát 2024 tra năm 2026 và tra năm 2031 đọc ra giống hệt nhau, trong khi
 * cái người đọc cần biết là "lần tra này cách đây bao lâu".
 *
 * Số đi qua `formatMoneyReal`, KHÔNG phải `formatMoney`: đây là dữ liệu ghi xuống DB, mà
 * `formatMoney` che số khi chế độ riêng tư đang bật — một ghi chú "Tra hộ: •••" nằm lại
 * vĩnh viễn sau khi tắt chế độ đó. Và tuyệt đối không nội suy `mucDaChon` thô: nó là minor
 * units, in thẳng ra thì $1,50 thành "150 USD".
 */
export function ghiChuTu(k: KetQuaTra, mucDaChon: number, ngayTra: Date): string {
  const nam = k.nguon.nam === null ? '' : ` ${k.nguon.nam}`
  const canhBao = k.canhBao.length > 0 ? ` — ${k.canhBao.join(' ')}` : ''
  return (
    `Tra hộ ngày ${toISODate(ngayTra)}: ${formatMoneyReal(mucDaChon, k.tien)}. ` +
    `Nguồn: ${k.nguon.ten}${nam} (${k.nguon.url}). ${k.dienGiai}${canhBao}`
  )
}
