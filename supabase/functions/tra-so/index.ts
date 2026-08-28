// Edge function tra-so — cầu giữ khoá API cho nút "Tra hộ" ở màn Tương lai.
//
// VÌ SAO PHẢI CÓ. Khoá API không được nằm phía trình duyệt: mọi biến VITE_* bị nhúng vào
// bundle công khai, ai mở mã nguồn cũng lấy được khoá và tiêu hạn mức.
//
// FUNCTION NÀY CỐ TÌNH NGU. Không phép tính tiền nào, không đụng DB. Việc kiểm kết quả
// nằm ở src/features/lifetime/traSoKetQua.ts, nơi có unit test. Nhờ vậy KHÔNG phải gói
// bundle như push-notify/stock-refresh — không có bản sao luật nào để trôi lệch.
//
// APP KHÔNG ĐƯỢC CHỌN MODEL. Model, độ dài tối đa và công tắc tra web đều quyết ở PHÍA
// SERVER (model qua biến môi trường, hai cái kia ghim trong mã). Nếu để app gửi lên thì
// một lỗi vòng lặp phía app đốt sạch hạn mức trong vài giây.
//
// Chạy thử tại máy:  supabase functions serve tra-so
// Deploy:            supabase functions deploy tra-so   ← KHÔNG có --no-verify-jwt
// Đặt bí mật:        supabase secrets set AI_API_KEY=... AI_MODEL=...
//
// Lệnh đầy đủ và VÌ SAO cờ --no-verify-jwt là sai ở đây (dù ba function kia đều dùng):
// docs/tra-so.md

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
/**
 * Hỏng ở tầng ĐỌC KẾT QUẢ, tách riêng khỏi hỏng ở tầng GỌI.
 *
 * Vì sao phải có kiểu riêng: catch ngoài trả 502, mà app ánh xạ 502 thành
 * `khong-goi-duoc` ("mất mạng"). Một câu trả lời méo rơi vào nhánh đó thì người dùng
 * đọc được một lời nói SAI CHỖ HỎNG — đúng thứ nhập nhằng mà taxonomy lỗi ở
 * `traSoKetQua.ts` sinh ra để chặn.
 */
class LoiDocKetQua extends Error {}

/**
 * Nhà cung cấp từ chối. Câu trong `message` đã được viết sẵn ở đây nên nó AN TOÀN để
 * trả về client — khác một `Error` bất kỳ, thứ có thể mang chuỗi của thư viện/Deno.
 */
class LoiNhaCungCap extends Error {}

/** Câu trả về client khi nhà cung cấp từ chối. KHÔNG dội thân lỗi của họ ra ngoài. */
function cauLoiTheoStatus(status: number): string {
  if (status === 429) return 'Đã hết hạn mức tra tháng này. Không phải lỗi của bạn.'
  if (status === 401 || status === 403) return 'Khoá API phía server không dùng được.'
  // 404 ở đây gần như luôn là SAI MÃ MODEL, không phải sai đường dẫn — và đó là kiểu
  // hỏng dễ mất hàng giờ nhất nếu thông báo chỉ nói chung chung, vì nó trông y hệt một
  // sự cố mạng. Nói thẳng ra tên biến phải sửa.
  if (status === 404) return 'Sai mã model phía server (AI_MODEL). Xem docs/tra-so.md.'
  return 'Nhà cung cấp không trả lời được lúc này.'
}

/**
 * Mã model, đọc từ biến môi trường chứ KHÔNG ghim trong mã.
 *
 * Vì sao: mã model của Google luôn mang số phụ (`gemini-2.5-flash`, `gemini-3.6-flash`,
 * `gemini-3.1-flash-lite`) và ĐỔI theo thời gian — bậc miễn phí còn bị cắt model theo
 * đợt. Ghim một chuỗi vào mã nghĩa là mỗi lần Google đổi tên là một lần sửa mã và
 * deploy lại. Đọc từ env thì đổi một dòng `secrets set` là xong.
 *
 * Vẫn là bí mật PHÍA SERVER, app không đụng tới được — nên luật "app không được chọn
 * model" (khối chú thích đầu file) vẫn nguyên vẹn.
 *
 * Không có mặc định: thà chết ngay lúc gọi với một câu nói rõ phải làm gì, còn hơn im
 * lặng dùng một mã đoán bừa rồi 404 mọi lượt.
 */
const AI_MODEL = (Deno.env.get('AI_MODEL') ?? '').trim()

async function goiNhaCungCap(van: string): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`,
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
  if (!res.ok) {
    // Ghi log thân lỗi cho người vận hành, KHÔNG trả nó về client: thân lỗi của nhà cung
    // cấp có thể mang mảnh request, tên project và metadata khoá.
    console.error(`tra-so: nhà cung cấp trả ${res.status}`, await res.text())
    throw new LoiNhaCungCap(cauLoiTheoStatus(res.status))
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new LoiDocKetQua('Nhà cung cấp trả về nội dung không đọc được.')
  }
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''
  // Model hay bọc JSON trong ```json … ``` dù đã dặn. Bóc ra trước khi parse.
  const sach = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  try {
    return JSON.parse(sach)
  } catch {
    // ĐÂY LÀ MỘT BƯỚC KIỂM, và nó chạy ở server nơi không có unit test — nên tối thiểu
    // nó phải nói đúng tên cái hỏng. Xem khối chú thích của `LoiDocKetQua`.
    throw new LoiDocKetQua('Nhà cung cấp trả lời không phải JSON đọc được.')
  }
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
  if (!AI_MODEL) {
    return json({ ok: false, loi: 'Thiếu AI_MODEL phía server. Xem docs/tra-so.md.' }, 500)
  }

  let van: unknown
  try {
    van = (await req.json())?.van
  } catch {
    return json({ ok: false, loi: 'Nội dung yêu cầu không phải JSON.' }, 400)
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
    // 422, KHÔNG 502: gọi được, chỉ là đọc không ra. Hai chuyện khác nhau và người dùng
    // phải đọc được đúng chuyện nào — 502 là câu dành cho "không tới được nhà cung cấp".
    if (e instanceof LoiDocKetQua) return json({ ok: false, loi: e.message }, 422)
    if (e instanceof LoiNhaCungCap) return json({ ok: false, loi: e.message }, 502)
    // Câu lạ (lỗi mạng của Deno chẳng hạn) KHÔNG dội ra ngoài: nó là tiếng Anh, thô, và
    // có thể mang chi tiết hạ tầng. Ghi log rồi trả một câu chung.
    console.error('tra-so:', e)
    return json({ ok: false, loi: 'Không gọi được nhà cung cấp.' }, 502)
  }
})
