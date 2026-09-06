// Tra ngành cho những mã người dùng đã giao dịch, ghi vào `stock_prices.industry`
// (migration 0061).
//
// MỘT cuộc gọi cho cả danh sách mã: endpoint nhận `codeList:A,B,C`. Danh mục ghi tay hiếm
// khi quá vài chục mã nên không cần chia lô — nhưng vẫn cắt ở `TOI_DA_MOT_LUOT` để một sổ
// lệnh bất thường không dựng ra một URL dài vô hạn.
//
// File này KHÔNG có phép tính. Việc lật quan hệ "ngành → danh sách mã" thành "mã → ngành"
// nằm ở src/features/assets/sectors.ts, gói sang `_holdings.js`.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { parseIndustries } from './_holdings.js'

const FINFO_URL = 'https://api-finfo.vndirect.com.vn/v4/industry_classification'
const TOI_DA_MOT_LUOT = 100
const TIMEOUT_MS = 20_000

/**
 * Tra ngành cho `symbols` và ghi vào những dòng CHƯA có ngành. Trả số dòng đã ghi.
 *
 * Chỉ ghi khi `industry` đang rỗng, không ghi đè: cột này không phải thứ người dùng sửa,
 * nhưng nếu một ngày nào đó có, thì lượt cron không được xoá công của họ. Và ghi đè mỗi
 * chiều là hàng chục câu UPDATE mỗi ngày cho một dữ liệu gần như không bao giờ đổi.
 */
export async function refreshIndustries(
  sb: SupabaseClient,
  symbols: string[],
): Promise<number> {
  if (symbols.length === 0) return 0

  // Chỉ hỏi những mã đang thiếu ngành — không có gì thiếu thì khỏi gọi mạng.
  const { data: rows, error: docErr } = await sb
    .from('stock_prices')
    .select('symbol, industry')
    .in('symbol', symbols.slice(0, TOI_DA_MOT_LUOT))
  if (docErr) throw docErr

  const thieu = (rows as any[] ?? [])
    .filter((r) => !String(r.industry ?? '').trim())
    .map((r) => r.symbol as string)
  if (thieu.length === 0) return 0

  const url = `${FINFO_URL}?q=codeList:${encodeURIComponent(thieu.join(','))}&size=200`
  // Cùng bài học với dchart (xem history.ts): KHÔNG gửi `Accept: application/json`.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`finfo HTTP ${res.status}`)

  const text = await res.text()
  if (text.trim() === '') return 0
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return 0
  }

  const theoMa = parseIndustries(json)
  let daGhi = 0
  for (const symbol of thieu) {
    const nganh = theoMa.get(symbol)
    if (!nganh) continue
    // Một mã lỗi không được làm mất phần còn lại — cùng cách việc 3 cô lập lỗi theo mã.
    const { error } = await sb.from('stock_prices').update({ industry: nganh }).eq('symbol', symbol)
    if (error) throw error
    daGhi++
  }
  return daGhi
}
