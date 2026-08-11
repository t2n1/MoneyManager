// Mọi cột của `profiles` phải được đường KHÔI PHỤC nhắc tới.
//
// Vì sao cần luật này: `exportAll` dùng `select('*')` nên cột mới tự động có trong bản
// lưu, nhưng `importAll` LIỆT KÊ TỪNG CỘT trong `.from('profiles').update({...})`. Thêm
// một cột hồ sơ mà quên chỗ đó thì khôi phục vẫn chạy, không lỗi, không cảnh báo —
// chỉ âm thầm trả cột đó về default. Đúng lỗi đã xảy ra thật với `density_pref`
// (migration 0040): bản lưu mang 'full', khôi phục xong thành 'visual'.
//
// Không test được bằng cách chạy thật (cần Supabase thật + phiên đăng nhập), nên chặn ở
// mức nguồn — cùng cách các luật ở designSystem.test.ts đang làm.
//
// Ở tests/ chứ không phải src/: file này đọc filesystem bằng `node:fs`, mà
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager")
// nên pathname trả về đã percent-encode → ENOENT.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')

const types = readFileSync(join(SRC, 'types', 'database.types.ts'), 'utf8')
const supabaseRepo = readFileSync(join(SRC, 'data', 'supabaseRepo.ts'), 'utf8')
const demoRepo = readFileSync(join(SRC, 'data', 'demoRepo.ts'), 'utf8')

/** Tên cột khai trong `export type ProfileRow = { … }`. */
function profileColumns(): string[] {
  const start = types.indexOf('export type ProfileRow = {')
  expect(start, 'không tìm thấy ProfileRow trong database.types.ts').toBeGreaterThan(-1)
  const body = types.slice(start, types.indexOf('\n}', start))
  return [...body.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
}

/**
 * Cột KHÔNG cần khôi phục, mỗi cái một lý do — không phải danh sách để nhét thêm khi
 * test đỏ. Đỏ vì cột mới thì việc phải làm là thêm cột đó vào importAll.
 */
const KHONG_KHOI_PHUC: Record<string, string> = {
  // Khoá chính, lấy từ phiên đang đăng nhập chứ không từ file.
  user_id: 'định danh người đang khôi phục, không phải dữ liệu trong file',
  // Mốc tạo hàng của DB đích.
  created_at: 'mốc của bản ghi ở DB đích',
  // Chỉ edge function ghi bằng service role — xem ProfilePatch ở repo.ts.
  push_last_sent_at: 'chỉ service role ghi; client sửa được là tự mở đường tắt push',
}

describe('sao lưu — khôi phục không được bỏ sót cột hồ sơ', () => {
  const cols = profileColumns()

  it('đọc được danh sách cột của ProfileRow', () => {
    // Nếu regex trên hỏng (đổi cách khai type), mọi kiểm tra dưới sẽ xanh giả.
    expect(cols.length).toBeGreaterThan(10)
    expect(cols).toContain('base_currency')
    expect(cols).toContain('density_pref')
  })

  /**
   * Thân của `.from('profiles').update({ … })` trong importAll.
   *
   * Cắt lấy đúng khối này chứ không quét cả file: tên cột xuất hiện ở nhiều chỗ khác
   * (getProfile, updateProfile, ProfilePatch), quét cả file thì cột nào cũng "có" và
   * luật thành vô nghĩa.
   *
   * Không so khớp cứng `col: data.profile.col`: giá trị được BỌC là chuyện bình thường
   * và cần thiết ở đây (`?? null` cho cột thêm sau, `parseDensity(...)` cho cột có
   * check ở DB). Luật chỉ đòi hai điều — cột có mặt làm khoá, và giá trị đọc từ file.
   */
  const updateBlock = (() => {
    const from = supabaseRepo.lastIndexOf(".from('profiles')\n          .update({")
    expect(from, "không tìm thấy khối .from('profiles').update({…}) của importAll").toBeGreaterThan(-1)
    const open = supabaseRepo.indexOf('{', supabaseRepo.indexOf('.update(', from))
    let depth = 0
    for (let i = open; i < supabaseRepo.length; i++) {
      if (supabaseRepo[i] === '{') depth++
      else if (supabaseRepo[i] === '}') {
        depth--
        if (depth === 0) return supabaseRepo.slice(open, i + 1)
      }
    }
    throw new Error('khối .update({…}) không đóng')
  })()

  it('importAll của supabaseRepo nhắc tới mọi cột hồ sơ cần khôi phục', () => {
    const thieu = cols.filter(
      (c) =>
        !(c in KHONG_KHOI_PHUC) &&
        !(new RegExp(`\\b${c}:`).test(updateBlock) && updateBlock.includes(`data.profile.${c}`)),
    )
    expect(
      thieu,
      `Thiếu ở .from('profiles').update({…}) trong importAll: ${thieu.join(', ')}.\n` +
        `Bỏ sót thì khôi phục âm thầm trả cột đó về default. Cột cố ý không khôi phục thì ` +
        `thêm vào KHONG_KHOI_PHUC trong file test này KÈM LÝ DO.`,
    ).toEqual([])
  })

  it('demoRepo cũng đặt mặc định cho cột mới khi nhập bản lưu cũ', () => {
    // Bản lưu xuất trước một migration thì thiếu hẳn trường. demoRepo phải điền default,
    // không thì profile trong localStorage mang `undefined` và mọi chỗ đọc nó phải tự
    // phòng thân. Chỉ kiểm cột thêm SAU khi có cơ chế này (v8 backup trở đi).
    for (const c of ['push_hour', 'push_tz', 'density_pref']) {
      expect(demoRepo, `demoRepo không điền mặc định cho ${c} lúc importAll`).toContain(
        `${c}:`,
      )
    }
  })
})
