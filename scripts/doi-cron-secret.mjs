// Đổi PUSH_CRON_SECRET: sinh giá trị mới, đặt lên Supabase, CHỨNG MINH function nhận được
// giá trị mới, rồi in SQL hẹn lại CẢ HAI cron job đang nhúng secret đó.
//
// Vì sao phải là một script chứ không phải mấy lệnh dán tay:
//
// 1. Secret không được đi qua chat, không vào git, không vào lịch sử shell. Script sinh nó
//    trong bộ nhớ và đưa cho CLI qua một FILE TẠM (`--env-file`) rồi xoá — không qua argv,
//    vì gọi CLI phải dùng `shell: true` trên Windows (xem goiCli) và như vậy mọi tham số nằm
//    trên command line của cmd.exe, chỗ tiến trình khác của cùng người dùng đọc được. Khác
//    hẳn việc tự gõ `$env:X = '...'` hay dán `supabase secrets set "PUSH_CRON_SECRET=..."`,
//    hai cách đó còn để lại vết trong PSReadLine.
//
// 2. `PUSH_CRON_SECRET` được HAI cron job nhúng vào `cron.job.command`: stock-refresh-daily
//    và push-notify-hourly. Đổi secret mà chỉ hẹn lại một job là đẩy job kia vào đúng cái
//    lỗi 401 âm thầm đã mất một buổi để tìm ra (xem docs/co-phieu-viet-nam.md, bẫy ①):
//    cron vẫn nổ, job_run_details vẫn báo 'succeeded', mà function không làm gì cả.
//
// 3. Edge function đọc `Deno.env.get('PUSH_CRON_SECRET')` lúc khởi động nguội. Đặt secret
//    mới KHÔNG chắc làm isolate đang chạy thấy ngay. Script gọi thử có thử lại — đo thay vì
//    đoán xem có cần deploy lại hay không.
//
// Cần: `npx supabase@latest login` xong trước (script sẽ kiểm và báo nếu chưa).
//
// Chạy:
//   node scripts/doi-cron-secret.mjs
//   npm run secret:cron
//
// Kiểm script mà không sinh secret, không gọi CLI, không gọi mạng:
//   node scripts/doi-cron-secret.mjs --dry-run
//
// Xem thêm: docs/co-phieu-viet-nam.md, docs/push-notification.md

import { randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env.local')
const DRY = process.argv.includes('--dry-run')

/**
 * Hai cron job cùng nhúng PUSH_CRON_SECRET. Giữ trong MỘT danh sách để không thể sửa chỗ
 * này mà quên chỗ kia — đó đúng là cách lỗi 401 âm thầm sinh ra.
 *
 * `timeout` phải lớn hơn ngân sách thời gian bên trong từng function:
 * stock-refresh có FETCH_BUDGET_MS = 90s (prices.ts), push-notify nhẹ hơn nhiều.
 */
const CAC_JOB = [
  { job: 'stock-refresh-daily', func: 'stock-refresh', lich: '45 8 * * 1-5', timeout: 120_000 },
  { job: 'push-notify-hourly', func: 'push-notify', lich: '0 * * * *', timeout: 60_000 },
]

/** Lấy project-ref từ VITE_SUPABASE_URL để khỏi bắt người dùng tự tra. */
function docProjectRef() {
  if (!existsSync(ENV_FILE)) return null
  const url = readFileSync(ENV_FILE, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null
}

/**
 * Cùng cách sinh với setup-push.mjs: 32 byte ngẫu nhiên, base64url → 43 ký tự.
 *
 * Giữ y hệt là có chủ ý: phép kiểm hình dạng trong setup-stock-cron.mjs canh đúng con số 43,
 * nên secret sinh ở đây vẫn được nó xác nhận. Đổi cách sinh mà quên chỗ đó là tự tạo ra một
 * cảnh báo sai cho mình đọc sáu tháng sau.
 */
function sinhSecret() {
  return randomBytes(32).toString('base64url')
}

/**
 * Bọc nháy cho tham số khi cần — `shell: true` nối mọi tham số thành MỘT dòng lệnh, nên
 * đường dẫn có dấu cách phải tự bọc.
 */
function bocNhay(t) {
  return /^[A-Za-z0-9@._:/=-]+$/.test(t) ? t : `"${t.replaceAll('"', '\\"')}"`
}

/**
 * Có tham số nào chứa secret không.
 *
 * Hàm thuần, tách riêng để test được. `goiCli` gọi nó và THROW nếu có — nghĩa là nếu ai đó
 * sau này sửa lại thành truyền `PUSH_CRON_SECRET=...` qua argv (cách bản đầu của script này
 * đã làm), script tự chặn chính nó thay vì âm thầm đặt secret lên command line của cmd.exe.
 */
function coSecretTrongArgv(thamSo, secret) {
  return Boolean(secret) && thamSo.some((t) => t.includes(secret))
}

/** Secret của lượt chạy này, đặt sau khi sinh. Để goiCli tự kiểm được chính nó. */
let secretHienTai = null

/**
 * Chạy CLI Supabase. Trả về stdout, hoặc throw kèm thông điệp đọc được.
 *
 * `shell: true` là BẮT BUỘC trên Windows, không phải tuỳ chọn cho gọn. Đo ngày 2026-08-11:
 *   execFileSync('npx.cmd', ...)              → EINVAL (Node chặn spawn .cmd/.bat không shell)
 *   execFileSync('npx', ...)                  → ENOENT
 *   execFileSync('npx', ..., {shell:true})    → chạy được, supabase 2.113.0
 * Bản đầu của script này dùng cách thứ nhất, và vì chỗ bắt lỗi chỉ đọc `err.status` (undefined
 * với lỗi spawn) nên nó báo "CLI thất bại (mã thoát ?)" — đọc thành "chưa login" và đi sai
 * hướng một lượt. Vì vậy thông điệp lỗi dưới đây LUÔN kèm `code`.
 */
function goiCli(thamSo) {
  if (coSecretTrongArgv(thamSo, secretHienTai))
    throw new Error(
      'Nội bộ: secret bị đưa vào tham số CLI. Phải đi qua --env-file (xem datSecret) vì\n' +
        'shell:true đặt mọi tham số lên command line của cmd.exe.',
    )
  const lenh = ['npx', '--yes', 'supabase@latest', ...thamSo].map(bocNhay).join(' ')
  try {
    return execSync(lenh, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    const ra = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim()
    if (err.code === 'EINVAL' || err.code === 'ENOENT')
      throw new Error(
        `Không chạy được npx (${err.code}). Kiểm \`npx --version\` trong cùng terminal này.`,
      )
    const dau = `supabase ${thamSo.slice(0, 2).join(' ')}`
    throw new Error(
      ra || `CLI thất bại: ${dau} (code=${err.code ?? '-'}, mã thoát=${err.status ?? '-'})`,
    )
  }
}

/**
 * Đặt secret qua `--env-file`, KHÔNG qua argv.
 *
 * Vì `shell: true` nối tham số thành một dòng lệnh, truyền `PUSH_CRON_SECRET=<giá trị>` làm
 * tham số là đưa secret vào command line của cmd.exe — chỗ mà tiến trình khác của cùng người
 * dùng đọc được. File tạm nằm trong thư mục riêng do mkdtemp sinh, và bị xoá trong `finally`
 * kể cả khi CLI lỗi.
 */
function datSecret(ref, secret) {
  const thuMuc = mkdtempSync(join(tmpdir(), 'cron-secret-'))
  const tep = join(thuMuc, '.env')
  try {
    writeFileSync(tep, `PUSH_CRON_SECRET=${secret}\n`, 'utf8')
    return goiCli(['secrets', 'set', '--env-file', tep, '--project-ref', ref])
  } finally {
    rmSync(thuMuc, { recursive: true, force: true })
  }
}

function inSqlMotJob({ job, func, lich, timeout }, ref, secret) {
  const trongSql = secret.replaceAll("'", "''")
  return `select cron.schedule(
  '${job}',
  '${lich}',
  $cron$
  select net.http_post(
    url := 'https://${ref}.supabase.co/functions/v1/${func}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '${trongSql}'
    ),
    timeout_milliseconds := ${timeout}
  )
  $cron$
);`
}

/**
 * TOÀN BỘ nội dung nằm giữa hai vạch COPY — không chỉ phần cron.schedule.
 *
 * Tách thành hàm riêng để bài kiểm ASCII soi được ĐÚNG cái người dùng bôi đen. Bản trước chỉ
 * soi `inSqlMotJob()`, nên hai dòng `create extension` và phần bao quanh — đúng vùng mà đoạn
 * văn tiếng Việt đã lọt vào ngày 2026-08-12 — không được phủ. Phép phá đầu tiên nhét chữ Việt
 * vào `create extension` đã lọt qua toàn bộ bộ kiểm.
 */
function khoiCopy(ref, secret) {
  return `create extension if not exists pg_cron;
create extension if not exists pg_net;

${CAC_JOB.map((j) => inSqlMotJob(j, ref, secret)).join('\n\n')}`
}

/**
 * Gọi function bằng secret mới, thử lại vài lượt.
 *
 * Bất đối xứng đáng biết, và nó chính là tín hiệu ta dùng: secret SAI thì function trả 401
 * gần như tức thì (chặn ngay ở dòng so secret, trước cả khi chạm Yahoo); secret ĐÚNG thì nó
 * chạy hết việc — có thể ~90 giây với stock-refresh. Nên "lâu" đã là dấu hiệu tốt.
 */
async function goiThuCoThuLai(ref, func, secret, soLan = 3) {
  for (let lan = 1; lan <= soLan; lan++) {
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/${func}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      signal: AbortSignal.timeout(150_000),
    })
    const body = (await r.text()).slice(0, 400)
    if (r.status !== 401) return { status: r.status, body, lan }
    if (lan < soLan) {
      console.log(
        `  lượt ${lan}/${soLan}: vẫn 401 — isolate cũ chưa đọc secret mới. Đợi 20 giây rồi thử lại...`,
      )
      await new Promise((x) => setTimeout(x, 20_000))
    }
  }
  return { status: 401, body: 'Sai bí mật cron', lan: soLan }
}

/**
 * Chuoi co thuan ASCII khong.
 *
 * Dung de canh mot bat bien: khoi SQL in ra giua hai vach COPY khong duoc lan chu tieng
 * Viet. Ngay 2026-08-12 mot doan van tieng Viet nam ngay duoi khoi SQL, nguoi dung boi den
 * toi het man hinh va Postgres tra ERROR 42601 syntax error at or near "Roi".
 *
 * Kiem bang ma ky tu thay vi regex: /[^ -]/ lam oxlint canh bao no-control-regex.
 */
function thuanAscii(s) {
  return [...s].every((c) => c.codePointAt(0) < 128)
}

const ref = docProjectRef()

if (DRY) {
  const gia = 'x'.repeat(43)
  // Soi ĐÚNG khối người dùng bôi đen, không phải một phần của nó.
  const sql = khoiCopy(ref ?? '<ref>', gia)
  const kiem = [
    ['đọc được project-ref từ .env.local', ref !== null, ref ?? 'KHÔNG ĐỌC ĐƯỢC'],
    ['secret sinh ra dài 43 ký tự', sinhSecret().length === 43, ''],
    ['secret sinh ra là base64url', /^[A-Za-z0-9_-]+$/.test(sinhSecret()), ''],
    ['hai lần sinh không trùng nhau', sinhSecret() !== sinhSecret(), ''],
    ['phủ cả hai job nhúng secret', CAC_JOB.length === 2, CAC_JOB.map((j) => j.job).join(', ')],
    ['SQL có cả stock-refresh-daily', sql.includes("'stock-refresh-daily'"), ''],
    ['SQL có cả push-notify-hourly', sql.includes("'push-notify-hourly'"), ''],
    ['mọi job đều đặt timeout_milliseconds', CAC_JOB.every((j) => sql.includes(`timeout_milliseconds := ${j.timeout}`)), ''],
    ['SQL không còn chuỗi giữ chỗ', !/<[A-Za-z_-]+>/.test(sql), ''],
    ['stock-refresh timeout > FETCH_BUDGET_MS (90s)', CAC_JOB[0].timeout > 90_000, `${CAC_JOB[0].timeout}`],
    // shell:true nối tham số thành một dòng lệnh — đường dẫn file tạm có thể có dấu cách.
    ['bọc nháy đường dẫn có dấu cách', bocNhay('C:\\co dau cach\\.env') === '"C:\\co dau cach\\.env"', ''],
    ['không bọc nháy tham số thường', bocNhay('--project-ref') === '--project-ref', ''],
    // Secret đi qua --env-file, KHÔNG qua argv: chuỗi 'PUSH_CRON_SECRET=' không được xuất
    // hiện trong bất kỳ tham số nào truyền cho CLI.
    [
      'argv của datSecret KHÔNG chứa secret',
      !coSecretTrongArgv(['secrets', 'set', '--env-file', '/tmp/x/.env', '--project-ref', 'abc'], 'S3CR3T'),
      '',
    ],
    [
      'bắt được secret nếu bị đưa vào argv',
      coSecretTrongArgv(['secrets', 'set', 'PUSH_CRON_SECRET=S3CR3T'], 'S3CR3T'),
      '',
    ],
    // Khối giữa hai vạch COPY phải THUẦN ASCII. Chữ tiếng Việt lọt vào đó là lỗi đã xảy ra
    // thật ngày 2026-08-12: người dùng bôi đen tới hết màn hình, Postgres trả
    // `ERROR: 42601: syntax error at or near "Rồi"`. Bài kiểm này canh đúng bất biến đó.
    ['SQL sinh ra thuần ASCII (không lẫn chữ Việt)', thuanAscii(sql), ''],
  ]
  console.log('--dry-run: không đặt secret, không gọi CLI, không gọi mạng, không in secret.\n')
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
Đổi PUSH_CRON_SECRET trên project ${ref}.

Secret mới sẽ KHÔNG hiện lên màn hình cho tới khối SQL cuối cùng (chỗ đó buộc phải có, vì
giá trị nằm trong cron.job.command). Nó không đi qua chat, không vào git, không vào lịch sử
shell.

Việc script làm: ① kiểm CLI đã login → ② sinh secret → ③ đặt lên Supabase → ④ gọi thử
stock-refresh để chứng minh function nhận được giá trị mới → ⑤ in SQL hẹn lại cả hai job.
`)

// ① Kiểm CLI trước khi sinh gì: chưa login thì dừng ở đây, chưa có gì bị đổi.
process.stdout.write('① Kiểm Supabase CLI... ')
try {
  goiCli(['secrets', 'list', '--project-ref', ref])
  console.log('✓ đã login, đọc được secrets của project')
} catch (err) {
  console.log('✗')
  console.error(`\n${err.message}\n`)
  console.error('Chưa đổi gì cả. Chạy `npx supabase@latest login` rồi chạy lại script này.')
  process.exit(1)
}

// ② + ③
const secret = sinhSecret()
secretHienTai = secret
process.stdout.write('② Sinh secret mới (43 ký tự base64url)... ✓\n③ Đặt lên Supabase... ')
try {
  datSecret(ref, secret)
  console.log('✓')
} catch (err) {
  console.log('✗')
  console.error(`\n${err.message}`)
  console.error(
    '\nCó thể secret đã được đặt hoặc chưa — kiểm bằng `npx supabase@latest secrets list' +
      `\n--project-ref ${ref}` +
      '` (cột digest đổi là đã đặt). Chưa hẹn lại cron job nào, nên nếu đã đặt thì CẢ HAI job' +
      '\nđang mang secret cũ và sẽ 401 tới khi chạy lại script này thành công.',
  )
  process.exit(1)
}

// ④ Chứng minh function nhận được giá trị mới.
console.log(
  '④ Gọi thật POST /stock-refresh bằng secret mới để chứng minh.\n' +
    '   Lượt gọi này LÀM ĐÚNG VIỆC CỦA CRON: hút giá cả sàn HOSE và ghi account_valuations.\n' +
    '   Secret đúng thì nó chạy tới ~90 giây — chậm ở đây là dấu hiệu TỐT.',
)
const kq = await goiThuCoThuLai(ref, 'stock-refresh', secret)

if (kq.status === 401) {
  console.error(
    `\n✗ Vẫn 401 sau ${kq.lan} lượt. Secret ĐÃ được đặt, nhưng function đang chạy chưa đọc\n` +
      '  được giá trị mới. Deploy lại để buộc nó khởi động nguội:\n\n' +
      `    npm run bundle:rules\n` +
      `    npx supabase@latest functions deploy stock-refresh --project-ref ${ref} --no-verify-jwt\n` +
      `    npx supabase@latest functions deploy push-notify --project-ref ${ref} --no-verify-jwt\n\n` +
      '  Rồi chạy `node scripts/setup-stock-cron.mjs` và dán secret mới (lấy lại bằng cách\n' +
      '  chạy lại script này, nó sinh giá trị khác — hoặc đơn giản là chạy lại toàn bộ script này).',
  )
  process.exit(1)
}

console.log(`\n   ${kq.status === 200 ? '✓' : '⚠'} HTTP ${kq.status} (lượt ${kq.lan})\n   ${kq.body}`)
if (kq.status !== 200)
  console.log(
    '\n   Secret ĐÚNG (không bị chặn ở cửa 401), nhưng lượt chạy có lỗi. Đọc `loi` ở trên,\n' +
      '   đối chiếu bảng lý do trong docs/co-phieu-viet-nam.md. SQL vẫn in ra dưới đây.',
  )

// ⑤
//
// Mọi lời giải thích phải nằm TRƯỚC vạch bắt đầu, và sau vạch kết thúc KHÔNG được in gì
// thêm. Bản đầu in mấy câu kiểm kèm một dòng tiếng Việt ("Rồi kiểm — chạy TỪNG câu...")
// ngay dưới khối SQL; người dùng bôi đen tới hết màn hình và Postgres trả
// `ERROR: 42601: syntax error at or near "Rồi"`. Chỗ dừng phải nhìn thấy được, không phải
// suy ra. Câu kiểm chuyển sang docs/co-phieu-viet-nam.md.
console.log(`
─────────────────────────────────────────────────────────────────────
⑤ Bôi đen từ vạch "COPY TỪ ĐÂY" tới vạch "HẾT" rồi dán vào Supabase
   SQL Editor và bấm Run. KHÔNG copy hai dòng vạch, KHÔNG copy gì
   ngoài khoảng giữa hai vạch.

   Cả hai khối đều cần: bỏ khối push-notify là thông báo đẩy im lặng
   ngừng chạy. Dán lại nhiều lần không sao, nó ghi đè job cũ.

   Khối này CHỨA SECRET — đừng dán vào chat, vào issue, hay commit.

   Câu kiểm sau khi chạy: xem docs/co-phieu-viet-nam.md, mục "Hẹn cron".
─────────────────────────────────────────────────────────────────────
════════════════════════ COPY TỪ ĐÂY ════════════════════════
${khoiCopy(ref, secret)}
════════════════════════ ĐẾN ĐÂY, HẾT ═══════════════════════`)
