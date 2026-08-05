// Hút danh sách mã cổ phiếu sàn HOSE (mã + tên công ty) từ SSI iBoard, ghi ra
// src/features/assets/hoseSymbols.ts để ô gợi ý mã trong sheet ghi lệnh dùng.
//
// Vì sao cần một file tĩnh: giá thị trường lấy từ Yahoo (xem docs/co-phieu-viet-nam.md),
// mà Yahoo KHÔNG trả tên công ty và cũng không có "danh sách mã cả sàn". Nếu ô gợi ý chỉ
// đọc bảng `stock_prices` thì nó chỉ biết những mã người dùng ĐÃ mua — đúng lúc cần gợi ý
// nhất (mua mã mới) thì nó im.
//
// Vì sao chạy ở MÁY chứ không ở edge function: SSI chặn dải IP trung tâm dữ liệu của
// Supabase (đo ngày 2026-08-06: 403 "Security Check" ở cả iboard-query và iboard-api, kể
// cả khi giả dạng trình duyệt đầy đủ). Máy cá nhân thì vào được. Danh sách mã của một sàn
// gần như không đổi, nên hút tay vài tháng một lần là đủ — khác hoàn toàn với GIÁ, thứ
// đổi mỗi phiên và vì vậy phải tự động.
//
// Chạy: node scripts/harvest-hose-symbols.mjs
// Cần: máy có đường ra internet vào được ssi.com.vn (thường là máy ở VN hoặc Nhật).

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTFILE = resolve(root, 'src/features/assets/hoseSymbols.ts')
const URL_HOSE = 'https://iboard-query.ssi.com.vn/stock/exchange/hose'

const res = await fetch(URL_HOSE, { headers: { 'User-Agent': 'Mozilla/5.0' } })
if (!res.ok) {
  console.error(`SSI trả HTTP ${res.status}. Nếu là 403: máy này đang ở dải IP bị SSI chặn.`)
  process.exit(1)
}
const json = await res.json()
if (!Array.isArray(json?.data)) {
  console.error('SSI trả payload lạ — không có mảng `data`. Có thể họ đã đổi định dạng.')
  process.exit(1)
}

// stockType 's' = cổ phiếu thường. Bỏ chứng quyền (coveredWarrant), ETF, trái phiếu —
// những thứ đó không phải cổ phiếu và Yahoo cũng không có giá theo hậu tố .VN.
const rows = json.data
  .filter((x) => x?.stockType === 's' && typeof x.stockSymbol === 'string' && x.stockSymbol.trim())
  .map((x) => [x.stockSymbol.trim().toUpperCase(), String(x.companyNameVi ?? '').trim()])
  .sort((a, b) => a[0].localeCompare(b[0]))

if (rows.length < 200) {
  console.error(`Chỉ lấy được ${rows.length} mã — quá ít, HOSE có ~400. Không ghi đè file cũ.`)
  process.exit(1)
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const body = rows.map(([sym, ten]) => `  ['${sym}', '${esc(ten)}'],`).join('\n')

const out = `// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: SSI iBoard (${URL_HOSE}), lọc stockType='s'
// Sinh lại: node scripts/harvest-hose-symbols.mjs
// Vì sao là file tĩnh chứ không gọi mạng: xem đầu scripts/harvest-hose-symbols.mjs
//
// Chỉ có sàn HOSE. Giá thị trường lấy từ Yahoo, mà Yahoo chỉ phục vụ HOSE qua hậu tố
// '.VN' — liệt kê mã HNX/UPCOM ở đây sẽ gợi ý những mã mà app không lấy được giá, tức là
// mời người dùng vào một chỗ chỉ để nhận thông báo "chưa có giá".
export const HOSE_SYMBOLS: readonly (readonly [symbol: string, name: string])[] = [
${body}
]

/** Số mã lúc sinh file, để test canh được nếu lần hút sau bị cắt cụt. */
export const HOSE_SYMBOL_COUNT = ${rows.length}
`

writeFileSync(OUTFILE, out, 'utf8')
console.log(`Đã ghi ${rows.length} mã HOSE → src/features/assets/hoseSymbols.ts`)
