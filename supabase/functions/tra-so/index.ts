// Edge function tra-so — cầu giữ khoá API cho nút "Tra hộ" ở màn Tương lai.
//
// VÌ SAO PHẢI CÓ. Khoá API không được nằm phía trình duyệt: mọi biến VITE_* bị nhúng vào
// bundle công khai, ai mở mã nguồn cũng lấy được khoá và tiêu hạn mức.
//
// FUNCTION NÀY CỐ TÌNH NGU. Không phép tính tiền nào, không đụng DB. Việc kiểm kết quả
// nằm ở src/features/lifetime/traSoKetQua.ts, nơi có unit test. Nhờ vậy KHÔNG phải gói
// bundle như push-notify/stock-refresh — không có bản sao luật nào để trôi lệch.
//
// APP KHÔNG ĐƯỢC CHỌN MODEL. Model, độ dài tối đa và công tắc tra web đều ghim ở đây.
// Nếu để app gửi lên thì một lỗi vòng lặp phía app đốt sạch hạn mức trong vài giây.
//
// Chạy thử tại máy:  supabase functions serve tra-so
// Deploy:            supabase functions deploy tra-so
// Đặt khoá:          supabase secrets set AI_API_KEY=...

// deno-lint-ignore-file no-explicit-any
const AI_API_KEY = (Deno.env.get('AI_API_KEY') ?? '').trim()

/** Dài tối đa của câu hỏi. Chặn app gửi lên một câu khổng lồ vì lỗi. */
const MAX_VAN = 4000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ĐOẠN DUY NHẤT PHỤ THUỘC NHÀ CUNG CẤP. Đổi hãng = sửa đúng hàm này.
//
// CỐ Ý KHÔNG dựng khung cắm mô-đun ở đây. Lý do không phải "cho gọn" mà là: hãng chưa
// được chốt (xem mục "Quyết định còn treo" trong bản thiết kế), và cách quyết là chạy
// thử THẬT cùng một câu hỏi qua hai bên. Một khung cắm dựng trước khi biết mình cần gì
// là dựng sai. Khi đã chốt, ~30 dòng này là tất cả những gì phải đụng.
// ─────────────────────────────────────────────────────────────────────────────
async function goiNhaCungCap(van: string): Promise<unknown> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: van }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0 },
      }),
    },
  )
  if (!res.ok) throw new Error(`Nhà cung cấp trả ${res.status}: ${await res.text()}`)
  const data: any = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''
  // Model hay bọc JSON trong ```json … ``` dù đã dặn. Bóc ra trước khi parse.
  const sach = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  return JSON.parse(sach)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, loi: 'Chỉ nhận POST.' }, 405)

  // Đòi đã đăng nhập. Supabase đã kiểm chữ ký JWT trước khi tới đây (deploy KHÔNG dùng
  // --no-verify-jwt, khác stock-refresh vốn do cron gọi); ở đây chỉ cần chắc là có.
  if (!req.headers.get('Authorization')) {
    return json({ ok: false, loi: 'Chưa đăng nhập.' }, 401)
  }
  if (!AI_API_KEY) {
    return json({ ok: false, loi: 'Thiếu AI_API_KEY phía server.' }, 500)
  }

  let van: unknown
  try {
    van = (await req.json())?.van
  } catch {
    return json({ ok: false, loi: 'Thân yêu cầu không phải JSON.' }, 400)
  }
  if (typeof van !== 'string' || van.trim().length === 0) {
    return json({ ok: false, loi: 'Thiếu câu hỏi.' }, 400)
  }
  if (van.length > MAX_VAN) {
    return json({ ok: false, loi: `Câu hỏi dài quá ${MAX_VAN} ký tự.` }, 400)
  }

  try {
    return json({ ok: true, ketQua: await goiNhaCungCap(van) })
  } catch (e) {
    return json({ ok: false, loi: e instanceof Error ? e.message : String(e) }, 502)
  }
})
