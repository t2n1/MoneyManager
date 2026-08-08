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
