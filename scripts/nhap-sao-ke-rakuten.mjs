// Nhập sao kê 受渡履歴 của Rakuten Securities vào bảng `fund_trades`.
//
// Chạy TAY, một lần. Không có giao diện: 136 dòng một lần, vài tháng mới lặp lại — làm
// giao diện nhập file là công sức không thu hồi được.
//
// Chạy:
//   node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn csv>" --account <uuid>          (xem trước)
//   node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn csv>" --account <uuid> --ghi     (ghi thật)
//
// `--ghi` hỏi SUPABASE_SERVICE_ROLE_KEY ở ô nhập KÍN (không hiện lên màn hình, không vào
// argv, không vào lịch sử shell) — cùng cách setup-stock-cron.mjs hỏi secret cron. Khoá
// đó chỉ được xuất hiện trong terminal của chủ app.
//
// BỐN CÁI BẪY của file sao kê, cả bốn đều đã đo thật:
//
// ① File là Shift-JIS. Đọc bằng utf-8 thì cột SỐ vẫn đúng, chỉ cột NGÀY và TÊN QUỸ ra
//    rác — nghĩa là bảng bí danh không khớp dòng nào, và lỗi trông như "tên quỹ lạ".
//
// ② Có HAI cột ngày: 受渡日 (tiền về) và 約定日 (khớp lệnh). 基準価額 thuộc về 約定日.
//    Trên sao kê thật hai ngày lệch tới 5 ngày (受渡 2026/4/14 ⇄ 約定 2026/4/9).
//
// ③ MỘT QUỸ NẰM DƯỚI HAI TÊN. Rakuten đổi tên loạt 「楽天・プラス」 ngày 2024-10-17, nên
//    một sao kê chứa cả tên cũ lẫn tên mới của cùng một quỹ. Ghép theo tên một cách ngây
//    thơ cho ra 口数 ÂM (đã đo: S&P500 −19.848, VTI −10.232). Vì vậy bảng bí danh nằm
//    trong DB (`fund_aliases`), và có bất biến "không quỹ nào được âm" chặn ở bước 4.
//
// ④ File trộn lệnh quỹ với DÒNG TIỀN (nạp thẻ, điểm Rakuten, thuế, quét tiền) và trộn
//    NISA với 特定口座. Chỉ ba loại `取引区分` được nhận; mọi loại bị bỏ đều được ĐẾM VÀ
//    NÊU TÊN, không bỏ im lặng.
//
// ⑤ Ô SỐ mang dấu phẩy phân nhóm nghìn NGAY TRONG ngoặc kép (`"17,588.00000"`,
//    `"28,429"`). Một phép `split(',')` ngây thơ xé những ô đó làm hai và lùi mọi cột
//    phía sau — units/nav/amount ra số rác mà không lỗi nào bật lên để báo. Xem tachDong().
//
// Xem thêm: docs/quy-nhat.md

import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Ba loại lệnh quỹ. Mọi 取引区分 khác là dòng tiền — xem bẫy ④. */
const LOAI_MUA = new Set(['株式投信購入（積立）', '株式投信購入'])
const LOAI_BAN = new Set(['株式投信解約'])

/** Chỉ số cột, đếm từ 0. Đặt tên vì `o[6]` ở giữa file là câu đố. */
const COT = {
  uyDo: 0,
  ky: 1, // 約定日 — cột được dùng; xem bẫy ②
  loai: 2,
  vi: 3, // 口座区分
  ten: 4, // 対象証券名
  donGia: 5, // 基準価額, ¥/10.000口
  soLuong: 6, // 口数
  thu: 7, // 受渡金額（受取） — lệnh BÁN
  chi: 8, // 受渡金額（支払） — lệnh MUA
}

/** '1,234' / '-' / '' → số nguyên; không đọc được thì 0. */
function so(s) {
  if (s == null) return 0
  const v = Number(String(s).replace(/,/g, '').replace(/^-$/, '0').trim())
  return Number.isFinite(v) ? Math.round(v) : 0
}

/** '2026/4/9' → '2026-04-09'; null nếu không đúng dạng. */
function ngaySangISO(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s ?? '').trim())
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/**
 * Tách một dòng CSV thành các ô, có để ý dấu ngoặc kép.
 *
 * KHÔNG dùng `split(',')` ngây thơ: các ô số trên sao kê Rakuten mang dấu phẩy phân
 * nhóm nghìn ngay TRONG ngoặc kép (`"17,588.00000"`, `"28,429"`), nên một phép split
 * đơn giản xé một ô số làm hai và lùi mọi cột phía sau nó — units/nav/amount ra số rác
 * mà không ném lỗi nào cả. Ký tự `"` chỉ dùng để bọc ô ở file này (không có ô nào chứa
 * `""` để tự thoát dấu ngoặc), nên chỉ cần lật cờ trongNgoac là đủ, không cần một trình
 * đọc CSV đầy đủ.
 */
function tachDong(dong) {
  const o = []
  let hienTai = ''
  let trongNgoac = false
  for (const c of dong) {
    if (c === '"') {
      trongNgoac = !trongNgoac
    } else if (c === ',' && !trongNgoac) {
      o.push(hienTai)
      hienTai = ''
    } else {
      hienTai += c
    }
  }
  o.push(hienTai)
  return o
}

/**
 * Byte sao kê → header + các dòng đã tách ô.
 *
 * Giải mã Shift-JIS nằm TRONG hàm này (nhận Uint8Array, không nhận string) để bài test
 * bắt được nếu ai đó đổi sang utf-8 — xem bẫy ①. Header không ra `受渡日` thì NÉM LỖI,
 * không đoán: đọc nhầm định dạng rồi ghi 136 dòng rác vào DB là chuyện phải chặn ở đây.
 */
export function docSaoKe(bytes) {
  const text = new TextDecoder('shift_jis').decode(bytes)
  const dong = text.split(/\r?\n/).filter((d) => d.trim())
  const header = tachDong(dong[0] ?? '').map((s) => s.trim())
  if (header[0] !== '受渡日')
    throw new Error(
      `Không phải sao kê 受渡履歴 của Rakuten (cột đầu là "${header[0]}", cần "受渡日"). ` +
        `Nếu bạn thấy chữ rác thì file đã bị chuyển sang UTF-8 — tải lại bản gốc.`,
    )
  return {
    header,
    dong: dong.slice(1).map((d) => tachDong(d)),
  }
}

/**
 * Lọc ra lệnh quỹ, bỏ dòng tiền. Mọi loại bị bỏ được ĐẾM VÀ NÊU TÊN — xem bẫy ④.
 *
 * `tradedOn` lấy cột 約定日, không phải 受渡日 — xem bẫy ②.
 */
export function locLenhQuy(dong) {
  const lenh = []
  const boQua = new Map()
  for (const o of dong) {
    const loai = (o[COT.loai] ?? '').trim()
    const laMua = LOAI_MUA.has(loai)
    const laBan = LOAI_BAN.has(loai)
    if (!laMua && !laBan) {
      boQua.set(loai, (boQua.get(loai) ?? 0) + 1)
      continue
    }
    const tradedOn = ngaySangISO(o[COT.ky])
    if (tradedOn === null) {
      boQua.set(`${loai} (ngày hỏng)`, (boQua.get(`${loai} (ngày hỏng)`) ?? 0) + 1)
      continue
    }
    lenh.push({
      tenSaoKe: (o[COT.ten] ?? '').trim(),
      kind: laMua ? 'buy' : 'sell',
      tradedOn,
      units: so(o[COT.soLuong]),
      nav: so(o[COT.donGia]),
      // Mua thì tiền ở cột （支払）, bán thì ở cột （受取）. Lấy nhầm cột là amount = 0 và
      // CHECK fund_trades_shape từ chối cả dòng.
      amount: laMua ? so(o[COT.chi]) : so(o[COT.thu]),
      bucket: (o[COT.vi] ?? '').replace(/^-$/, '').trim(),
    })
  }
  return { lenh, boQua }
}

/**
 * Ghép tên quỹ trong sao kê → 協会コード qua bảng bí danh.
 *
 * So khớp CHÍNH XÁC, không so gần đúng: hai quỹ Rakuten có tên khác nhau đúng ba ký tự
 * (`・プラス`) và có 基準価額 khác nhau. Một phép so gần đúng ở đây sẽ cộng tiền vào nhầm
 * quỹ mà không ai biết.
 *
 * Tên không có trong bảng được trả về trong `tenLa` để nơi gọi DỪNG — không đoán.
 */
export function ghepBiDanh(lenh, biDanh) {
  const xong = []
  const tenLa = new Set()
  for (const l of lenh) {
    const ma = biDanh.get(l.tenSaoKe)
    if (!ma) {
      tenLa.add(l.tenSaoKe)
      continue
    }
    xong.push({ ...l, assocFundCd: ma })
  }
  return { xong, tenLa: [...tenLa] }
}

/**
 * Bất biến: sau khi ghép, KHÔNG quỹ nào được ÂM 口数 tại BẤT KỲ THỜI ĐIỂM nào trong lịch
 * sử — không chỉ ở tổng cuối cùng.
 *
 * Vì sao phải xét TỪNG BƯỚC theo thời gian, không chỉ tổng cuối: cộng dồn là phép cộng,
 * nên tổng CUỐI không phụ thuộc thứ tự cộng — bỏ một bí danh có thể vẫn cho ra tổng cuối
 * DƯƠNG nếu một lệnh mua khác (dưới tên còn khớp) đủ lớn để lấp lại, trong khi số dư THỰC
 * đã âm ở một thời điểm giữa đường. Đây đúng là cách `oversold` trong fundHoldingsFromTrades
 * xét — "bán quá cái đang giữ lúc bán", không phải "tổng mua trừ tổng bán của cả đời".
 *
 * Đây là phép thử đã bắt được CẢ HAI lần đổi tên (xem bẫy ③) — bảng bí danh thiếu một
 * dòng thì số âm hiện ra ngay ở bước xử lý, không cần ai đi soi. Cộng dồn theo 約定日 vì
 * sao kê xếp mới nhất trước.
 */
export function soatSoDuAm(xong) {
  const duNo = new Map()
  const amTung = new Set()
  for (const l of [...xong].sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))) {
    const truoc = duNo.get(l.assocFundCd) ?? 0
    const sau = truoc + (l.kind === 'sell' ? -l.units : l.units)
    duNo.set(l.assocFundCd, sau)
    if (sau < 0) amTung.add(l.assocFundCd)
  }
  return [...amTung].sort()
}

/**
 * Hỏi một giá trị ở ô nhập KÍN — không hiện lên màn hình, không vào argv.
 *
 * Cùng khuôn với `hoiKin` trong scripts/setup-stock-cron.mjs (KHÔNG phải
 * doi-cron-secret.mjs — file đó tự SINH secret bằng randomBytes, không hỏi ai cả).
 */
function hoiKin(cauHoi) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // Bịt echo: ghi đè _writeToOutput như setup-stock-cron.mjs đang làm.
    rl._writeToOutput = () => {}
    process.stdout.write(cauHoi)
    rl.question('', (v) => {
      rl.close()
      process.stdout.write('\n')
      // Bracketed paste: terminal bọc nội dung dán giữa ESC[200~ và ESC[201~, và readline
      // không phải lúc nào cũng bóc ra. Vì ô nhập cố tình không hiện gì, chuỗi bẩn không
      // có dấu hiệu nào trên màn hình.
      // eslint-disable-next-line no-control-regex
      const khongDauNgoac = v.replace(/\u001b\[20[01]~/g, '')
      // eslint-disable-next-line no-control-regex
      resolve(khongDauNgoac.replace(/[\u0000-\u001f\u007f]/g, '').trim())
    })
  })
}

async function chinh() {
  const duongDan = process.argv[2]
  const accountId = process.argv[process.argv.indexOf('--account') + 1]
  const GHI = process.argv.includes('--ghi')
  if (!duongDan || !accountId || accountId.startsWith('--')) {
    console.error(
      'Dùng: node scripts/nhap-sao-ke-rakuten.mjs "<csv>" --account <uuid> [--ghi]',
    )
    process.exit(1)
  }

  const { dong } = docSaoKe(new Uint8Array(readFileSync(duongDan)))
  const { lenh, boQua } = locLenhQuy(dong)

  console.log(`\nĐọc ${dong.length} dòng dữ liệu → ${lenh.length} lệnh quỹ.`)
  console.log('Đã bỏ (không phải lệnh quỹ):')
  for (const [loai, n] of [...boQua].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${loai}`)

  const url = docEnv('VITE_SUPABASE_URL')
  const khoa = GHI
    ? await hoiKin('SUPABASE_SERVICE_ROLE_KEY (không hiện lên màn hình): ')
    : docEnv('VITE_SUPABASE_ANON_KEY')

  // Bảng bí danh đọc từ DB, không phải hằng số trong script: lần sau Rakuten đổi tên nữa
  // thì thêm một hàng vào `fund_aliases`, không sửa code.
  const biDanh = new Map(
    (await goi(url, khoa, 'fund_aliases?select=statement_name,assoc_fund_cd')).map((r) => [
      r.statement_name,
      r.assoc_fund_cd,
    ]),
  )

  const { xong, tenLa } = ghepBiDanh(lenh, biDanh)
  if (tenLa.length > 0) {
    console.error('\nDỪNG — có tên quỹ không có trong bảng `fund_aliases`:')
    for (const t of tenLa) console.error(`  ${t}`)
    console.error(
      '\nThêm một hàng vào fund_aliases cho mỗi tên trên rồi chạy lại. KHÔNG đoán:\n' +
        'hai quỹ Rakuten có tên khác nhau đúng ba ký tự và có 基準価額 khác nhau.',
    )
    process.exit(1)
  }

  const am = soatSoDuAm(xong)
  if (am.length > 0) {
    console.error(`\nDỪNG — số 口数 ÂM ở: ${am.join(', ')}`)
    console.error(
      'Gần chắc là `fund_aliases` còn thiếu một dòng: quỹ đã đổi tên và nửa lịch sử\n' +
        'đang ghép vào một mã khác. Xem docs/quy-nhat.md, mục "quỹ đổi tên".',
    )
    process.exit(1)
  }

  // Đối chiếu để so tay với app Rakuten.
  const duNo = new Map()
  const von = new Map()
  for (const l of [...xong].sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))) {
    const u = duNo.get(l.assocFundCd) ?? 0
    const v = von.get(l.assocFundCd) ?? 0
    if (l.kind === 'sell') {
      const conLai = Math.max(0, u - l.units)
      von.set(l.assocFundCd, u > 0 ? Math.round((v * conLai) / u) : 0)
      duNo.set(l.assocFundCd, conLai)
    } else {
      duNo.set(l.assocFundCd, u + l.units)
      von.set(l.assocFundCd, v + l.amount)
    }
  }
  console.log('\nCòn giữ (so tay với app Rakuten):')
  for (const [ma, u] of [...duNo].sort())
    console.log(`  ${ma}  ${String(u).padStart(9)} 口   vốn ${String(von.get(ma) ?? 0).padStart(9)} ¥`)

  if (!GHI) {
    console.log('\n(xem trước — thêm --ghi để ghi thật)')
    return
  }

  // Idempotent: khoá trùng là (account, quỹ, ngày, loại, 口数, tiền). Chạy lại cùng file
  // không sinh dòng thứ hai.
  const daCo = new Set(
    (
      await goi(
        url,
        khoa,
        `fund_trades?select=assoc_fund_cd,traded_on,kind,units,amount&account_id=eq.${accountId}`,
      )
    ).map((r) => `${r.assoc_fund_cd}|${r.traded_on}|${r.kind}|${r.units}|${r.amount}`),
  )
  const userId = (await goi(url, khoa, `accounts?select=user_id&id=eq.${accountId}`))[0]?.user_id
  if (!userId) throw new Error('Không tìm thấy tài khoản này.')

  const moi = xong
    .filter((l) => !daCo.has(`${l.assocFundCd}|${l.tradedOn}|${l.kind}|${l.units}|${l.amount}`))
    .map((l) => ({
      user_id: userId,
      account_id: accountId,
      assoc_fund_cd: l.assocFundCd,
      kind: l.kind,
      traded_on: l.tradedOn,
      units: l.units,
      nav: l.nav,
      amount: l.amount,
      bucket: l.bucket,
      note: '',
    }))

  console.log(`\nGhi ${moi.length} lệnh mới (${xong.length - moi.length} lệnh đã có sẵn).`)
  for (let i = 0; i < moi.length; i += 200) await ghiVao(url, khoa, moi.slice(i, i + 200))
  console.log('Xong.')
}

function docEnv(ten) {
  const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const v = t.match(new RegExp(`^${ten}=(.+)$`, 'm'))?.[1]?.trim()
  if (!v) throw new Error(`Thiếu ${ten} trong .env.local`)
  return v
}

async function goi(url, khoa, duong) {
  const res = await fetch(`${url}/rest/v1/${duong}`, {
    headers: { apikey: khoa, Authorization: `Bearer ${khoa}` },
  })
  if (!res.ok) throw new Error(`GET ${duong}: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

async function ghiVao(url, khoa, hang) {
  const res = await fetch(`${url}/rest/v1/fund_trades`, {
    method: 'POST',
    headers: {
      apikey: khoa,
      Authorization: `Bearer ${khoa}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(hang),
  })
  if (!res.ok) throw new Error(`POST fund_trades: HTTP ${res.status} ${await res.text()}`)
}

// Chạy trực tiếp thì làm việc; được test import thì không làm gì.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await chinh()
}
