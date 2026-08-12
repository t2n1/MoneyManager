// Canh chốt "thiếu giá MỘT PHẦN quỹ đang giữ cũng phải bỏ qua, không chỉ khi thiếu giá MỌI
// quỹ" ở Việc 2 của `index.ts` (chế độ cron).
//
// VÌ SAO KHÔNG CHÉP LẠI CÔNG THỨC: `planFundBackfill` (chốt ③b) đã từng đi trước cron một
// bước ở lỗi CÙNG BẢN CHẤT này (a7e4f38) — thiếu giá một phần quỹ vẫn được `fundValue` trả
// về một con số (quỹ thiếu tạm tính theo giá vốn) mà nơi gọi không kiểm `missingNavs`. Nếu
// bài test này tự viết lại điều kiện `if` bằng tay, sửa `index.ts` mà quên sửa bài test thì
// bài test vẫn xanh dù code đã hỏng lại — đúng kiểu năm bài test canh đã hỏng trước đây
// trong nhánh này. Nên ở đây TRÍCH đúng đoạn code trong `index.ts` ra rồi CHẠY THẬT nó với
// `fundValue` thật (không phải bản chép tay) — sửa sai một trong hai bên là bài test đỏ.
//
// Chạy bằng vitest (Node), không cần Deno: chỉ đọc `index.ts` bằng `node:fs` để trích đoạn
// code, không `import` cả file (file đó có `npm:@supabase/supabase-js` và `Deno.serve`,
// vitest không chạy được) — cùng lý do `navs.test.ts` cạnh nó chỉ import hàm thuần.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fundValue, type FundHolding } from '../../../src/features/assets/fundHoldings'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const HERE = fileURLToPath(new URL('.', import.meta.url))
const NOI_DUNG = readFileSync(join(HERE, 'index.ts'), 'utf8')

/**
 * Cắt phần bên trong dấu `(` tại `openParenIdx` tới dấu `)` khớp — đếm độ sâu để không cắt
 * hụt khi biểu thức bên trong có `(` lồng (ví dụ lời gọi hàm). `text[openParenIdx]` phải là
 * `'('`.
 */
function catTrongDauNgoac(text: string, openParenIdx: number): string {
  let doSau = 0
  for (let i = openParenIdx; i < text.length; i++) {
    if (text[i] === '(') doSau++
    else if (text[i] === ')') {
      doSau--
      if (doSau === 0) return text.slice(openParenIdx + 1, i)
    }
  }
  throw new Error('không tìm thấy dấu ) khớp')
}

// Mốc DUY NHẤT trong index.ts gọi fundValue cho việc 2 — nếu ai đổi tên biến/thứ tự tham
// số, bài test này báo lỗi rõ ràng ở đây (throw ngay lúc nạp file test) thay vì im lặng
// trích sai đoạn khác.
const MOC = 'const { marketValue, missingNavs } = fundValue(holdings, navByFund)'
const viTriMoc = NOI_DUNG.indexOf(MOC)
if (viTriMoc === -1)
  throw new Error(`index.ts đã đổi cách gọi fundValue ở Việc 2 — cập nhật MOC trong bài test này. Nội dung tìm: "${MOC}"`)

const viTriIf = NOI_DUNG.indexOf('if (', viTriMoc)
const dieuKienBoQua = catTrongDauNgoac(NOI_DUNG, viTriIf + 'if '.length)

const viTriDemBoQua = NOI_DUNG.indexOf('demBoQua(kq,', viTriIf)
if (viTriDemBoQua === -1)
  throw new Error('không tìm thấy demBoQua(kq, ...) ngay sau nhánh if thiếu giá')
const thamSoDemBoQua = catTrongDauNgoac(NOI_DUNG, viTriDemBoQua + 'demBoQua'.length)
// thamSoDemBoQua = "kq, <biểu thức chọn lý do>" — cắt phần sau dấu phẩy đầu tiên. Biểu
// thức chọn lý do (ternary so sánh độ dài) không chứa dấu phẩy nên cắt tại dấu phẩy đầu là
// đủ, không cần đếm độ sâu như hàm trên.
const bieuThucLyDo = thamSoDemBoQua.slice(thamSoDemBoQua.indexOf(',') + 1).trim()

// Chạy THẬT hai đoạn trích được — không phải bản chép tay — với `missingNavs`/`marketValue`
// (từ `fundValue` thật) và `holdings` do bài test dựng.
const dieuKienBoQuaFn = new Function(
  'missingNavs',
  'marketValue',
  `return (${dieuKienBoQua})`,
) as (missingNavs: string[], marketValue: number | null) => boolean
const lyDoFn = new Function(
  'missingNavs',
  'holdings',
  `return (${bieuThucLyDo})`,
) as (missingNavs: string[], holdings: unknown[]) => string

// Hai quỹ THẬT chủ app đang giữ (xem docs/quy-nhat.md, ba con số đối chiếu Rakuten).
const QUY_A = '9I31223A' // 28.429 口, giá vốn 40.000 ¥ (giả định cho bài test, không phải số thật — chỉ cần tổng khớp 70.000)
const QUY_B = '9I314241' // 12.595 口, giá vốn 30.000 ¥
const holdings: FundHolding[] = [
  { assocFundCd: QUY_A, units: 28429, costBasis: 40000, avgNav: 14070 },
  { assocFundCd: QUY_B, units: 12595, costBasis: 30000, avgNav: 23820 },
]

describe('index.ts (fund-refresh, chế độ cron) — bỏ qua khi thiếu giá MỘT PHẦN quỹ đang giữ', () => {
  it('đủ giá cả hai quỹ → KHÔNG bỏ qua', () => {
    const navByFund = new Map([
      [QUY_A, 20053],
      [QUY_B, 18855],
    ])
    const { marketValue, missingNavs } = fundValue(holdings, navByFund)
    expect(missingNavs).toEqual([])
    expect(dieuKienBoQuaFn(missingNavs, marketValue)).toBe(false)
  })

  it('thiếu giá MỘT quỹ (quỹ kia vẫn có giá) → PHẢI bỏ qua, lý do thieu-gia-mot-so-quy', () => {
    // Đây là dòng đỏ thật: bản cũ chỉ kiểm `marketValue === null`, mà thiếu giá một quỹ thì
    // `fundValue` VẪN trả một số (quỹ thiếu tạm tính theo giá vốn) — `marketValue` khác
    // null nên điều kiện cũ cho qua, ghi một con số sai ~40% mà đóng dấu 'auto'.
    const navByFund = new Map([[QUY_A, 20053]]) // thiếu QUY_B
    const { marketValue, missingNavs } = fundValue(holdings, navByFund)
    expect(missingNavs).toEqual([QUY_B])
    expect(marketValue).not.toBeNull() // đúng cái làm điều kiện cũ mù mắt
    expect(dieuKienBoQuaFn(missingNavs, marketValue)).toBe(true)
    expect(lyDoFn(missingNavs, holdings)).toBe('thieu-gia-mot-so-quy')
  })

  it('thiếu giá MỌI quỹ đang giữ → PHẢI bỏ qua, lý do thieu-gia-moi-quy (giữ nguyên tên cũ)', () => {
    const navByFund = new Map<string, number>() // rỗng
    const { marketValue, missingNavs } = fundValue(holdings, navByFund)
    expect(marketValue).toBeNull()
    expect(dieuKienBoQuaFn(missingNavs, marketValue)).toBe(true)
    expect(lyDoFn(missingNavs, holdings)).toBe('thieu-gia-moi-quy')
  })
})
