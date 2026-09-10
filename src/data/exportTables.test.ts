import { describe, expect, it } from 'vitest'
import { DATA_TABLES, pageOrderFor, type DataTable } from './exportTables'

// Test này đối chiếu code với SQL THẬT trong supabase/migrations, không lặp lại
// hằng số trong exportTables.ts. Nó bắt đúng lỗi đã xảy ra 2026-08-02: exportAll gọi
// `.order('id')` trên transaction_tags (bảng nối khoá kép, không có cột id) làm nút
// "Xuất dữ liệu" hỏng hoàn toàn — mà lỗi chỉ lộ ra khi bấm vào app thật.

// Đọc file bằng import.meta.glob chứ không phải node:fs: tsconfig.app.json chỉ khai
// `types: ["vite/client"]` nên mọi API của Node đều không có kiểu, và `tsc -b` lúc build
// sẽ đỏ dù vitest chạy được ở máy.
const MIGRATIONS = import.meta.glob('../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Đọc mọi migration, dựng bản đồ bảng → tập cột. */
function columnsByTable(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (table: string, col: string) => {
    const set = out.get(table) ?? new Set<string>()
    set.add(col)
    out.set(table, set)
  }

  for (const path of Object.keys(MIGRATIONS).sort()) {
    // Chuẩn hoá CRLF trước: file trên Windows kết thúc dòng bằng \r\n nên tách theo
    // ",\n" sẽ không khớp và cả khối cột bị đọc thành một dòng.
    // Bỏ chú thích cuối dòng để "-- add column x" không bị đọc thành DDL thật.
    const sql = MIGRATIONS[path].replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '')

    // create table [if not exists] public.X ( ... );
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi,
    )) {
      const [, table, body] = m
      for (const line of body.split(',\n')) {
        const col = /^\s*(\w+)\s+\w/.exec(line)?.[1]
        // Ràng buộc ở mức bảng (primary key/unique/foreign key/check) không phải cột.
        if (col && !/^(primary|unique|foreign|check|constraint|exclude)$/i.test(col))
          add(table, col)
      }
    }

    // alter table public.X add column [if not exists] Y ...
    for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?public\.(\w+)([\s\S]*?);/gi)) {
      const [, table, body] = m
      for (const c of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi))
        add(table, c[1])
    }
  }
  return out
}

const COLUMNS = columnsByTable()

describe('bản đồ migration', () => {
  it('tìm thấy file migration', () => {
    // Glob không khớp gì thì mọi assert dưới đây thành xanh vô nghĩa.
    expect(Object.keys(MIGRATIONS).length).toBeGreaterThan(20)
  })

  it('đọc được cột của những bảng đã biết', () => {
    // Nếu parser hỏng thì mọi assert dưới đây thành xanh vô nghĩa (tập rỗng ⊂ mọi tập),
    // nên phải chốt vài cột chắc chắn có trước.
    expect(COLUMNS.get('transactions')).toContain('id')
    expect(COLUMNS.get('transactions')).toContain('occurred_on')
    expect(COLUMNS.get('transaction_tags')).toContain('transaction_id')
    expect(COLUMNS.get('transaction_tags')).toContain('tag_id')
    // Cột thêm bằng alter table cũng phải thấy.
    expect(COLUMNS.get('accounts')).toContain('asset_group')
    expect(COLUMNS.get('transactions')).toContain('is_remittance')
  })

  it('đọc được bảng nhóm nhãn của 0039', () => {
    expect(COLUMNS.get('tag_groups')).toContain('name')
    expect(COLUMNS.get('tag_groups')).toContain('sort_order')
    expect(COLUMNS.get('tags')).toContain('group_id')
  })

  it('transaction_tags KHÔNG có cột id', () => {
    // Đây là tiền đề của cả bài: nếu ngày nào đó bảng có id thật thì test này đỏ và
    // người sửa sẽ biết có thể bỏ ngoại lệ trong PAGE_ORDER đi.
    expect(COLUMNS.get('transaction_tags')?.has('id')).toBe(false)
  })
})

describe('pageOrderFor', () => {
  it('mọi bảng xuất đều có trong migration', () => {
    for (const table of DATA_TABLES) expect(COLUMNS.has(table), table).toBe(true)
  })

  it('khoá sắp xếp của mọi bảng đều là cột có thật', () => {
    for (const table of DATA_TABLES) {
      const cols = COLUMNS.get(table)
      for (const key of pageOrderFor(table)) {
        expect(cols?.has(key), `${table}.${key}`).toBe(true)
      }
    }
  })

  it('mặc định là id', () => {
    expect(pageOrderFor('transactions')).toEqual(['id'])
  })

  it('bảng nối dùng cả hai cột của khoá chính', () => {
    // Một cột thôi thì không đơn trị: một transaction gắn nhiều tag, phân trang theo
    // transaction_id sẽ trả lại dòng cũ và bỏ sót dòng khác ở ranh giới trang.
    expect(pageOrderFor('transaction_tags')).toEqual(['transaction_id', 'tag_id'])
  })

  it('không khai khoá sắp xếp cho bảng không nằm trong danh sách xuất', () => {
    // PAGE_ORDER là Partial nên gõ sai tên bảng sẽ im lặng rơi về ['id'].
    const stray = DATA_TABLES.filter((t) => pageOrderFor(t) !== pageOrderFor('accounts'))
    for (const t of stray) expect(DATA_TABLES).toContain(t as DataTable)
  })
})

// Chiều NGƯỢC của bài test trên: mọi bảng migration tạo ra mang cột `user_id` (tức dữ
// liệu RIÊNG của một người dùng) phải nằm trong DATA_TABLES, trừ khi khai rõ lý do ở
// allow-list dưới đây. Bắt đúng lớp lỗi Task 7: `card_bills` có user_id, ăn cascade từ
// accounts, nhưng chưa từng lọt vào exportAll/importAll của supabaseRepo — nên restore
// xoá accounts là xoá luôn card_bills, không gì chèn lại. `demoRepo` xuất/nhập bảng này
// từ đầu nên demoRepo.test.ts/backupImport.test.ts xanh trong khi đường thật đã hỏng.
describe('bảng nào có user_id cũng phải nằm trong DATA_TABLES', () => {
  /**
   * Bảng có `user_id` nhưng CỐ Ý không xuất/khôi phục — mỗi dòng phải nói rõ lý do, để
   * lần thêm bảng mới không vô tình lọt qua đường sao lưu như `card_bills` đã từng.
   */
  const EXCLUDED_TABLES_WITH_USER_ID: readonly string[] = [
    // profiles: đã có field `profile` riêng (số ít) trong BackupData qua getProfile(),
    // không đi qua cơ chế DATA_TABLES/selectAll dành cho bảng nhiều-dòng.
    'profiles',
    // notification_state: trạng thái "đã báo hay chưa" của một THIẾT BỊ cụ thể — mang
    // theo khi khôi phục sang máy khác là im lặng bỏ lỡ thông báo lẽ ra phải bắn lại.
    'notification_state',
    // fx_history: cache tỷ giá quá khứ, tự nạp lại được từ API tỷ giá — không phải dữ
    // liệu người dùng tự tay tạo, mất thì gọi lại API là có.
    'fx_history',
    // push_subscriptions: gắn với TRÌNH DUYỆT/thiết bị cụ thể — mang sang máy khác là
    // giữ một endpoint đã chết, gửi push vào đó chỉ tổ lỗi im lặng.
    'push_subscriptions',
  ]

  it('mọi bảng có cột user_id đều xuất hiện trong DATA_TABLES hoặc allow-list', () => {
    for (const [table, cols] of COLUMNS) {
      if (!cols.has('user_id')) continue
      const daXuat = (DATA_TABLES as readonly string[]).includes(table)
      const coLoaiTru = EXCLUDED_TABLES_WITH_USER_ID.includes(table)
      expect(
        daXuat || coLoaiTru,
        `${table}: có user_id nhưng không nằm trong DATA_TABLES, cũng không có trong allow-list — kiểm tra đường sao lưu supabaseRepo.exportAll/importAll`,
      ).toBe(true)
    }
  })

  it('allow-list không chứa bảng đã được thêm vào DATA_TABLES thật rồi', () => {
    // Bảng nào lên DATA_TABLES thì bỏ khỏi allow-list — còn tên ở cả hai là dấu hiệu
    // ai đó copy-paste danh sách mà quên xoá.
    for (const table of EXCLUDED_TABLES_WITH_USER_ID) {
      expect((DATA_TABLES as readonly string[]).includes(table), table).toBe(false)
    }
  })
})
