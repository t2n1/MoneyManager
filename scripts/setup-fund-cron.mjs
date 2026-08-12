// Hẹn cron cho `fund-refresh`: nhận secret ở terminal của chủ app, CHỨNG MINH secret đó
// đúng bằng một cuộc gọi thật tới function đã deploy, rồi mới in ra khối SQL đã điền sẵn
// để dán vào Supabase SQL Editor.
//
// Sao khuôn scripts/setup-stock-cron.mjs NGUYÊN VẸN — đọc file đó trước nếu cần hiểu vì
// sao script này có hình dạng này. Chỉ đổi đúng bốn thứ: LICH, TEN_JOB, TIMEOUT_MS, và
// tên function trong URL (fund-refresh thay stock-refresh). Mọi cơ chế an toàn khác —
// gọi thử trước khi in SQL, donDauVao() bóc bracketed paste, --kiem-o-nhap,
// canhBaoHinhDang() cảnh báo ca copy nhầm cột digest — giữ y nguyên.
//
// Vì sao là script chứ không phải người/agent dán hộ: cùng lý do đã ghi ở đầu
// setup-push.mjs — secret cron chỉ được xuất hiện trong terminal của chủ app, không đi
// qua chat, không vào log, không vào git.
//
// Vì sao script này TỰ GỌI function trước khi in SQL, khác setup-push.mjs (chỉ in):
// ngày 2026-08-11 job `stock-refresh-daily` được hẹn với chuỗi giữ chỗ
// '<PUSH_CRON_SECRET>' còn nguyên trong `cron.job.command`. Cron nổ đúng giờ, pg_net gửi
// đi bình thường, `cron.job_run_details.status` vẫn là 'succeeded' (http_post chỉ xếp
// hàng rồi trả id) — nhưng function chặn ở dòng so secret và trả 401, không ghi hàng nào.
// Không một tín hiệu nào ở phía database lộ ra chuyện đó. Nên ở đây thứ tự bị đảo: gọi
// thử TRƯỚC, sai secret thì KHÔNG in SQL. Không thể dán một khối SQL chưa được chứng minh.
//
// Chạy:
//   node scripts/setup-fund-cron.mjs              (hỏi secret, không hiện lên màn hình)
//   npm run setup:fund-cron
//
// Kiểm script mà không cần secret, không gọi mạng:
//   node scripts/setup-fund-cron.mjs --dry-run
//
// Soi chuỗi dán vào (số ký tự / ký tự bị dọn / ký tự lạ) mà KHÔNG in secret, không gọi
// mạng — dùng khi bị 401 và cần phân biệt "dán bị bẩn" với "copy sai giá trị":
//   node scripts/setup-fund-cron.mjs --kiem-o-nhap
//
// In SQL mà không gọi thử (chỉ dùng khi đã tự chứng minh secret bằng cách khác):
//   node scripts/setup-fund-cron.mjs --khong-goi
//
// Xem thêm: docs/quy-nhat.md

import { createInterface } from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env.local')
const DRY = process.argv.includes('--dry-run')
const KHONG_GOI = process.argv.includes('--khong-goi')
const KIEM_O_NHAP = process.argv.includes('--kiem-o-nhap')

/** 13:00 UTC = 22:00 giờ Nhật, thứ Hai–thứ Sáu: sau giờ công bố 基準価額 (~19:00). */
const LICH = '0 13 * * 1-5'
const TEN_JOB = 'fund-refresh-daily'
/**
 * Phải lớn hơn FETCH_BUDGET_MS (60s) trong supabase/functions/fund-refresh/navs.ts,
 * cộng thêm chỗ cho việc 2 (ghi account_valuations). Bỏ tham số này là để mặc định của
 * pg_net (thấp — mẫu của push-notify cũng đặt tường minh, xem setup-push.mjs) cắt ngang
 * function lúc nó mới hút được vài quỹ.
 */
const TIMEOUT_MS = 120_000
/** Nhãn dollar-quote cho khối SQL. Không dùng `$$` trơn để bớt khả năng trùng nội dung. */
const NHAN = '$cron$'

/** Lấy project-ref từ VITE_SUPABASE_URL để khỏi bắt người dùng tự tra. */
function docProjectRef() {
  if (!existsSync(ENV_FILE)) return null
  const url = readFileSync(ENV_FILE, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null
}

/**
 * Hỏi một dòng mà không hiện ký tự nào lên màn hình.
 *
 * Không nhận secret qua tham số dòng lệnh và cũng không đọc biến môi trường: cả hai đều
 * để lại vết trong lịch sử shell (PowerShell ghi `$env:X = '...'` vào PSReadLine) — đúng
 * thứ script này sinh ra để tránh.
 */
function hoiKin(loiNhac) {
  return new Promise((xong, hong) => {
    if (!process.stdin.isTTY) {
      hong(
        new Error(
          'stdin không phải terminal nên không hỏi kín được. Chạy trực tiếp trong terminal,\n' +
            'đừng qua pipe hay qua tác vụ nền.',
        ),
      )
      return
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // readline vẽ lại CẢ dòng (gồm lời nhắc) sau mỗi lần gõ. Cho lời nhắc qua đúng một
    // lần, chặn mọi lượt vẽ sau — nhờ vậy không ký tự nào của secret lọt ra màn hình,
    // và cũng không có dấu * nào để đếm ra độ dài.
    let daHienLoiNhac = false
    rl._writeToOutput = (chuoi) => {
      if (!daHienLoiNhac && chuoi.includes(loiNhac)) {
        daHienLoiNhac = true
        rl.output.write(chuoi)
      }
    }
    rl.question(loiNhac, (traLoi) => {
      rl.output.write('\n')
      rl.close()
      // Trả chuỗi THÔ, chưa dọn: donDauVao() ở dưới cần biết đã bỏ đi những gì để nói ra.
      xong(traLoi)
    })
  })
}

/**
 * Dọn chuỗi dán vào, và nói rõ đã bỏ đi bao nhiêu.
 *
 * Bracketed paste: Windows Terminal, iTerm và nhiều terminal khác bọc nội dung dán giữa
 * `ESC[200~` và `ESC[201~`. readline không phải lúc nào cũng bóc hai dãy đó ra. Secret lẫn
 * chúng thì so sánh ở function trượt 100% — mà ô nhập cố tình không hiện gì nên trên màn
 * hình không có một dấu hiệu nào, chỉ thấy 401 và tưởng mình copy sai secret.
 *
 * Trả về cả `soKyTuDaBo` để chỗ gọi cảnh báo được: im lặng dọn xong rồi vẫn 401 thì người
 * dùng lại đi nghi sai chỗ lần nữa.
 */
function donDauVao(tho) {
  // Viết bằng escape, không nhúng ký tự thật vào file: một ký tự điều khiển tàng hình
  // giữa hai dấu / là thứ không ai đọc lại được, git diff cũng không hiện ra.
  // eslint-disable-next-line no-control-regex
  const khongDauNgoac = tho.replaceAll(/\u001b\[20[01]~/g, '')
  // eslint-disable-next-line no-control-regex
  const khongDieuKhien = khongDauNgoac.replaceAll(/[\u0000-\u001f\u007f]/g, '')
  const sach = khongDieuKhien.trim()
  return { sach, soKyTuDaBo: tho.length - sach.length }
}

/** Ký tự mà base64url (dạng secret do setup-push.mjs sinh) không bao giờ có. */
const KY_TU_LA = /[^A-Za-z0-9._~+/=-]/g

/** Độ dài của `randomBytes(32).toString('base64url')` — dạng secret setup-push.mjs sinh. */
const DAI_CHUAN = 43

/**
 * 64 ký tự hex = SHA-256 digest.
 *
 * Trang Supabase Dashboard → Edge Functions → Secrets hiện một cột **digest** cạnh mỗi
 * secret; giá trị thật chỉ ra khi bấm biểu tượng con mắt. Copy cột digest thì được đúng 64
 * ký tự hex — và vì hex nằm trọn trong bộ base64url, phép kiểm "có ký tự lạ không" KHÔNG
 * bắt được. Nó chỉ trông như một secret dài hơn bình thường.
 *
 * Cố ý CHỈ cảnh báo, không chặn: một secret sinh bằng `openssl rand -hex 32` cũng đúng
 * hình dạng này và hoàn toàn hợp lệ. Trọng tài thật vẫn là cuộc gọi tới function.
 */
const DIGEST_SHA256 = /^[0-9a-f]{64}$/

/**
 * Cảnh báo về hình dạng — KHÔNG chặn.
 *
 * Khác `loiCuaSecret()`: chỗ đó chặn những giá trị không thể đúng (chuỗi giữ chỗ, rỗng, phá
 * cú pháp SQL). Ở đây chỉ là "trông lạ", mà trông lạ không có nghĩa là sai.
 */
function canhBaoHinhDang(s) {
  const ra = []
  if (DIGEST_SHA256.test(s))
    ra.push(
      '64 ký tự hex — đúng hình dạng một SHA-256 digest.\n' +
        '    Trang Dashboard → Edge Functions → Secrets hiện cột DIGEST cạnh mỗi secret;\n' +
        '    giá trị thật chỉ ra khi bấm biểu tượng con mắt. Nếu vừa copy cột digest thì\n' +
        '    cuộc gọi dưới đây sẽ trả 401 — quay lại bấm con mắt rồi copy giá trị thật.\n' +
        '    (Secret sinh bằng `openssl rand -hex 32` cũng đúng hình dạng này và vẫn hợp lệ,\n' +
        '    nên đây chỉ là cảnh báo.)',
    )
  else if (s.length !== DAI_CHUAN)
    ra.push(
      `${s.length} ký tự, khác ${DAI_CHUAN} của secret do setup-push.mjs sinh — không sai,\n` +
        '    nhưng nếu secret này lẽ ra do script kia sinh thì có chỗ không khớp.',
    )
  return ra
}

/**
 * Chặn những giá trị KHÔNG THỂ là secret thật.
 *
 * Ca đầu tiên là ca đã xảy ra thật: chuỗi giữ chỗ được dán y nguyên. Ba ca sau là để khối
 * SQL in ra không bị hỏng cú pháp (nháy đơn, dollar-quote, xuống dòng) — sinh bởi
 * setup-push.mjs thì secret là base64url nên không rơi vào, nhưng secret gõ tay thì có thể.
 */
function loiCuaSecret(s) {
  if (!s) return 'Chưa nhập gì.'
  if (/^<.*>$/.test(s) || /PUSH_CRON_SECRET|DAN_SECRET|placeholder/i.test(s))
    return `"${s}" là chuỗi giữ chỗ, không phải secret. Lấy giá trị thật ở Supabase Dashboard\n→ Edge Functions → Secrets → PUSH_CRON_SECRET.`
  if (s.includes('\n') || s.includes('\r')) return 'Secret có ký tự xuống dòng — chắc dán lẫn dòng khác.'
  if (s.includes(NHAN)) return `Secret chứa "${NHAN}", trùng nhãn dollar-quote của khối SQL.`
  return null
}

/** Gọi function đã deploy bằng secret vừa nhập. Đây là bước chứng minh, không phải thử cho vui. */
async function goiThu(ref, secret) {
  const url = `https://${ref}.supabase.co/functions/v1/fund-refresh`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    // Rộng hơn TIMEOUT_MS để đừng bỏ cuộc trước cả pg_net: cần phân biệt "function chạy
    // lâu" với "secret sai", mà bỏ cuộc sớm thì hai thứ đó trông giống nhau.
    signal: AbortSignal.timeout(TIMEOUT_MS + 30_000),
  })
  return { status: r.status, body: (await r.text()).slice(0, 600) }
}

function inSql(ref, secret) {
  // Nháy đơn trong SQL được nhân đôi. Secret base64url không có, nhưng khối SQL này được
  // dán vào một cửa sổ có quyền cao nhất trên database — không phải chỗ để giả định.
  const trongSql = secret.replaceAll("'", "''")
  return `
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  '${TEN_JOB}',
  '${LICH}',
  ${NHAN}
  select net.http_post(
    url := 'https://${ref}.supabase.co/functions/v1/fund-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '${trongSql}'
    ),
    timeout_milliseconds := ${TIMEOUT_MS}
  )
  ${NHAN}
);`
}

/**
 * Chuoi co thuan ASCII khong.
 *
 * Dung de canh mot bat bien: khoi SQL in ra giua hai vach COPY khong duoc lan chu tieng
 * Viet. Ngay 2026-08-12 mot doan van tieng Viet nam ngay duoi khoi SQL, nguoi dung boi den
 * toi het man hinh va Postgres tra ERROR 42601 syntax error at or near "Roi".
 *
 * Kiem bang ma ky tu thay vi regex: /[^ -]/ lam oxlint canh bao no-control-regex.
 */
function thuanAscii(s) {
  return [...s].every((c) => c.codePointAt(0) < 128)
}

/**
 * Dò dấu hiệu "bảng chưa tồn tại" trong thân trả về của lượt gọi thử.
 *
 * Vì sao cần: nếu migration 0045 chưa áp (thiếu `funds`/`fund_trades`/`fund_prices`),
 * function lỗi ngay ở tầng đọc bảng — KHÔNG phải 401 (secret vẫn đúng). Không có phép
 * kiểm này, nhánh "secret đúng nhưng lỗi khác, SQL vẫn in ra" ở dưới sẽ khuyên hẹn cron
 * trước khi bảng tồn tại, và cron sẽ nổ mỗi ngày, luôn lỗi, cho tới khi có ai soi ra
 * (xem docs/quy-nhat.md, mục 6, Bước 0).
 *
 * Hai hình dạng lỗi có thể gặp: PostgREST không thấy bảng trong schema cache ("schema
 * cache"), hoặc Postgres trả thẳng "relation ... does not exist". Bắt cả hai.
 */
function bangChuaTonTai(body) {
  return /schema cache|relation .* does not exist/i.test(body)
}

const ref = docProjectRef()

if (DRY) {
  // Không hỏi secret, không gọi mạng — chỉ kiểm những gì kiểm được mà không có bí mật nào.
  const gia = 'secret-gia-de-kiem-hinh-dang'
  const sql = inSql(ref ?? '<project-ref>', gia)
  const kiem = [
    ['đọc được project-ref từ .env.local', ref !== null, ref ?? 'KHÔNG ĐỌC ĐƯỢC'],
    ['SQL không còn chuỗi giữ chỗ', !/<[A-Z_]+>/.test(sql.replace('<project-ref>', '')), ''],
    ['SQL có timeout_milliseconds', sql.includes(`timeout_milliseconds := ${TIMEOUT_MS}`), `${TIMEOUT_MS}`],
    ['SQL nhúng đúng secret đã cho', sql.includes(gia), ''],
    ['chặn được chuỗi giữ chỗ', loiCuaSecret('<PUSH_CRON_SECRET>') !== null, ''],
    ['chặn được ô rỗng', loiCuaSecret('') !== null, ''],
    ['nhận secret hợp lệ', loiCuaSecret('aB3-_x9') === null, ''],
    // Dựng lại đúng hình dạng chuỗi mà terminal có bracketed paste đưa vào: nội dung bị
    // bọc giữa ESC[200~ và ESC[201~. Đây là ca đã làm một lượt chạy thật trả 401.
    [
      'bóc được bracketed paste',
      donDauVao('\u001b[200~aB3-_x9\u001b[201~').sach === 'aB3-_x9',
      '',
    ],
    ['đếm đúng số ký tự đã bỏ', donDauVao('\u001b[200~aB3-_x9\u001b[201~').soKyTuDaBo === 12, ''],
    ['bóc được ký tự điều khiển lẻ', donDauVao('aB3\u0000-_x9').sach === 'aB3-_x9', ''],
    ['không bỏ gì của chuỗi sạch', donDauVao('aB3-_x9').soKyTuDaBo === 0, ''],
    ['nhận ra ký tự lạ', 'aB3 x9'.match(KY_TU_LA)?.length === 1, ''],
    // Digest SHA-256 thật của chuỗi rỗng — 64 ký tự hex, y hình dạng cột DIGEST ở Dashboard.
    // Phép kiểm KY_TU_LA cố ý KHÔNG bắt được nó (hex nằm trọn trong base64url), nên nếu
    // canhBaoHinhDang mất đi thì không còn gì lộ ra ca này.
    [
      'cảnh báo được digest SHA-256',
      canhBaoHinhDang('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855').some((c) =>
        c.includes('digest'),
      ),
      '',
    ],
    ['không cảnh báo secret đúng dạng', canhBaoHinhDang('a'.repeat(DAI_CHUAN)).length === 0, ''],
    // 64 ký tự nhưng có chữ in hoa ⇒ không phải hex ⇒ không phải digest. Ranh giới này quan
    // trọng: cảnh báo digest cho một secret base64url 48 byte là báo động sai.
    ['không nhận nhầm base64url 64 ký tự là digest', !DIGEST_SHA256.test('A'.repeat(64)), ''],
    // Khối giữa hai vạch COPY phải THUẦN ASCII. Chữ tiếng Việt lọt vào đó là lỗi đã xảy ra
    // thật ngày 2026-08-12: người dùng bôi đen tới hết màn hình, Postgres trả
    // `ERROR: 42601: syntax error at or near "Rồi"`.
    ['SQL sinh ra thuần ASCII (không lẫn chữ Việt)', thuanAscii(sql), ''],
    // Bốn thứ đổi so với setup-stock-cron.mjs — canh để không lỡ tay copy-paste sai một
    // trong bốn (xem bảng ở task-14-brief.md).
    ['LICH đúng 22:00 giờ Nhật, T2-T6', LICH === '0 13 * * 1-5', LICH],
    ['TEN_JOB là fund-refresh-daily', TEN_JOB === 'fund-refresh-daily', TEN_JOB],
    ['TIMEOUT_MS > FETCH_BUDGET_MS (60s, navs.ts)', TIMEOUT_MS > 60_000, `${TIMEOUT_MS}`],
    ['URL gọi đúng function fund-refresh', sql.includes('/functions/v1/fund-refresh'), ''],
    // Phép kiểm cho bangChuaTonTai() — không gọi mạng, chỉ ném chuỗi mẫu qua hàm thuần.
    [
      'nhận ra bảng chưa tồn tại (PostgREST, schema cache)',
      bangChuaTonTai('{"loi":["gia: Could not find the table \'public.funds\' in the schema cache"]}'),
      '',
    ],
    [
      'nhận ra bảng chưa tồn tại (Postgres thô, relation ... does not exist)',
      bangChuaTonTai('{"loi":["ghi gia tri: relation \\"public.fund_prices\\" does not exist"]}'),
      '',
    ],
    [
      'không báo nhầm bảng chưa tồn tại cho lỗi khác',
      !bangChuaTonTai('{"soQuyCoGia":0,"daGhi":0,"boQua":{},"loi":["gia: 9I31223A: loi-mang"]}'),
      '',
    ],
  ]
  console.log('--dry-run: không hỏi secret, không gọi mạng, không in secret.\n')
  for (const [ten, dat, ghiChu] of kiem)
    console.log(`  ${dat ? '✓' : '✗'} ${ten}${ghiChu ? ` — ${ghiChu}` : ''}`)
  process.exit(kiem.every(([, dat]) => dat) ? 0 : 1)
}

if (!ref) {
  console.error(
    `✗ Không đọc được project-ref từ ${ENV_FILE}.\n` +
      '  Cần một dòng VITE_SUPABASE_URL=https://<ref>.supabase.co trong .env.local.',
  )
  process.exit(1)
}

console.log(`
Hẹn cron '${TEN_JOB}' (${LICH} — 22:00 giờ Nhật, thứ Hai–thứ Sáu) cho project ${ref}.

Secret gõ vào sẽ KHÔNG hiện lên màn hình và không được ghi ra đâu cả. Lấy giá trị thật ở
Supabase Dashboard → Edge Functions → Secrets → PUSH_CRON_SECRET (cùng secret mà
stock-refresh/push-notify đang dùng — nó là "bí mật cho cron" nói chung).
`)

let tho
try {
  tho = await hoiKin('PUSH_CRON_SECRET: ')
} catch (err) {
  // Một dòng đọc được, không phải stack trace: lỗi ở đây luôn là chuyện môi trường chạy
  // (pipe, tác vụ nền), không phải bug cần truy vết.
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

const { sach: secret, soKyTuDaBo } = donDauVao(tho)
const soKyTuLa = secret.match(KY_TU_LA)?.length ?? 0

// Soi ô nhập: chỉ nói những gì KHÔNG tiết lộ secret — số ký tự (43 với secret do
// setup-push.mjs sinh, con số đó đọc được từ chính script kia nên không phải bí mật), số
// ký tự đã dọn, số ký tự nằm ngoài bộ base64url. Đủ để phân biệt "dán bị bẩn" với "copy
// sai giá trị", mà không in ra ký tự nào của secret.
const canhBao = canhBaoHinhDang(secret)

if (KIEM_O_NHAP) {
  console.log(`
Số ký tự (sau khi dọn) : ${secret.length}${secret.length === DAI_CHUAN ? `  ← khớp secret do setup-push.mjs sinh` : ''}
Ký tự đã dọn bỏ        : ${soKyTuDaBo}${soKyTuDaBo > 0 ? '  ← terminal có chèn rác vào chuỗi dán (bracketed paste?)' : ''}
Ký tự ngoài base64url  : ${soKyTuLa}${soKyTuLa > 0 ? '  ← có ký tự lạ, xem lại vùng bôi đen lúc copy' : ''}
Toàn ký tự hex 64      : ${DIGEST_SHA256.test(secret) ? 'CÓ  ← rất có thể là cột DIGEST, không phải secret' : 'không'}
${canhBao.map((c) => `\n⚠ ${c}`).join('')}
Không gọi mạng, không in SQL, không in secret. Bỏ --kiem-o-nhap để chạy thật.`)
  process.exit(0)
}

if (soKyTuDaBo > 0)
  console.log(
    `\n⚠ Đã dọn ${soKyTuDaBo} ký tự điều khiển khỏi chuỗi dán vào (terminal chèn — bracketed\n` +
      '  paste hoặc tương tự). Chuỗi gửi đi là bản đã dọn.',
  )

for (const c of canhBao) console.log(`\n⚠ ${c}`)

const loi = loiCuaSecret(secret)
if (loi) {
  console.error(`\n✗ ${loi}`)
  process.exit(1)
}

if (!KHONG_GOI) {
  console.log(
    `\nGọi thật POST /fund-refresh để chứng minh secret đúng.\n` +
      `Lượt gọi này LÀM ĐÚNG VIỆC CỦA CRON: hút 基準価額 cả danh bạ quỹ và ghi account_valuations.\n` +
      `Có thể mất tới ~60 giây (ngân sách FETCH_BUDGET_MS của navs.ts), đợi nhé...`,
  )
  let kq
  try {
    kq = await goiThu(ref, secret)
  } catch (err) {
    console.error(`\n✗ Không gọi được function: ${err instanceof Error ? err.message : String(err)}`)
    console.error('  Chưa in SQL — chưa chứng minh được secret đúng.')
    process.exit(1)
  }

  if (kq.status === 401) {
    if (DIGEST_SHA256.test(secret))
      console.error(
        '\n✗ Function trả 401, và chuỗi vừa nhập là 64 ký tự hex — gần chắc là anh đã copy\n' +
          '  cột DIGEST ở trang Secrets thay vì giá trị thật. Bấm biểu tượng con mắt trên dòng\n' +
          '  PUSH_CRON_SECRET để hiện giá trị, rồi copy chuỗi đó.',
      )
    console.error(
      `\n✗ Function trả 401 (${kq.body}) — secret này KHÔNG khớp với secret của function.\n` +
        '  Chưa in SQL. Hẹn cron bằng secret sai thì cron vẫn nổ, cron.job_run_details vẫn\n' +
        "  báo 'succeeded', mà không hàng giá nào được ghi — đúng lỗi đã xảy ra ngày 2026-08-11.\n" +
        '  Đối chiếu lại giá trị ở Dashboard → Edge Functions → Secrets, hoặc đặt secret mới\n' +
        '  ở đó rồi chạy lại script này với giá trị mới.',
    )
    process.exit(1)
  }

  console.log(`\n${kq.status === 200 ? '✓' : '⚠'} HTTP ${kq.status}\n  ${kq.body}`)
  if (kq.status !== 200) {
    if (bangChuaTonTai(kq.body)) {
      // KHÔNG cùng nhánh với lỗi khác: khuyên hẹn cron ở đây là khuyên hẹn một cron sẽ nổ
      // mỗi ngày và luôn lỗi cho tới khi có ai soi ra — xem docs/quy-nhat.md, mục 6, Bước 0.
      console.log(
        '\n  ⚠ Secret ĐÚNG, nhưng thân trả về có dấu hiệu BẢNG CHƯA TỒN TẠI\n' +
          '  (funds/fund_trades/fund_prices). ĐỪNG hẹn cron lúc này — quay lại Bước 0\n' +
          '  (docs/quy-nhat.md, mục 6): áp supabase/migrations/0045_fund_prices_trades.sql\n' +
          '  lên project này, rồi chạy lại script này.\n' +
          '  SQL vẫn in ra dưới đây để xem trước, nhưng đừng dán vào SQL Editor cho tới khi\n' +
          '  hai bảng funds/fund_aliases đã có đúng 8/10 hàng.',
      )
    } else {
      console.log(
        '\n  Secret ĐÚNG (không bị chặn ở cửa 401), nhưng lượt chạy có lỗi. Đọc `loi` trong\n' +
          '  thân trả về ở trên, đối chiếu bảng lý do trong docs/quy-nhat.md.\n' +
          '  SQL vẫn in ra dưới đây: hẹn cron là đúng việc, lỗi kia sửa riêng.',
      )
    }
  }
}

console.log(`
─────────────────────────────────────────────────────────────────────
Bôi đen từ vạch "COPY TỪ ĐÂY" tới vạch "HẾT" rồi dán vào Supabase SQL
Editor và bấm Run. KHÔNG copy hai dòng vạch, KHÔNG copy gì ngoài
khoảng giữa hai vạch.

Khối này CHỨA SECRET — đừng dán vào chat, vào issue, hay commit.
Dán lại nhiều lần không sao: cron.schedule cùng '${TEN_JOB}' ghi đè
job cũ, không tạo hàng thứ hai.

Câu kiểm sau khi chạy: xem docs/quy-nhat.md, mục "Triển khai".
─────────────────────────────────────────────────────────────────────
════════════════════════ COPY TỪ ĐÂY ════════════════════════${inSql(ref, secret)}
════════════════════════ ĐẾN ĐÂY, HẾT ═══════════════════════`)
