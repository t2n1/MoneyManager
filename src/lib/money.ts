// Tiền luôn lưu ở ĐƠN VỊ NHỎ NHẤT (minor units, khớp bigint trong DB):
// JPY = yên, VND = đồng, USD = cent. Không bao giờ dùng float.
// Nhập liệu kiểu ATM: chuỗi chữ số chính là minor units ("1050" USD → $10,50).
import { isPrivacyEnabled } from './privacy'
import { CURRENCIES, groupThousands, type CurrencyCode } from './currencies'

// Bảng loại tiền sống ở module lá ./currencies (không import gì) để những nơi chỉ
// cần bảng — assets/aggregate.ts, lib/rates.ts — không bị kéo theo lib/privacy.ts
// (React + localStorage). Xuất lại ở đây để mọi chỗ import cũ khỏi phải sửa.
export { CURRENCIES } from './currencies'
export type { CurrencyCode } from './currencies'

/**
 * Che phần SỐ bằng đúng bấy nhiêu ký tự (§4.8 / 20c).
 *
 * Trước đây che bằng bốn chấm cố định (`¥••••`), nên bật/tắt chế độ riêng tư là cả cột
 * số bên phải XÊ DỊCH: `¥1,234,567` (10 ký tự) co xuống `¥••••` (5), rồi bung ra lại.
 * Ở một bảng hai chục dòng thì đó là cả bảng nhảy — và người bật che số thường đang ở
 * chỗ đông người, tức đúng lúc không muốn màn hình động đậy.
 *
 * Che CẢ dấu phân cách nghìn, không giữ lại: `¥•,•••,•••` vẫn vẽ ra đúng cấu trúc hàng
 * triệu. Bề rộng thì dù sao cũng lộ độ lớn — nhưng đó là cái giá của yêu cầu "rộng đúng
 * bằng số thật", không cần lộ thêm.
 *
 * Từ bản 1a mọi con số đi qua <Money> đều là font ĐƠN CÁCH, nên "bằng số ký tự" chính
 * là "bằng số pixel". Ở font sans thì nó chỉ xấp xỉ — chấp nhận được, và không có chỗ
 * nào trong app còn in tiền bằng font sans.
 *
 * Dấu âm GIỮ NGUYÊN: nó nói chiều, không nói số tiền, và giữ nó thì bề rộng vẫn khớp
 * đúng chuỗi thật.
 */
function maskDigits(body: string): string {
  return '•'.repeat(body.length)
}

/** Chỉ phần SỐ (chữ số + dấu phân cách), chưa có dấu âm và ký hiệu tiền. */
function bodyOf(minor: number, currency: CurrencyCode): string {
  const { decimals, group, decimal } = CURRENCIES[currency]
  const abs = Math.trunc(Math.abs(minor)).toString().padStart(decimals + 1, '0')
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs
  const fracPart = decimals > 0 ? `${decimal}${abs.slice(-decimals)}` : ''
  return `${groupThousands(intPart, group)}${fracPart}`
}

/** Ghép dấu âm + ký hiệu tiền quanh phần số, theo `position` của đồng tiền. */
function boc(minor: number, currency: CurrencyCode, body: string): string {
  const { symbol, position } = CURRENCIES[currency]
  const sign = minor < 0 ? '-' : ''
  return position === 'prefix' ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`
}

/**
 * Cùng chuỗi với `formatMoney` nhưng KHÔNG bao giờ che số.
 *
 * Dùng khi con số đi vào DỮ LIỆU chứ không lên màn: ghi chú tự sinh, CSV, chuỗi máy đọc.
 * Ở những chỗ đó '•••' không phải là "đã che" mà là một bản ghi SAI — nó nằm lại vĩnh
 * viễn sau khi người dùng tắt chế độ riêng tư, và không còn gì khôi phục được con số.
 * `src/mcp/format.ts` đã ghi đúng luật này cho phía MCP; đây là bản dùng chung.
 *
 * Lên màn thì luôn dùng `formatMoney` (hoặc <Money>) — che số là một lời hứa với người dùng.
 */
export function formatMoneyReal(minor: number, currency: CurrencyCode): string {
  return boc(minor, currency, bodyOf(minor, currency))
}

/** minor units → chuỗi hiển thị: ¥1,234 · 1.234.000 ₫ · $1.234,56 */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  const real = bodyOf(minor, currency)
  return boc(minor, currency, isPrivacyEnabled() ? maskDigits(real) : real)
}

/** Chuỗi bất kỳ → minor units (chỉ giữ chữ số). Không có chữ số → 0. */
export function parseMoney(input: string): number {
  const digits = input.replace(/\D/g, '')
  return digits === '' ? 0 : Number(digits)
}

/** minor units → nhãn ngắn cho trục biểu đồ (¥300k, 1.5M…). Giữ dấu âm. */
export function formatCompact(minor: number, currency: CurrencyCode): string {
  // Che bằng ĐÚNG số ký tự của nhãn thật, cùng lý do với formatMoney: nhãn trục co
  // từ "300M" xuống "•••" là cả trục tung xê sang, kéo theo vùng vẽ của biểu đồ.
  if (isPrivacyEnabled()) return maskDigits(formatCompactReal(minor, currency))
  return formatCompactReal(minor, currency)
}

function formatCompactReal(minor: number, currency: CurrencyCode): string {
  const major = minor / 10 ** CURRENCIES[currency].decimals
  const abs = Math.abs(major)
  if (currency === 'JPY') return formatCompactJa(major, abs)
  // Bỏ đuôi ".0" khi số chẵn: trục tung ghi "300M" chứ không "300.0M" — phần lẻ
  // bằng 0 là nhiễu, nhất là khi 5-6 nhãn trục xếp dọc cùng lúc.
  //
  // Có bậc B (tỷ): bản chiếu Lifetime theo VND chạm hàng trăm tỷ, thiếu bậc này thì
  // trục tung ghi "110000M" — về mặt kỹ thuật đúng, về mặt đọc là một chuỗi phải
  // ngồi đếm chữ số.
  if (abs >= 1_000_000_000) return `${(major / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000) return `${Math.round(major / 1_000)}k`
  return groupInt(Math.round(major), currency)
}

/**
 * Số nguyên có DẤU PHÂN CÁCH NGHÌN, đúng ký tự của loại tiền (¥1,200 · 1.200 ₫).
 *
 * Vì sao nhánh "in nguyên chữ số" của nhãn rút gọn cũng phải nhóm: nhãn này đứng CẠNH
 * những con số đi qua `formatMoney`, mà bên đó nhóm từ đầu. Một cột ghi "1200" nằm ngay
 * dưới một dòng ghi "¥25,862" đọc ra như hai hệ chữ số khác nhau, và ở mốc bốn chữ số
 * thì mắt phải dừng lại đếm — đúng việc mà dấu phân cách sinh ra để khỏi phải làm.
 *
 * KHÔNG rộng thêm bao nhiêu: chuỗi dài nhất của nhánh này là "9,999" — đo ở IBM Plex Mono
 * 11px ra 30px, vẫn trong `width={44}` mà ba biểu đồ dùng nhãn này đóng cứng.
 *
 * Nhóm trên phần TRỊ TUYỆT ĐỐI rồi mới gắn dấu: `groupThousands` chèn theo `\B`, nên đưa
 * thẳng "-1200" vào sẽ ra "-1,200" ở đây nhưng phụ thuộc vào chỗ dấu trừ nằm đâu — tách ra
 * là không phải tin vào điều đó.
 */
function groupInt(value: number, currency: CurrencyCode): string {
  const g = groupThousands(String(Math.abs(value)), CURRENCIES[currency].group)
  return value < 0 ? `-${g}` : g
}

/**
 * Nhãn rút gọn cho YÊN theo hệ đếm Nhật: 万 = 10⁴, 億 = 10⁸.
 *
 * Vì sao JPY đi lối riêng: K/M/B nhóm BA chữ số một lần, còn 万/億 nhóm BỐN. Ở Nhật
 * mọi con số tiền gặp ngoài đời — giá nhà, bảng lương, sao kê ngân hàng — đều đọc
 * theo 万, nên "¥300k" bắt người xem tự đổi trong đầu còn "30万" thì đọc thẳng ra.
 * Sai một bậc ở đây không phải nhầm nhãn mà là nhầm mười lần số tiền.
 *
 * KHÔNG có bậc nghìn: 万 là bậc rút gọn đầu tiên, dưới nó in nguyên chữ số ("8,000").
 * Ghép thêm "8千" là trộn hai hệ đếm trên cùng một trục, mà 千 thì người Nhật cũng
 * không dùng để nói tiền.
 *
 * Phần lẻ theo quy ước của bậc M/B ở trên: một chữ số thập phân, bỏ đuôi ".0" khi
 * chẵn — "30万" chứ không "30.0万". Riêng chỗ cắt phần lẻ thì khác, xem trimJa.
 */
function formatCompactJa(major: number, abs: number): string {
  if (abs >= 100_000_000) return `${trimJa(major / 100_000_000)}億`
  if (abs >= 10_000) return `${trimJa(major / 10_000)}万`
  return groupInt(Math.round(major), 'JPY')
}

/**
 * Từ ba chữ số trở lên thì BỎ phần lẻ. Không phải vì khó đọc mà vì nó KHÔNG VỪA:
 * cả ba biểu đồ dùng nhãn này đều đóng cứng trục tung `width={44}`
 * (MonthlyBarsCard, LifetimeChartCard, LongView), mà "1234.6万" đo được 47px ở
 * IBM Plex Sans 11px — nhãn tràn sang vùng vẽ. "1235万" chỉ 37px.
 *
 * 万/億 đắt chỗ hơn K/M/B: một glyph CJK rộng bằng hai chữ số, mà bậc 万 lại trải
 * BỐN bậc mười (10⁴→10⁸) nên nó thường xuyên phải in bốn chữ số — chỗ mà bậc M
 * chỉ cần ba. Đến ba chữ số thì chữ số thập phân còn nói 0,1% giá trị, đúng phần
 * đáng cắt trước.
 */
function trimJa(scaled: number): string {
  if (Math.abs(scaled) >= 100) return String(Math.round(scaled))
  return scaled.toFixed(1).replace(/\.0$/, '')
}
