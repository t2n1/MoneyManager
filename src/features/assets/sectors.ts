// Ngành của mã và tỷ trọng theo ngành — thuần, test được, và được GÓI sang edge function.
//
// Nguồn: `api-finfo.vndirect.com.vn/v4/industry_classification?q=codeList:HPG,MBB`. Phản
// hồi KHÔNG phải "mã → ngành" mà là "ngành → danh sách mã", mỗi ngành một dòng cho mỗi
// CẤP (1..4). Nên đọc nó là việc lật ngược quan hệ, và đó là lý do phép này nằm ở `src/`
// chứ không trong edge function (luật repo: function không có phép tính riêng).
//
// Đo thật 06/09/2026 với đúng bốn mã của người dùng — cấp 3 cho ra:
//   HPG Kim loại công nghiệp · MBB Ngân hàng · MWG Bán lẻ · VND Dịch vụ tài chính
// Cấp 4 mịn hơn (Thép / Ngân hàng / Bán lẻ tổng hợp / Dịch vụ đầu tư) nhưng chẻ donut ra
// quá vụn khi danh mục đông mã; cấp 1 thì gộp MBB với VND vào chung "Tài chính", tức xoá
// mất đúng cái khác biệt mà người xem cần thấy.

/** Nhãn cho mã chưa tra được ngành. Là một NHÃN, không phải một ngành. */
export const CHUA_RO = 'Chưa rõ'

/**
 * Ưu tiên cấp 3, thiếu thì lấy cấp CỤ THỂ NHẤT còn lại.
 *
 * Thà một cái tên hẹp hơn mong muốn còn hơn để trống: "Dịch vụ đầu tư" vẫn nói được điều
 * gì đó, còn "Chưa rõ" thì không.
 */
const UU_TIEN_CAP = ['3', '4', '2', '1']

/** Phản hồi industry_classification → `Map<mã, tên ngành>`. */
export function parseIndustries(json: unknown): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof json !== 'object' || json === null) return out
  const data = (json as { data?: unknown }).data
  if (!Array.isArray(data)) return out

  // Quét theo thứ tự ưu tiên và KHÔNG ghi đè: mã đã có tên từ cấp ưu tiên cao hơn thì giữ.
  for (const cap of UU_TIEN_CAP) {
    for (const row of data) {
      if (typeof row !== 'object' || row === null) continue
      const r = row as { industryLevel?: unknown; vietnameseName?: unknown; codeList?: unknown }
      if (String(r.industryLevel) !== cap) continue
      const ten = typeof r.vietnameseName === 'string' ? r.vietnameseName.trim() : ''
      const codes = typeof r.codeList === 'string' ? r.codeList : ''
      if (!ten || !codes) continue
      for (const raw of codes.split(',')) {
        const ma = raw.trim().toUpperCase()
        if (ma && !out.has(ma)) out.set(ma, ten)
      }
    }
  }
  return out
}

export interface SectorSlice {
  name: string
  /** đồng */
  value: number
  /** 0..1 */
  weight: number
}

/**
 * Tỷ trọng theo ngành.
 *
 * "Chưa rõ" luôn xuống CUỐI dù nó to nhất: nó không phải một ngành, nên để nó đứng đầu là
 * nói rằng ngành lớn nhất của danh mục là "chưa rõ". Nhưng nó VẪN nằm trong tổng — bỏ ra
 * thì các lát còn lại phồng lên và donut nói sai về cơ cấu (cùng quy ước `hasMissingRate`
 * xuyên repo: loại khỏi phép tính thì phải nói ra, không âm thầm co mẫu số).
 */
export function sectorWeights(
  positions: { symbol: string; value: number }[],
  industryBySymbol: Map<string, string>,
): SectorSlice[] {
  const theoNganh = new Map<string, number>()
  let tong = 0
  for (const p of positions) {
    if (p.value <= 0) continue
    const ten = (industryBySymbol.get(p.symbol) ?? '').trim() || CHUA_RO
    theoNganh.set(ten, (theoNganh.get(ten) ?? 0) + p.value)
    tong += p.value
  }
  if (tong <= 0) return []

  return [...theoNganh]
    .map(([name, value]) => ({ name, value, weight: value / tong }))
    .sort((a, b) => {
      if (a.name === CHUA_RO) return 1
      if (b.name === CHUA_RO) return -1
      return b.value - a.value
    })
}
