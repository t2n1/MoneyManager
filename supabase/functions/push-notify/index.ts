// Edge function push-notify — chạy theo giờ, gửi Web Push cho ai tới giờ nhận.
//
// Kiến trúc (mục J của spec thông báo): function này KHÔNG có bộ luật riêng. Nó dựng
// lại đúng `NotificationInput` mà app dựng trên máy, rồi gọi CHÍNH `buildNotifications`
// đã gói từ src/ (_rules.js). Nhờ vậy chuông trong app và thông báo đẩy không bao giờ
// nói lệch nhau — sửa luật một chỗ là cả hai đổi theo.
//
// Chỉ đẩy nhóm "việc cần làm" (kind='action'), và một việc chỉ đẩy MỘT LẦN: cột
// `pushed_at` trên notification_state là thứ nhớ chuyện đó, và nó chỉ mất khi tình
// huống đã hết (vòng đời mục E, do app dọn).
//
// Chạy thử tại máy:  supabase functions serve push-notify
// Deploy:            npm run bundle:rules && supabase functions deploy push-notify
// Xem thêm:          docs/push-notification.md

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { dueForPush, localPartsIn, planPush, buildNotifications } from './_rules.js'
import { loadNotificationInput } from './loadInput.ts'

// deno-lint-ignore no-explicit-any
type Row = any

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// `.trim()` không phải làm đẹp: đặt secret từ PowerShell trên Windows hay để lọt một
// ký tự xuống dòng vào cuối giá trị, mà base64url không có ký tự đó nên web-push ném
// ngay — xem khối try/catch ở Deno.serve để biết vì sao cú ném đó từng vô hình.
const VAPID_PUBLIC_KEY = (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').trim()
const VAPID_PRIVATE_KEY = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').trim()
// 'mailto:...' hoặc URL của app — bắt buộc theo chuẩn VAPID để dịch vụ đẩy liên hệ được.
const VAPID_SUBJECT = (Deno.env.get('VAPID_SUBJECT') ?? '').trim()
// Chuỗi bí mật cron phải gửi kèm. Không có nó thì bất kỳ ai biết URL cũng gọi được
// function và bắt app gửi push (hoặc đốt hạn mức).
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

interface KetQua {
  /** Số user đã gửi được ít nhất một thông báo. */
  daGui: number
  /** Vì sao những user còn lại bị bỏ qua — gom theo lý do để đọc log cho nhanh. */
  boQua: Record<string, number>
  /** Đăng ký đã chết và bị xoá (endpoint trả 404/410). */
  daXoaDangKy: number
  loi: string[]
}

function demBoQua(kq: KetQua, lyDo: string) {
  kq.boQua[lyDo] = (kq.boQua[lyDo] ?? 0) + 1
}

/**
 * Gửi một payload tới mọi thiết bị của một user.
 * @returns số thiết bị gửi được, và endpoint nào đã chết.
 */
async function guiChoMoiThietBi(
  subs: Row[],
  payload: unknown,
): Promise<{ daGui: string[]; daChet: string[]; loi: string[] }> {
  const daGui: string[] = []
  const daChet: string[] = []
  const loi: string[] = []

  const body = JSON.stringify(payload)

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
        // TTL 12 tiếng: thiết bị tắt máy qua đêm thì sáng bật lên vẫn nhận được, nhưng
        // không giữ tới mức nhận thông báo của hôm qua khi hôm nay đã có tin mới.
        { TTL: 12 * 3600 },
      )
      daGui.push(sub.endpoint)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // 404/410 = endpoint không còn tồn tại (người dùng xoá app, trình duyệt đổi khoá).
      // Đây là cách DUY NHẤT server biết một đăng ký đã chết, nên phải dọn — không dọn
      // thì mỗi ngày gửi một lần vào hư không, mãi mãi.
      if (status === 404 || status === 410) daChet.push(sub.endpoint)
      else loi.push(`gửi tới ${sub.endpoint.slice(0, 40)}… lỗi ${status ?? ''} ${String(e)}`)
    }
  }

  return { daGui, daChet, loi }
}

async function xuLyMotUser(sb: SupabaseClient, profile: Row, nowISO: string, kq: KetQua) {
  const subs = await sb
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', profile.user_id)
  if (subs.error) throw new Error(`Đọc push_subscriptions lỗi: ${subs.error.message}`)
  if (!subs.data || subs.data.length === 0) return demBoQua(kq, 'không có thiết bị nào đăng ký')

  if (!dueForPush(nowISO, profile.push_hour, profile.push_tz, profile.push_last_sent_at))
    return demBoQua(kq, 'chưa tới giờ gửi (hoặc hôm nay đã gửi)')

  // "Hôm nay" theo lịch của NGƯỜI DÙNG, không phải ngày UTC: 8 giờ sáng ở Nhật thì UTC
  // vẫn là ngày hôm trước, và lấy ngày UTC là mọi luật "tháng này" / "quá hạn mấy ngày"
  // lệch một ngày mỗi sáng.
  const todayISO = localPartsIn(nowISO, profile.push_tz).date

  const loaded = await loadNotificationInput(sb, profile, todayISO)
  if (!loaded.ok) return demBoQua(kq, loaded.skip)

  const result = buildNotifications(loaded.input)
  const state = await sb
    .from('notification_state')
    .select('*')
    .eq('user_id', profile.user_id)
  if (state.error) throw new Error(`Đọc notification_state lỗi: ${state.error.message}`)

  const payload = planPush(result.actionsAll, state.data ?? [])
  if (!payload) return demBoQua(kq, 'không có việc mới nào cần báo')

  const { daGui, daChet, loi } = await guiChoMoiThietBi(subs.data, payload)
  kq.loi.push(...loi)

  if (daChet.length > 0) {
    await sb
      .from('push_subscriptions')
      .delete()
      .eq('user_id', profile.user_id)
      .in('endpoint', daChet)
    kq.daXoaDangKy += daChet.length
  }

  // Không gửi được thiết bị nào → KHÔNG ghi pushed_at. Nếu ghi thì việc đó im vĩnh
  // viễn dù người dùng chưa từng nhận được gì (mã việc-cần-làm không kèm kỳ, nên nó
  // chỉ được đẩy lại sau khi tình huống hết rồi tái diễn).
  if (daGui.length === 0) return demBoQua(kq, 'gửi thất bại ở mọi thiết bị')

  const now = new Date().toISOString()

  // Đóng dấu từng thiết bị GỬI ĐƯỢC. Cột này có từ migration 0034 nhưng tới 2026-08-21
  // chưa có dòng code nào ghi, nên câu SQL "kiểm đã gửi được chưa" ở
  // docs/push-notification.md luôn trả null — kể cả khi mọi thứ chạy đúng. Một cột
  // chẩn đoán không ai ghi thì tệ hơn không có cột: nó trả lời sai một cách tự tin.
  // Lỗi ở đây KHÔNG được làm hỏng lượt gửi: push đã tới máy rồi, dấu vết là thứ phụ.
  const dongDau = await sb
    .from('push_subscriptions')
    .update({ last_ok_at: now })
    .eq('user_id', profile.user_id)
    .in('endpoint', daGui)
  if (dongDau.error) kq.loi.push(`Ghi last_ok_at lỗi: ${dongDau.error.message}`)

  const upsert = await sb.from('notification_state').upsert(
    payload.keys.map((key: string) => ({ user_id: profile.user_id, key, pushed_at: now })),
    { onConflict: 'user_id,key' },
  )
  if (upsert.error) throw new Error(`Ghi pushed_at lỗi: ${upsert.error.message}`)

  const stamp = await sb
    .from('profiles')
    .update({ push_last_sent_at: now })
    .eq('user_id', profile.user_id)
  if (stamp.error) throw new Error(`Ghi push_last_sent_at lỗi: ${stamp.error.message}`)

  kq.daGui++
}

Deno.serve(async (req: Request) => {
  const thieu = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY],
    ['VAPID_PUBLIC_KEY', VAPID_PUBLIC_KEY],
    ['VAPID_PRIVATE_KEY', VAPID_PRIVATE_KEY],
    ['VAPID_SUBJECT', VAPID_SUBJECT],
    ['PUSH_CRON_SECRET', CRON_SECRET],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (thieu.length > 0)
    return Response.json({ loi: `Thiếu biến môi trường: ${thieu.join(', ')}` }, { status: 500 })

  // Xác thực cron. So sánh thẳng là đủ ở đây (secret dài, và đây không phải endpoint
  // đăng nhập nên không có kênh dò từng ký tự đáng lo).
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return Response.json({ loi: 'Không có quyền' }, { status: 401 })

  // PHẢI bắt: `setVapidDetails` validate cả ba giá trị và ném nếu sai dạng. Ném trần
  // ra khỏi handler thì `Deno.serve` trả về đúng chuỗi "Internal Server Error" — không
  // JSON, không tên biến — và pg_net chỉ ghi lại chừng đó vào `net._http_response`.
  // Đó là cách một khoá công khai dính ký tự thừa làm câm cả hệ thống đẩy hai tuần
  // trong khi cron vẫn báo "succeeded" mỗi giờ (2026-08-21). Cấu hình sai phải tự khai.
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  } catch (e) {
    return Response.json(
      {
        loi: `Khoá VAPID không hợp lệ: ${e instanceof Error ? e.message : String(e)}`,
        // Chỉ độ dài, không giá trị: đủ soi ra ký tự thừa mà không lộ khoá riêng.
        // Đúng chuẩn: public 87 (65 byte), private 43 (32 byte) — cả hai base64url
        // không đệm. Lệch lên 88/44 gần như luôn là một ký tự xuống dòng dính ở đuôi.
        doDai: {
          VAPID_SUBJECT: VAPID_SUBJECT.length,
          VAPID_PUBLIC_KEY: VAPID_PUBLIC_KEY.length,
          VAPID_PRIVATE_KEY: VAPID_PRIVATE_KEY.length,
        },
      },
      { status: 500 },
    )
  }

  // Service role: function phải đọc dữ liệu của MỌI user nên đi vòng qua RLS. Vì vậy
  // mọi truy vấn trong loadInput.ts đều tự `.eq('user_id', ...)` — ở đây không còn RLS
  // đỡ lưng, quên một chỗ là trộn dữ liệu người này vào thông báo người khác.
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const nowISO = new Date().toISOString()
  const kq: KetQua = { daGui: 0, boQua: {}, daXoaDangKy: 0, loi: [] }

  // Chỉ xét user CÓ đăng ký thiết bị — không quét cả bảng profiles.
  const { data: subRows, error: subErr } = await sb
    .from('push_subscriptions')
    .select('user_id')
  if (subErr) return Response.json({ loi: `Đọc push_subscriptions lỗi: ${subErr.message}` }, { status: 500 })

  const userIds = [...new Set((subRows ?? []).map((r: Row) => r.user_id as string))]
  if (userIds.length === 0) return Response.json({ ...kq, ghiChu: 'chưa ai đăng ký nhận push' })

  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('*')
    .in('user_id', userIds)
  if (profErr) return Response.json({ loi: `Đọc profiles lỗi: ${profErr.message}` }, { status: 500 })

  // Tuần tự, không Promise.all: một user là nhiều truy vấn, chạy song song hết sẽ đụng
  // trần kết nối của Postgres. Số user ở đây rất nhỏ (app cá nhân).
  for (const profile of profiles ?? []) {
    try {
      await xuLyMotUser(sb, profile, nowISO, kq)
    } catch (e) {
      // Một user lỗi KHÔNG được làm chết cả lượt — người khác vẫn phải nhận được.
      kq.loi.push(`user ${String(profile.user_id).slice(0, 8)}…: ${String(e)}`)
    }
  }

  return Response.json(kq)
})
