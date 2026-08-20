// Hai chốt cho khối 支給 (通勤手当 / DB掛金), cả hai đều canh một lớp lỗi LẶNG LẼ —
// code vẫn chạy, test đơn vị vẫn xanh, chỉ có số trong sổ là sai.
// Thiết kế: docs/superpowers/specs/2026-08-20-phieu-luong-thu-nhap-thuc-notes.md
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const doc = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

/**
 * CLI `nhap-phieu-luong.mjs` ghi tay `[thu, thuKhac, ...chi]` — KHÔNG ghi `cap` và
 * không bật cờ dòng neo. Phiếu có 通勤手当 đi qua nó là một bộ dòng THIẾU: tiền tàu
 * vẫn nằm trong Thu, DB掛金 mất hút, và không có gì báo.
 */
describe('CLI nhap-phieu-luong: từ chối phiếu có khối 支給', () => {
  const src = doc('../scripts/nhap-phieu-luong.mjs')

  it('lọc kế hoạch qua chotKhoiCap ngay sau dungKeHoach', () => {
    expect(src).toMatch(/dungKeHoach\([^)]*\)\.map\(chotKhoiCap\)/)
  })

  it('chotKhoiCap đổi trạng thái sang tu-choi khi cap không rỗng', () => {
    expect(src).toContain("k.cap?.length")
    expect(src).toContain("trangThai: 'tu-choi'")
  })

  // ghiKeHoach KHONG duoc am tham hoc cach ghi `cap`: neu ai do them nó vào đây mà
  // quên phần bật cờ dòng neo thì lại đúng lớp lỗi mà chốt trên đang canh.
  it('ghiKeHoach vẫn không ghi cap (nếu đổi, phải xử luôn cờ dòng neo)', () => {
    const than = src.slice(src.indexOf('async function ghiKeHoach'))
    expect(than.slice(0, than.indexOf('\n}'))).not.toContain('r.cap')
  })
})

/**
 * `xoaPhieuLuong` phải TRẢ dòng neo về thống kê TRƯỚC khi xoá. Dòng "trung hoà" là tay
 * cầm duy nhất để tìm dòng neo — xoá trước là mất nó, và dòng neo nằm ngoài thống kê
 * vĩnh viễn (Thu thiếu đúng một khoản lương ròng, không dấu vết).
 */
describe('supabaseRepo.xoaPhieuLuong: trả dòng neo trước khi xoá', () => {
  const src = doc('../src/data/supabaseRepo.ts')
  const than = (() => {
    const i = src.indexOf('async xoaPhieuLuong()')
    expect(i, 'không thấy xoaPhieuLuong trong supabaseRepo.ts').toBeGreaterThan(-1)
    return src.slice(i, src.indexOf('\n  },', i))
  })()

  it('đọc dòng trung hoà trước, xoá sau', () => {
    const iDoc = than.indexOf("'給与 % · trung hoà dòng neo'")
    const iXoa = than.indexOf(".delete({ count: 'exact' })")
    expect(iDoc).toBeGreaterThan(-1)
    expect(iXoa).toBeGreaterThan(iDoc)
  })

  it('tắt cờ exclude_from_stats của dòng neo', () => {
    expect(than).toContain('exclude_from_stats: false')
  })

  // Dong mang tien to `給与 ` chinh la dong import — no KHONG phai dong neo, va bat co
  // lai cho no la dua tien import tro lai vao Thu.
  it('loại dòng mang tiền tố 給与 khỏi ứng viên dòng neo', () => {
    expect(than).toContain("startsWith('給与 ')")
  })
})

/**
 * Dòng `通勤手当` là một dòng THU, nên `category_id` của nó phải là danh mục loại
 * `income`. Sổ thật có thể có sẵn một danh mục CHI cùng tên do người dùng tự tạo, và tra
 * theo tên trần sẽ nhặt đúng cái đó: giao dịch `type: 'income'` mang danh mục chi không
 * hiện ở bất kỳ báo cáo nào — không lỗi, không cảnh báo, chỉ là biến mất.
 */
describe('trang import: danh mục phụ cấp phải lọc theo type', () => {
  const src = doc('../src/features/phieu-luong/ImportPhieuLuongPage.tsx')

  it('tra danh mục Phụ cấp trong nhóm income, không tra theo tên trần', () => {
    expect(src).toContain("categories.find((c) => c.type === 'income' && c.name === DANH_MUC_PHU_CAP)")
  })

  it('nút tạo danh mục tạo đúng loại income', () => {
    const i = src.indexOf('async function taoDmPhuCap')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(i, src.indexOf('\n  }', i))).toContain("type: 'income'")
  })
})

/**
 * Hai dòng của khối 支給 đi HAI phía khác nhau, và đó là chỗ dễ trộn lẫn nhất:
 * `通勤手当` ngoài Thu (công ty trả tiền đi lại, tiền vào rồi ra để mua vé), `DB掛金`
 * TRONG Thu (tiền người dùng kiếm được rồi đem tiết kiệm vào 退職金). Chốt ở tầng nguồn
 * vì cờ này không có cách nào sai ồn ào: đếm sai phía thì Thu chỉ lệch đi, không lỗi nào nổ.
 */
describe('khối 支給 — hai dòng, hai phía', () => {
  const src = doc('../src/features/phieu-luong/nhap.ts')

  it('không còn mốc kỳ nào quyết định phía của phụ cấp', () => {
    expect(src).not.toContain('KY_PHU_CAP_VAO_THU')
  })

  it('dòng phụ cấp đi lại mang exclude_from_stats: true', () => {
    const i = src.indexOf('phụ cấp đi lại (${NHAN_DI_LAI})')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(src.lastIndexOf('cap.push({', i), i)).toContain('exclude_from_stats: true')
  })

  it('dòng DB掛金 → 退職金 KHÔNG mang exclude_from_stats', () => {
    const i = src.indexOf('${NHAN_HUU} → ${TEN_TK_HUU}')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(src.lastIndexOf('cap.push({', i), i)).not.toContain('exclude_from_stats')
  })
})
