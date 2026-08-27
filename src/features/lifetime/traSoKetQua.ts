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
