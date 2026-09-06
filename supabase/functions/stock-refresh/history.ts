// Lịch sử giá theo phiên: hút từ dchart (VNDirect) và ghi vào stock_price_history /
// index_prices (migration 0061).
//
// Vì sao dchart chứ không Yahoo — nguồn mà `prices.ts` đang dùng cho giá HIỆN TẠI: Yahoo
// KHÔNG có lịch sử cho chỉ số Việt Nam. `^VNINDEX.VN` tồn tại (INDEX / HOSE / VND) nhưng
// `validRanges` chỉ ['1d','5d']; `^VNINDEX`, `VNINDEX`, `VNINDEX.VN`, `^VN30` đều 404.
// Đã thử tay 06/09/2026 — đừng thử lại. dchart trả 2.252 phiên VNINDEX từ 2017-08-24 và
// 2.662 phiên HPG từ 2016-01-04, và bar cuối khớp đúng giá Yahoo/`stock_prices.price`.
//
// Đường lui nếu dchart chết: `iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=VNINDEX&from=&to=`
// trả đúng cùng hình dạng dữ liệu. CỐ Ý không code sẵn hai nguồn: biểu đồ hụt một phiên
// không phải thảm hoạ, còn hai nguồn là gấp đôi chỗ hỏng.
//
// File này KHÔNG có phép tính. Quy đổi thang và đọc JSON nằm ở src/features/assets/dchart.ts,
// gói sang `_holdings.js` — sửa luật ở đó rồi `npm run bundle:rules`.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  DCHART_INDEX_SCALE,
  DCHART_STOCK_SCALE,
  parseDchart,
  unixDay,
  type DchartBar,
} from './_holdings.js'

const DCHART_URL = 'https://dchart-api.vndirect.com.vn/dchart/history'

/**
 * Mốc xin dữ liệu khi bảng còn rỗng — sớm hơn phiên đầu tiên mà nguồn có (2016-01-04 với
 * cổ phiếu, 2017-08-24 với chỉ số). Xin sớm hơn thì nguồn tự cắt, không lỗi.
 */
const BAT_DAU = '2015-01-01'

/** Ghi theo lô: 2.600 phiên một câu upsert là payload to và dễ timeout. */
const LO_GHI = 500

/** Chặn một mã treo làm cả lượt cron hết giờ. */
const TIMEOUT_MS = 20_000

async function hutDchart(symbol: string, fromISO: string, scale: number): Promise<DchartBar[]> {
  const den = unixDay('2100-01-01') // "tới hết" — nguồn tự cắt ở phiên mới nhất
  const url = `${DCHART_URL}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${unixDay(fromISO)}&to=${den}`
  // KHÔNG gửi `Accept: application/json`. Nghe vô lý với một API trả JSON, nhưng dchart
  // trả **406 Not Acceptable** khi có header đó — đo thật 06/09/2026: cùng một URL, chỉ
  // khác header, `Accept: application/json` ra 406 còn không header / `*/*` ra 200 với
  // 2.252 phiên. Thêm lại là làm cả khối lịch sử thất bại lặng lẽ.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`dchart ${symbol} HTTP ${res.status}`)

  // Mã không tồn tại → dchart trả **HTTP 200 với THÂN RỖNG** (đo thật 06/09/2026), nên
  // `res.json()` ném SyntaxError. Đó không phải lỗi hệ thống mà là "nguồn không có mã
  // này" — trả rỗng để nó đi tiếp như một mã chưa có dữ liệu, thay vì đẩy một lỗi phân
  // tích JSON vô nghĩa vào log.
  const text = await res.text()
  if (text.trim() === '') return []
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return []
  }
  return parseDchart(json, scale)
}

/** Phiên MỚI NHẤT đã có trong bảng; null = bảng chưa có phiên nào của khoá này. */
async function phienMoiNhat(
  sb: SupabaseClient,
  table: string,
  keyCol: string,
  keyVal: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from(table)
    .select('trading_date')
    .eq(keyCol, keyVal)
    .order('trading_date', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data as any[])?.[0]?.trading_date ?? null
}

async function ghiLo(
  sb: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  for (let i = 0; i < rows.length; i += LO_GHI) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + LO_GHI), { onConflict })
    if (error) throw error
  }
  return rows.length
}

/**
 * Đồng bộ lịch sử một mã. Bảng rỗng thì hút TRỌN từ 2016; có rồi thì chỉ xin từ phiên mới
 * nhất trở đi.
 *
 * Xin lại TỪ phiên mới nhất (không phải từ ngày kế tiếp) là cố ý: nguồn có thể sửa lại bar
 * cuối sau phiên (giá điều chỉnh sau chia tách), và một phiên chồng lên nhau thì upsert đè
 * đúng chỗ. Tốn một dòng, đổi lấy việc không bao giờ giữ một bar đã lỗi thời.
 */
export async function refreshSymbolHistory(sb: SupabaseClient, symbol: string): Promise<number> {
  const moiNhat = await phienMoiNhat(sb, 'stock_price_history', 'symbol', symbol)
  const bars = await hutDchart(symbol, moiNhat ?? BAT_DAU, DCHART_STOCK_SCALE)
  if (bars.length === 0) return 0
  return await ghiLo(
    sb,
    'stock_price_history',
    bars.map((b) => ({ symbol, trading_date: b.trading_date, close: b.close })),
    'symbol,trading_date',
  )
}

/** Y hệt trên nhưng cho chỉ số — bảng khác vì đơn vị khác (xem migration 0061). */
export async function refreshIndexHistory(sb: SupabaseClient, code: string): Promise<number> {
  const moiNhat = await phienMoiNhat(sb, 'index_prices', 'index_code', code)
  const bars = await hutDchart(code, moiNhat ?? BAT_DAU, DCHART_INDEX_SCALE)
  if (bars.length === 0) return 0
  return await ghiLo(
    sb,
    'index_prices',
    bars.map((b) => ({ index_code: code, trading_date: b.trading_date, close_x100: b.close })),
    'index_code,trading_date',
  )
}
