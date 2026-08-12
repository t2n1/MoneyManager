// Nhập sao kê 受渡履歴 của Rakuten Securities vào bảng `fund_trades`.
//
// Chạy TAY, một lần. Không có giao diện: 136 dòng một lần, vài tháng mới lặp lại — làm
// giao diện nhập file là công sức không thu hồi được.
//
// Chạy:
//   node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn csv>" --account <uuid>          (xem trước)
//   node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn csv>" --account <uuid> --ghi     (ghi thật)
//
// KHOÁ — vì sao script đọc SUPABASE_SERVICE_ROLE_KEY, dù đây KHÔNG PHẢI khoá duy nhất
// chạy được: RLS của `fund_trades` là policy "own rows" (`auth.uid() = user_id`, xem
// 0045_fund_prices_trades.sql) và `fund_aliases` chỉ có đúng MỘT policy, mở SELECT cho
// MỌI `authenticated` — nên một JWT đăng nhập thường của CHÍNH chủ tài khoản thoả cả đọc
// lẫn ghi. Service role KHÔNG bắt buộc.
//
// Chọn service role vì là đường ÍT BƯỚC TAY NHẤT cho một script chạy TAY, MỘT LẦN: đổi
// sang phiên đăng nhập thường nghĩa là script phải nhận MẬT KHẨU (tệ hơn hẳn) hoặc bảo
// chủ app dán access token sống 1 giờ từ DevTools — cả hai nhiều bề mặt lỗi hơn cho một
// script dùng đúng một lần rồi thôi.
//
// (Khoá `anon` thì thật sự KHÔNG chạy được — khác hẳn service role: `fund_aliases` không
// có policy nào `to anon` ⇒ RLS lọc sạch ⇒ PostgREST vẫn trả HTTP 200 kèm mảng RỖNG,
// KHÔNG lỗi ⇒ MỌI tên quỹ rơi vào `tenLa` ⇒ script dừng và khuyên SAI "thêm hàng vào
// fund_aliases", trong khi 10 hàng đó đã có sẵn từ migration — chủ app sẽ đi sửa một thứ
// không hỏng.)
//
// Van an toàn THẬT không nằm ở việc chọn khoá — service role đọc được ở CẢ chế độ xem
// trước (chỉ ĐỌC, không ghi gì) và chế độ ghi thật. Van an toàn nằm ở BƯỚC POST, sau bốn
// chốt chặn thuần cục bộ (hình dạng dữ liệu ở CHECK fund_trades_shape, tên lạ trong
// fund_aliases, 口数 âm, đếm trùng theo túi): cờ `--ghi` (không có thì không bao giờ gọi
// POST) + câu xác nhận `y/N` mặc định KHÔNG.
//
// Lấy khoá theo thứ tự: dòng `SUPABASE_SERVICE_ROLE_KEY=` trong .env.local (KHÔNG có tiền
// tố `VITE_` nên Vite không nhét nó vào bundle trình duyệt, và .env.local đã trong
// .gitignore), nếu không có thì hỏi ở ô nhập KÍN — không hiện lên màn hình, không vào
// argv, không vào lịch sử shell. Cùng khuôn `hoiKin`/`donDauVao` của
// scripts/setup-stock-cron.mjs.
//
// NĂM CÁI BẪY của file sao kê, cả năm đều đã đo thật:
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
//    trong DB (`fund_aliases`), và có bất biến "không quỹ nào được âm" chặn ở bước 5.
//
// ④ File trộn lệnh quỹ với DÒNG TIỀN (nạp thẻ, điểm Rakuten, thuế, quét tiền) và trộn
//    NISA với 特定口座. Chỉ ba loại `取引区分` được nhận; mọi loại bị bỏ đều được ĐẾM VÀ
//    NÊU TÊN, không bỏ im lặng.
//
// ⑤ Ô SỐ mang dấu phẩy phân nhóm nghìn NGAY TRONG ngoặc kép (`"17,588.00000"`,
//    `"28,429"`). Một phép `split(',')` ngây thơ xé những ô đó làm hai và lùi mọi cột
//    phía sau — units/nav/amount ra số rác mà không lỗi nào bật lên để báo. Xem tachDong().
//
// KHÔNG có phép tính riêng ở file này. Số dư 口数, giá vốn và cờ "bán quá tay" gọi thẳng
// `fundHoldingsFromTrades` của bộ luật (qua bundle _funds.js) — hai bản sao của một phép
// tính là chuyện sớm muộn lệch nhau, và ở đây lệch nghĩa là bảng đối chiếu in ra không
// khớp với con số app hiện, đúng lúc chủ app đang so tay với app Rakuten.
//
// Xem thêm: docs/quy-nhat.md

import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
// Bundle của edge function fund-refresh — cùng MỘT nguồn với app (sinh từ
// src/features/assets/fundHoldings.ts bằng `npm run bundle:rules`).
import { fundHoldingsFromTrades } from '../supabase/functions/fund-refresh/_funds.js'

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

/** Số dòng mỗi lô POST. Nhỏ hơn thì nhiều request; lớn hơn thì một dòng xấu giết cả lô. */
const CO_LO = 200

/** Cỡ trang khi đọc PostgREST. Bằng giới hạn mặc định của Supabase — xem src/data/paging.ts. */
const CO_TRANG = 1000

/** Trần số trang, chặn vòng lặp vô hạn nếu nguồn cứ trả về trang đầy. */
const TOI_DA_TRANG = 200

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
 *
 * Mặt xấu của cách lật cờ: ngoặc kép MỞ mà không đóng (file bị cắt giữa dòng, hoặc tải
 * về dở) thì hàm này GỘP mọi cột còn lại làm một ô, im lặng — `"a,b,c` ra `['a,b,c']`.
 * Vì vậy docSaoKe() đếm số ô của TỪNG dòng và ném lỗi nếu khác header: một dòng bị lùi
 * cột chỉ lộ ra gián tiếp qua units/nav/amount rác, không lộ ra ở đây.
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
 *
 * Mọi dòng dữ liệu phải có ĐÚNG số ô của header, khác thì ném lỗi kèm SỐ DÒNG trong
 * file gốc — xem lý do ở tachDong().
 */
export function docSaoKe(bytes) {
  const text = new TextDecoder('shift_jis').decode(bytes)
  // Giữ số dòng THẬT trong file để thông điệp lỗi trỏ được vào chỗ cần mở ra xem; lọc
  // dòng trắng xong rồi mới đếm thì số in ra không khớp với editor.
  const coNoiDung = text
    .split(/\r?\n/)
    .map((d, i) => ({ d, soDong: i + 1 }))
    .filter((x) => x.d.trim())
  const header = tachDong(coNoiDung[0]?.d ?? '').map((s) => s.trim())
  if (header[0] !== '受渡日')
    throw new Error(
      `Không phải sao kê 受渡履歴 của Rakuten (cột đầu là "${header[0]}", cần "受渡日"). ` +
        `Nếu bạn thấy chữ rác thì file đã bị chuyển sang UTF-8 — tải lại bản gốc.`,
    )

  const dong = []
  for (const { d, soDong } of coNoiDung.slice(1)) {
    const o = tachDong(d)
    if (o.length !== header.length)
      throw new Error(
        `Dòng ${soDong} có ${o.length} ô, header có ${header.length} ô — file bị lệch cột.\n` +
          `Thường là ngoặc kép mở mà không đóng (file tải về dở, hoặc bị cắt giữa dòng), và\n` +
          `khi đó mọi cột phía sau lùi một chỗ: units/nav/amount ra số rác mà không lỗi nào\n` +
          `bật lên. Mở dòng ${soDong} ra xem, hoặc tải lại bản gốc.`,
      )
    dong.push(o)
  }
  return { header, dong }
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
 * Dòng nào KHÔNG qua nổi CHECK `fund_trades_shape` (`units > 0 and amount > 0` với
 * buy/sell). Trả về chính các dòng đó để nơi gọi nêu tên.
 *
 * Vì sao phải canh ở đây thay vì để Postgres nói: lệnh đã 約定 mà CHƯA 受渡 có ô
 * 受渡金額（支払）= `-`, và `so('-')` ra 0 ⇒ `amount = 0` với `kind='buy'`. Sao kê thật
 * có dòng như vậy. Vì POST gửi cả lô 200 dòng (CO_LO) kèm `Prefer: return=minimal`,
 * Postgres bỏ CẢ LÔ và người chạy chỉ nhận `HTTP 400 ... violates check constraint
 * "fund_trades_shape"` — không biết dòng nào, mà các lô TRƯỚC đã ghi xong rồi: ghi dở
 * dang. Chặn trước khi POST thì không lô nào được gửi.
 */
export function soatHinhDang(lenh) {
  return lenh.filter((l) => l.units <= 0 || l.amount <= 0)
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
 * Khoá chống trùng của MỘT lệnh. Dùng cho CẢ hai phía (dòng trong file và dòng đã có
 * trong DB) để hai bên không thể dựng khoá theo hai công thức khác nhau.
 *
 * `bucket` NẰM TRONG khoá vì script có ghi cột đó: hai lệnh cùng ngày cùng số tiền mà
 * khác 口座区分 (NISA成長投資枠 vs NISAつみたて投資枠) là HAI lệnh thật, gộp làm một là
 * mất một dòng. `nav` KHÔNG nằm trong khoá: nó là số tham chiếu, không tham gia phép
 * tính giá vốn, và một lần sửa 基準価額 bằng tay không được biến dòng cũ thành dòng mới.
 */
export function khoaTrung(l) {
  return [l.assocFundCd, l.tradedOn, l.kind, l.units, l.amount, l.bucket ?? ''].join('|')
}

/**
 * Chia các lệnh trong file thành `moi` (chưa có trong DB) và `trung` (đã có).
 *
 * `fund_trades` KHÔNG có unique constraint nào, nên `upsert` bất khả thi — phải đọc về
 * rồi lọc. Nhưng đếm theo TÚI (Map khoá → số lượng), không theo TẬP: nếu DB đã có k bản
 * của một khoá mà file có n > k bản thì phải ghi thêm n − k, không phải 0. Ca n > k là
 * thật: hai kỳ 積立 trùng khớp hoàn toàn cùng 約定日, hoặc chủ app đã gõ tay một dòng rồi
 * mới nhập sao kê. Dùng Set ở đây là im lặng bỏ n − k dòng.
 */
export function locTrung(xong, hangDaCo) {
  const con = new Map()
  for (const l of hangDaCo.map(sangLenh)) {
    const k = khoaTrung(l)
    con.set(k, (con.get(k) ?? 0) + 1)
  }
  const moi = []
  const trung = []
  for (const l of xong) {
    const k = khoaTrung(l)
    const n = con.get(k) ?? 0
    if (n > 0) {
      con.set(k, n - 1)
      trung.push(l)
    } else {
      moi.push(l)
    }
  }
  return { moi, trung }
}

/** Hàng `fund_trades` đọc từ PostgREST → shape `FundTrade` của bộ luật. */
export function sangLenh(r) {
  return {
    assocFundCd: r.assoc_fund_cd,
    kind: r.kind,
    tradedOn: r.traded_on,
    units: Number(r.units),
    nav: Number(r.nav),
    amount: Number(r.amount),
    bucket: r.bucket ?? '',
  }
}

/**
 * Bất biến: KHÔNG quỹ nào được ÂM 口数 tại BẤT KỲ THỜI ĐIỂM nào trong lịch sử — không
 * chỉ ở tổng cuối cùng.
 *
 * Vì sao phải xét TỪNG BƯỚC theo thời gian, không chỉ tổng cuối: cộng dồn là phép cộng,
 * nên tổng CUỐI không phụ thuộc thứ tự cộng — bỏ một bí danh có thể vẫn cho ra tổng cuối
 * DƯƠNG nếu một lệnh mua khác (dưới tên còn khớp) đủ lớn để lấp lại, trong khi số dư THỰC
 * đã âm ở một thời điểm giữa đường.
 *
 * Đây đúng là chuyện `oversold` của `fundHoldingsFromTrades` đo, nên hàm này GỌI THẲNG
 * hàm đó thay vì cộng dồn lại một lần nữa: `fund-refresh` trả HTTP 400 và dừng cả lượt
 * khi `oversold` không rỗng, nên hai bên phải đồng ý DO CẤU TẠO. Một bản cộng dồn thứ hai
 * ở đây là chuyện sớm muộn lệch — và lúc lệch thì script cho nhập, còn cron 400 mỗi ngày.
 *
 * Đây là phép thử đã bắt được CẢ HAI lần đổi tên (xem bẫy ③) — bảng bí danh thiếu một
 * dòng thì số âm hiện ra ngay ở bước xử lý, không cần ai đi soi.
 */
export function soatSoDuAm(xong) {
  return fundHoldingsFromTrades(xong).oversold
}

/**
 * Hỏi một dòng mà không hiện ký tự nào lên màn hình. Trả chuỗi THÔ — donDauVao() ở dưới
 * cần biết đã bỏ đi những gì để nói ra.
 *
 * Cùng khuôn với `hoiKin` trong scripts/setup-stock-cron.mjs (KHÔNG phải
 * doi-cron-secret.mjs — file đó tự SINH secret bằng randomBytes, không hỏi ai cả).
 *
 * Chốt `isTTY`: stdin không phải terminal (pipe, tác vụ nền, CI) thì readline không bịt
 * echo được và cũng không đọc được gì — TỪ CHỐI chạy thay vì đọc về chuỗi rỗng rồi báo
 * 401 mà không ai hiểu vì sao.
 */
function hoiKin(loiNhac) {
  return new Promise((xong, hong) => {
    if (!process.stdin.isTTY) {
      hong(
        new Error(
          'stdin không phải terminal nên không hỏi kín được. Chạy trực tiếp trong terminal,\n' +
            'đừng qua pipe hay qua tác vụ nền. (Hoặc đặt SUPABASE_SERVICE_ROLE_KEY vào .env.local.)',
        ),
      )
      return
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // readline vẽ lại CẢ dòng (gồm lời nhắc) sau mỗi lần gõ. Cho lời nhắc qua đúng một
    // lần, chặn mọi lượt vẽ sau — nhờ vậy không ký tự nào của khoá lọt ra màn hình, và
    // cũng không có dấu * nào để đếm ra độ dài.
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
      xong(traLoi)
    })
  })
}

/**
 * Dọn chuỗi dán vào, và nói rõ đã bỏ đi bao nhiêu.
 *
 * Bracketed paste: Windows Terminal, iTerm và nhiều terminal khác bọc nội dung dán giữa
 * `ESC[200~` và `ESC[201~`, và readline không phải lúc nào cũng bóc hai dãy đó ra. Khoá
 * lẫn chúng thì PostgREST trả 401 — mà ô nhập CỐ TÌNH không hiện gì nên trên màn hình
 * không có MỘT dấu hiệu nào, chỉ thấy 401 và tưởng mình copy sai khoá.
 *
 * Trả về cả `soKyTuDaBo` để chỗ gọi cảnh báo được: im lặng dọn xong rồi vẫn 401 thì
 * người dùng lại đi nghi sai chỗ lần nữa.
 */
export function donDauVao(tho) {
  // Viết bằng escape, không nhúng ký tự thật vào file: một ký tự điều khiển tàng hình
  // giữa hai dấu / là thứ không ai đọc lại được, git diff cũng không hiện ra.
  // eslint-disable-next-line no-control-regex
  const khongDauNgoac = tho.replaceAll(/\u001b\[20[01]~/g, '')
  // eslint-disable-next-line no-control-regex
  const khongDieuKhien = khongDauNgoac.replaceAll(/[\u0000-\u001f\u007f]/g, '')
  const sach = khongDieuKhien.trim()
  return { sach, soKyTuDaBo: tho.length - sach.length }
}

/** Câu y/N HIỆN LÊN màn hình (khác hoiKin). Mặc định là KHÔNG: Enter trơn là huỷ. */
function hoiCo(cauHoi) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(cauHoi, (v) => {
      rl.close()
      resolve(/^y(es)?$/i.test(v.trim()))
    })
  })
}

/**
 * Khoá service role: ưu tiên .env.local, không có thì hỏi kín.
 *
 * Ưu tiên file vì gõ/dán bằng tay là chỗ sinh ra lỗi 401 không giải thích được (xem
 * donDauVao), và vì chủ app không phải nhập lại mỗi lần chạy thử chế độ xem trước.
 */
async function layKhoa() {
  const tuFile = docEnvTuyChon('SUPABASE_SERVICE_ROLE_KEY')
  if (tuFile) {
    console.log('\nKhoá: SUPABASE_SERVICE_ROLE_KEY đọc từ .env.local.')
    return tuFile
  }
  let tho
  try {
    tho = await hoiKin('SUPABASE_SERVICE_ROLE_KEY (không hiện lên màn hình): ')
  } catch (err) {
    // Một dòng đọc được, không phải stack trace: lỗi ở đây luôn là chuyện môi trường
    // chạy (pipe, tác vụ nền), không phải bug cần truy vết.
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  const { sach, soKyTuDaBo } = donDauVao(tho)
  if (soKyTuDaBo > 0)
    console.log(
      `⚠ Đã dọn ${soKyTuDaBo} ký tự điều khiển khỏi chuỗi dán vào (terminal chèn —\n` +
        '  bracketed paste hoặc tương tự). Chuỗi gửi đi là bản đã dọn.',
    )
  if (!sach) {
    console.error('✗ Chưa nhập gì.')
    process.exit(1)
  }
  return sach
}

async function chinh() {
  const duongDan = process.argv[2]
  const accountId = process.argv[process.argv.indexOf('--account') + 1]
  const GHI = process.argv.includes('--ghi')
  if (!duongDan || !accountId || accountId.startsWith('--')) {
    console.error('Dùng: node scripts/nhap-sao-ke-rakuten.mjs "<csv>" --account <uuid> [--ghi]')
    process.exit(1)
  }

  const { dong } = docSaoKe(new Uint8Array(readFileSync(duongDan)))
  const { lenh, boQua } = locLenhQuy(dong)

  console.log(`\nĐọc ${dong.length} dòng dữ liệu → ${lenh.length} lệnh quỹ.`)
  console.log('Đã bỏ (không phải lệnh quỹ):')
  for (const [loai, n] of [...boQua].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${loai}`)

  // Chặn TRƯỚC khi hỏi khoá: đây là phép kiểm thuần local, không cần mạng, và mọi thứ
  // chặn được mà không cần khoá thì phải chặn trước khi chủ app gõ khoá cao quyền nhất.
  const hong = soatHinhDang(lenh)
  if (hong.length > 0) {
    console.error(`\nDỪNG — ${hong.length} dòng không qua nổi CHECK fund_trades_shape:`)
    for (const l of hong)
      console.error(
        `  ${l.tradedOn}  ${l.kind}  units=${l.units}  amount=${l.amount}  ${l.tenSaoKe}`,
      )
    console.error(
      '\nAmount = 0 gần chắc là lệnh đã 約定 mà CHƯA 受渡: ô 受渡金額 trên sao kê còn là "-".\n' +
        'Chờ sao kê tháng sau rồi nhập lại — lúc đó số tiền thật mới có. Không tự điền số:\n' +
        '`amount` là nguồn sự thật cho giá vốn.',
    )
    process.exit(1)
  }

  const url = docEnv('VITE_SUPABASE_URL')
  const khoa = await layKhoa()

  // Bảng bí danh đọc từ DB, không phải hằng số trong script: lần sau Rakuten đổi tên nữa
  // thì thêm một hàng vào `fund_aliases`, không sửa code.
  const hangBiDanh = await goiHet(
    url,
    khoa,
    'fund_aliases?select=statement_name,assoc_fund_cd',
    'statement_name',
  )

  // 0 hàng là "KHÔNG ĐỌC ĐƯỢC BẢNG", KHÔNG phải "mọi tên đều lạ" — hai chuyện này cần hai
  // hành động khác nhau hoàn toàn, nên phải in ra hai thông điệp khác nhau. Migration
  // 0045 seed sẵn 10 hàng, nên bảng rỗng thật là chuyện gần như không thể.
  if (hangBiDanh.length === 0) {
    console.error('\nDỪNG — đọc `fund_aliases` về 0 hàng, tức KHÔNG ĐỌC ĐƯỢC BẢNG.')
    console.error(
      'Migration 0045 seed sẵn 10 hàng, nên bảng rỗng thật gần như không thể. Ba nguyên nhân:\n' +
        '  1. migration 0045 chưa được áp lên project này (kiểm: bảng có tồn tại không);\n' +
        '  2. PostgREST chưa refresh schema cache sau khi áp migration;\n' +
        '  3. khoá đang dùng không phải service role — RLS của fund_aliases chỉ mở cho role\n' +
        '     `authenticated`, và role `anon` bị lọc SẠCH mà PostgREST vẫn trả HTTP 200.\n' +
        'ĐỪNG thêm hàng vào fund_aliases: 10 hàng đó đã có sẵn, thêm nữa là sửa thứ không hỏng.',
    )
    process.exit(1)
  }
  const biDanh = new Map(hangBiDanh.map((r) => [r.statement_name, r.assoc_fund_cd]))

  const { xong, tenLa } = ghepBiDanh(lenh, biDanh)
  if (tenLa.length > 0) {
    console.error(
      `\nDỪNG — có tên quỹ không có trong bảng \`fund_aliases\` (bảng đọc được ${hangBiDanh.length} hàng):`,
    )
    for (const t of tenLa) console.error(`  ${t}`)
    console.error(
      '\nThêm một hàng vào fund_aliases cho mỗi tên trên rồi chạy lại. KHÔNG đoán:\n' +
        'hai quỹ Rakuten có tên khác nhau đúng ba ký tự và có 基準価額 khác nhau.',
    )
    process.exit(1)
  }

  // Đọc sổ lệnh đã có TRONG DB — cần cho cả hai việc: lọc trùng, và soát số âm trên HỢP
  // của hai tập.
  const hangDaCo = await goiHet(
    url,
    khoa,
    `fund_trades?select=id,assoc_fund_cd,traded_on,kind,units,nav,amount,bucket&account_id=eq.${accountId}`,
    'id',
  )
  const { moi, trung } = locTrung(xong, hangDaCo)

  if (trung.length > 0) {
    console.log(`\n${trung.length} lệnh đã có sẵn trong DB, sẽ KHÔNG ghi lại:`)
    for (const l of trung)
      console.log(
        `  ${l.tradedOn}  ${l.kind.padEnd(4)}  ${String(l.units).padStart(9)} 口  ` +
          `${String(l.amount).padStart(9)} ¥  ${l.bucket || '(không có 口座区分)'}  ${l.assocFundCd}`,
      )
  }

  // Soát số âm trên HỢP của hai tập, không chỉ trên các dòng trong file.
  //
  // Vì sao: `fund-refresh` phán `oversold` trên TOÀN BỘ `fund_trades` của tài khoản. Xét
  // riêng các dòng trong file thì hai tập dữ liệu khác nhau cho hai kết luận khác nhau:
  // nhập sao kê MỘT PHẦN (chỉ 2026, phần mua 2024 đã nằm trong DB) ⇒ thấy bán trước mua
  // ⇒ CHẶN OAN; ngược lại, file tự nó lành nhưng hợp với dòng đã có lại thành `oversold`
  // ⇒ nhập "thành công" rồi cron 400 MỖI NGÀY. Hợp phải là `daCo + moi` (đúng những gì DB
  // sẽ chứa sau khi ghi), KHÔNG phải `daCo + xong`: đếm hai lần một lệnh bán đã có sẵn là
  // tự tạo ra một cờ oversold không có thật.
  const hopNhat = [...hangDaCo.map(sangLenh), ...moi]
  const am = soatSoDuAm(hopNhat)
  if (am.length > 0) {
    console.error(`\nDỪNG — số 口数 ÂM ở: ${am.join(', ')}`)
    console.error(
      `(xét trên HỢP của ${hangDaCo.length} lệnh đã có trong DB và ${moi.length} lệnh mới của file —\n` +
        ' đúng tập mà fund-refresh sẽ xét, nên đây cũng là lý do cron sẽ trả 400.)\n' +
        'Gần chắc là `fund_aliases` còn thiếu một dòng: quỹ đã đổi tên và nửa lịch sử\n' +
        'đang ghép vào một mã khác. Xem docs/quy-nhat.md, mục "quỹ đổi tên".',
    )
    process.exit(1)
  }

  // Bảng đối chiếu để so tay với app Rakuten. Số ở đây gọi THẲNG bộ luật — cùng hàm mà
  // app và edge function dùng — nên không thể lệch vài yên với con số app hiện.
  const { holdings, realizedPnl } = fundHoldingsFromTrades(hopNhat)
  console.log('\nSau khi nhập, sổ lệnh của tài khoản này ra (so tay với app Rakuten):')
  for (const h of holdings)
    console.log(
      `  ${h.assocFundCd}  ${String(h.units).padStart(9)} 口   ` +
        `vốn ${String(h.costBasis).padStart(9)} ¥   取得単価 ${String(h.avgNav).padStart(7)}`,
    )
  const daBanSach = [...new Set(hopNhat.map((t) => t.assocFundCd))]
    .filter((ma) => !holdings.some((h) => h.assocFundCd === ma))
    .sort()
  if (daBanSach.length > 0) console.log(`  (đã bán sạch, không còn 口数: ${daBanSach.join(', ')})`)
  console.log(`  Lãi/lỗ đã hiện thực hoá: ${realizedPnl} ¥`)

  if (!GHI) {
    console.log(`\n(xem trước — sẽ ghi ${moi.length} lệnh mới. Thêm --ghi để ghi thật.)`)
    return
  }

  const userId = (await goi(url, khoa, `accounts?select=user_id&id=eq.${accountId}`))[0]?.user_id
  if (!userId) throw new Error('Không tìm thấy tài khoản này.')

  if (moi.length === 0) {
    console.log('\nKhông có lệnh nào mới — không ghi gì.')
    return
  }

  // Câu xác nhận cuối. Rẻ, và đây là script ghi vào sổ tiền THẬT của chủ app bằng khoá
  // service role: bấm Enter trơn (hoặc stdin không phải terminal) là HUỶ.
  const dongY = await hoiCo(
    `\nGhi ${moi.length} lệnh vào fund_trades của tài khoản ${accountId}? [y/N] `,
  )
  if (!dongY) {
    console.log('Đã huỷ — chưa ghi gì.')
    return
  }

  const hang = moi.map((l) => ({
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
  for (let i = 0; i < hang.length; i += CO_LO) await ghiVao(url, khoa, hang.slice(i, i + CO_LO))
  console.log(`Xong — đã ghi ${hang.length} lệnh.`)
}

/** Nội dung .env.local, đọc đúng MỘT lần cho cả lượt chạy. */
let envDaDoc = null
function docEnvTuyChon(ten) {
  envDaDoc ??= readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  return envDaDoc.match(new RegExp(`^${ten}=(.+)$`, 'm'))?.[1]?.trim() ?? null
}

function docEnv(ten) {
  const v = docEnvTuyChon(ten)
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

/**
 * Đọc HẾT một bảng, phân trang, thứ tự đơn trị.
 *
 * Supabase cắt im lặng ở 1.000 dòng — không lỗi, không cảnh báo, chỉ là thiếu dòng
 * (xem src/data/paging.ts; `readAll` của fund-refresh cũng làm vậy). Ở 136 lệnh thì chưa
 * chạm, nhưng đây là ĐƯỜNG GHI TIỀN: quá 1.000 lệnh thì danh sách "đã có" thiếu,
 * và vì `fund_trades` KHÔNG có unique constraint nào, chạy lại là NHÂN ĐÔI sổ lệnh.
 *
 * `order` phải là khoá đơn trị: thiếu thứ tự ổn định thì hai trang liền nhau có thể trả
 * về cùng một dòng hai lần và bỏ sót dòng khác — Postgres không hứa giữ thứ tự.
 */
async function goiHet(url, khoa, duong, order) {
  const ra = []
  for (let i = 0; i < TOI_DA_TRANG; i++) {
    const offset = i * CO_TRANG
    const trang = await goi(
      url,
      khoa,
      `${duong}&order=${order}.asc&limit=${CO_TRANG}&offset=${offset}`,
    )
    ra.push(...trang)
    if (trang.length < CO_TRANG) return ra
  }
  throw new Error(
    `Đọc ${duong} vượt quá ${TOI_DA_TRANG * CO_TRANG} dòng — dừng để không lặp vô hạn.`,
  )
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
