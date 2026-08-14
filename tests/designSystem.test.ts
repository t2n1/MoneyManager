// Ràng buộc của design system, kiểm bằng chính vitest sẵn có (đọc file, không cần
// DOM — repo không có @testing-library nên không có test render nào để dựa vào).
//
// Hai loại luật, cố ý khác nhau:
//
//   BAN cứng  — phải bằng 0. Dùng cho những thứ ĐÃ dọn sạch. Tái xuất hiện là hồi quy.
//   NGƯỠNG    — số hiện tại là TRẦN, chỉ được giảm. Dùng cho idiom còn ~70-100 chỗ
//               chưa gộp: đặt về 0 ngay thì phải refactor 92 file trong một lần, mà
//               không có test UI nào đỡ. Ngưỡng cho phép gộp dần và vẫn chặn được
//               việc thêm mới. Gộp bớt được chỗ nào thì HẠ số xuống, đừng để nguyên.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ở tests/ chứ không phải src/: file này đọc filesystem bằng `node:fs`, mà
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`. Nhét vào src thì phải
// thêm type Node cho toàn bộ code app — mất luôn ranh giới ngăn ai đó import `fs`
// vào file chạy trên trình duyệt. Đây là công cụ, không phải code app.
//
// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money
// Manager") nên pathname trả về đã percent-encode → ENOENT.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')

function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * Bỏ comment trước khi đếm. Không bỏ thì chính lời giải thích "đừng dùng X" trong
 * comment lại làm guardrail đỏ — mà comment tại chỗ là nơi TỐT NHẤT để nói lý do.
 *
 * Chỉ bỏ block `/* *\/` và dòng bắt đầu bằng `//` hoặc `*`; KHÔNG cắt `//` giữa dòng
 * vì URL trong chuỗi (`https://…`) sẽ bị chặt mất phần sau.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

/**
 * Trần cho văn xuôi chưa đi qua cổng của chế độ Gọn — xem test cuối file.
 *
 * 49 (2026-08-11): đo sau khi bọc 35 đoạn vào <Guide>. Con số còn lại KHÔNG phải nợ
 * cần dọn hết: đã xét từng chỗ, phần lớn là cảnh báo dữ liệu (thiếu tỷ giá, chưa quy
 * đổi), dòng số liệu, câu giải thích ô đang bị vô hiệu, và trạng thái rỗng mà câu chữ
 * là đường đi tiếp duy nhất. Bọc chúng lại là bỏ chức năng, không phải bớt chữ.
 *
 * 51 (2026-08-12): mặt lập kế hoạch thêm hai dòng SỐ LIỆU, không phải chữ dạy —
 * "3 tháng gần đây: 2026-06 ¥42.100 · …" ở ô đặt hạn mức, và "định kỳ ×2 → Nhà ở" ở
 * danh sách cam kết. Cả hai chính là thứ khiến khối đó đáng nhìn; bọc <Guide> thì ở
 * chế độ Gọn ô đặt hạn mức lại thành ô trống, đúng cái lỗi đợt này đi sửa.
 *
 * 52 (2026-08-12): khối trần-theo-nhãn của mặt lập kế hoạch có câu cảnh báo thiếu tỷ
 * giá, y hệt câu đã có ở TagBudgetsCard. Cảnh báo "số đang tính thiếu" mà ẩn ở chế độ
 * Gọn thì người dùng đọc một con số sai mà không biết — đúng loại phải ở lại.
 *
 * 53 (2026-08-13): FundHoldingsSection lặp lại đúng dòng "theo giá phiên …/chưa có
 * bảng giá" đã có ở HoldingsSection, chỉ đổi nhãn 基準価額 cho quỹ Nhật. Đây là dòng
 * SỐ LIỆU nói rõ đang tính theo phiên nào — bọc <Guide> là mất thông tin đó ở chế độ
 * Gọn, đúng loại lỗi các lần nâng trần trước đã tránh.
 *
 * 56 (2026-08-13): InvestFundsTab (tab Quỹ Nhật của vỏ /invest hai tab) lặp lại ba
 * dòng đã có bên InvestStocksTab, chỉ đổi từ "mã/giá" sang "quỹ/基準価額": trạng thái
 * rỗng chưa có tài khoản (đường đi tiếp duy nhất là liên kết tới Cài đặt), cảnh báo
 * "chưa tính được" khi thiếu giá, và trạng thái chưa giữ quỹ nào. Cùng loại ba dòng
 * này bên tab cổ phiếu đã nằm trong 53 phía trên — đây không phải chữ mới, chỉ là
 * bản song sinh cho tab thứ hai.
 *
 * 57 (2026-08-13): AccountDetailPage giờ có HAI câu cảnh báo "chưa tính được giá"
 * KHÁC NHAU cho HAI trạng thái khác nhau, không phải một câu chép hai lần:
 *
 *   - Khối KHÔNG có sổ lệnh: "Chưa cập nhật giá thị trường — đang tính theo vốn
 *     gốc." Guard của nó là `invStats.unrealizedPnl == null`, tức chưa từng có bản
 *     định giá tay nào — "chưa cập nhật" đúng nghĩa đen ở đây.
 *   - Khối CÓ sổ lệnh: "Chưa tính được — chưa có giá cho mã/quỹ nào đang giữ."
 *     (mượn nguyên chữ từ nhánh `p.marketValue === null` của InvestStocksTab, cách
 *     một cú bấm "Xem →"). Guard của nó là `danhMuc.marketValue == null`, và số lớn
 *     phía trên khối này có thể đang rơi về `invStats.marketValue` — MỘT BẢN ĐỊNH
 *     GIÁ TAY CŨ vẫn tồn tại. Dùng câu "chưa cập nhật" ở đây sẽ SAI: có snapshot,
 *     chỉ là buildPortfolio không có giá cho mã/quỹ nào đang giữ.
 *
 * Hai câu KHÔNG được gộp lại thành một dù trông giống nhau về hình dạng ("chưa
 * tính được…"/"fg-muted"): ai đọc thấy giống rồi "gộp" (rút thành một hằng chuỗi
 * dùng chung cho cả hai khối) sẽ làm câu sai quay lại ở đúng một trong hai trạng
 * thái — đây chính là lỗi mà chốt review Task 6 phát hiện lần đầu (một câu chép tay
 * sang khối không đúng ngữ cảnh của nó). Hai đoạn cảnh báo DỮ LIỆU cho hai trạng
 * thái thật khác nhau này VẪN giữ nguyên, không phải chữ dạy — bọc <Guide> sẽ giấu
 * cảnh báo ở chế độ Gọn, đúng lỗi các lần nâng trần trước đã tránh.
 *
 * 55 (2026-08-13, đợt gộp danh mục): tụt xuống vì HoldingsSection và FundHoldingsSection
 * bị xoá — nội dung của chúng gom về hai tab của /invest, nơi mỗi câu chỉ còn MỘT bản.
 * Hạ trần theo đúng quy ước ở thông điệp lỗi của chính phép thử này: trần không hạ là
 * trần rỗng, để lần sau thêm văn xuôi mới mà không ai biết.
 */
const PROSE_MAX = 55

const FILES = sourceFiles().map((path) => ({
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}))

/** Số lần `needle` xuất hiện trong toàn bộ src, kèm danh sách file để báo lỗi cho rõ. */
function occurrences(needle: string) {
  let count = 0
  const where: string[] = []
  for (const f of FILES) {
    const n = f.text.split(needle).length - 1
    if (n > 0) {
      count += n
      where.push(`${f.path.replace(SRC, '')} (${n})`)
    }
  }
  return { count, where }
}

/**
 * Số DÒNG chứa đồng thời cả `a` lẫn `b`. Vá đường lách của luật cặp-màu-liền-kề:
 * `text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100` — chèn một class xen
 * giữa là thoát khỏi phép so chuỗi liền. Từng có 48 chỗ lách kiểu này.
 */
function sameLineOccurrences(a: string, b: string) {
  let count = 0
  const where: string[] = []
  for (const f of FILES) {
    const n = f.text.split('\n').filter((l) => l.includes(a) && l.includes(b)).length
    if (n > 0) {
      count += n
      where.push(`${f.path.replace(SRC, '')} (${n})`)
    }
  }
  return { count, where }
}

describe('design system — ban cứng (phải bằng 0)', () => {
  // Lý do: gray-400 trên nền trắng chỉ 2,5:1, cần 4,5:1. Chiều đúng là
  // `text-gray-500 dark:text-gray-400` — nền tối thì chữ phụ phải SÁNG hơn.
  it('không dùng gray-400 làm chữ phụ ở light mode', () => {
    const { count, where } = occurrences('text-gray-400 dark:text-gray-500')
    expect(count, `Sai chiều màu. Dùng text-gray-500 dark:text-gray-400.\n${where.join('\n')}`).toBe(
      0,
    )
  })

  // Lý do: palette v4 dùng oklch, green-600 chỉ 3,22:1 và red-600 4,33:1 trên
  // gray-100. Quyết định 2026-07-29: Thu = green-800, Chi = red-700.
  it('không dùng green-600/red-600 cho số tiền', () => {
    for (const needle of ['text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400']) {
      const { count, where } = occurrences(needle)
      expect(count, `${needle} trượt AA. Dùng <Money> hoặc token.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: đã có token `text-money-in`/`text-money-out` tự lật sáng/tối. Viết lại
  // cặp màu bằng tay nghĩa là quyết định bị nhân bản ra nhiều chỗ — đúng cái đã dẫn
  // tới 124 chỗ phải sửa một lượt hôm 2026-07-29.
  it('dùng token cho màu tiền, không viết lại cặp sáng/tối bằng tay', () => {
    for (const needle of ['text-green-800 dark:text-green-400', 'text-red-700 dark:text-red-400']) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng text-money-in / text-money-out.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: nút chính là nền có CHỮ TRẮNG đè lên → cần 4,5:1 với trắng. green-600
  // (#00a63e) chỉ 3,22:1. Màu nhấn của app là green-700, khai ở token --accent.
  it('không dùng green-600 làm nền nút', () => {
    const { count, where } = occurrences('bg-green-600')
    expect(count, `Trắng trên green-600 chỉ 3,22:1. Dùng bg-green-700.\n${where.join('\n')}`).toBe(0)
  })

  // Lý do: <label> mồ côi — không có `htmlFor` và cũng không BỌC control nào — thì
  // screen reader đọc ra một nhãn rỗng và ô nhập bên dưới KHÔNG có tên gì (đã đo bằng
  // thuật toán tính accessible name trên app đang chạy hôm 2026-07-30: 7/8 ô ở
  // ScenarioEditorSheet không có tên).
  //
  // Trước 2026-08-11 chỗ này chỉ chặn được đúng MỘT dạng (`<label className={label_}>`
  // của ba sheet Lifetime) và phần còn lại nằm dưới một NGƯỠNG đếm `<label className`.
  // Ngưỡng đó chỉ là đại diện gần đúng: nó đếm cả nhãn hợp lệ và bỏ sót nhãn viết
  // `className` sau `htmlFor`. Nay 71 nhãn mồ côi đã dọn hết nên thay bằng luật THẬT —
  // phân loại từng <label> đúng như spec, phải bằng 0.
  //
  // "labelable element" theo spec HTML: button, input, meter, output, progress, select,
  // textarea. `button` NẰM TRONG danh sách — nên <label> bọc một <button role="switch">
  // là hợp lệ, vừa đặt tên vừa thành vùng chạm. Bốn nhãn công tắc (AccountsPage,
  // AssetGroupsPage) sống nhờ điều đó; đổi chúng sang <div> là mất vùng chạm.
  it('không có <label> mồ côi (không htmlFor, không bọc control)', () => {
    // Component tự dựng mà BÊN TRONG là một thẻ labelable → <label> bọc nó vẫn hợp lệ,
    // nhưng đọc nguồn thì không thấy. Khai tên ở đây thay vì bỏ qua mọi `<Hoa…` —
    // bỏ qua tất thì <label> bọc <Guide> (chỉ có chữ) cũng lọt.
    //   AccountToggle (AccountsPage:707) và Toggle (AssetGroupsPage:34): cả hai render
    //   <button type="button" role="switch" aria-label>.
    const BOC_CONTROL_BEN_TRONG = ['AccountToggle', 'Toggle']
    const moCoi: string[] = []
    for (const file of sourceFiles()) {
      // Che comment nhưng GIỮ số ký tự, để số dòng báo lỗi vẫn đúng. Cần vì chính các
      // comment giải thích "chỗ này dùng <span> chứ không <label>" lại chứa chữ `<label`.
      const raw = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
      const re = /<label\b/g
      let m: RegExpExecArray | null
      while ((m = re.exec(raw))) {
        const start = m.index
        // Thẻ mở = tới dấu `>` đầu tiên NGOÀI mọi ngoặc nhọn (thuộc tính JSX như
        // htmlFor={`${uid}-x`} có `>` bên trong không tính).
        let i = start + '<label'.length
        let depth = 0
        for (; i < raw.length; i++) {
          const c = raw[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
        }
        const openTag = raw.slice(start, i + 1)
        if (/\bhtmlFor\b/.test(openTag)) continue
        const close = raw.indexOf('</label>', i)
        const body = close === -1 ? '' : raw.slice(i + 1, close)
        if (/<(input|select|textarea|button|meter|output|progress)\b/.test(body)) continue
        if (BOC_CONTROL_BEN_TRONG.some((c) => new RegExp(`<${c}\\b`).test(body))) continue
        moCoi.push(`${file.slice(SRC.length + 1)}:${raw.slice(0, start).split('\n').length}`)
      }
    }
    expect(
      moCoi.length,
      `<label> mồ côi: không đọc được tên ô. Cách sửa:\n` +
        `  · nhãn cho MỘT ô  → htmlFor + id sinh bằng useId (mẫu: EventFormSheet)\n` +
        `  · nhãn cho NHÓM / cho MoneyField → <span>, tên ô đi qua aria-label\n` +
        moCoi.join('\n'),
    ).toBe(0)
  })

  // Lý do: amber KHÔNG có sắc độ nào đạt AA cả hai chế độ (đo thật: amber-600 =
  // 3,20:1 trên trắng nhưng 5,55:1 trên gray-900; amber-700 thì 5,03:1 và 3,53:1).
  // Nên chọn sắc độ "trông vừa mắt" ở một chế độ là tự động trượt ở chế độ kia — đúng
  // cái đã xảy ra ở 11 chỗ trước 2026-07-30. Chữ cảnh báo phải đi qua token.
  it('không dùng amber-600/500 làm chữ (trượt AA ở light mode)', () => {
    for (const needle of ['text-amber-600', 'text-amber-500']) {
      const { count, where } = occurrences(needle)
      expect(
        count,
        `${needle} chỉ ${needle.endsWith('600') ? '3,20' : '2,13'}:1 trên trắng. Dùng text-fg-warn.\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // Lý do: 896 chỗ đã đổi sang token. Viết lại cặp sáng/tối bằng tay nghĩa là quyết
  // định màu bị nhân bản trở lại. Chỉ ban những cặp TRÙNG KHỚP CHÍNH XÁC với token —
  // các biến thể khác (gray-700/200, gray-700/300, gray-900/100) cố ý để tự do, vì
  // gộp chúng vào token là đổi sắc độ chứ không phải đặt tên.
  it('dùng token cho cặp màu sáng/tối đã có tên', () => {
    const MAPPED: Record<string, string> = {
      'text-gray-500 dark:text-gray-400': 'text-fg-muted',
      'text-gray-800 dark:text-gray-100': 'text-fg-primary',
      'text-gray-600 dark:text-gray-300': 'text-fg-secondary',
      'bg-white dark:bg-gray-900': 'bg-surface',
      'bg-gray-100 dark:bg-gray-800': 'bg-surface-sunken',
      'bg-gray-50 dark:bg-gray-950': 'bg-surface-page',
      'border-gray-100 dark:border-gray-800': 'border-border-subtle',
      'border-gray-300 dark:border-gray-700': 'border-border-strong',
      'divide-gray-100 dark:divide-gray-800': 'divide-border-subtle',
      // Đúng y cặp của --fg-warn. Cố ý KHÔNG ban `text-amber-700 dark:text-amber-300`
      // (14 chỗ, nằm trên nền amber-50/amber-900-40): đó là cặp KHÁC, gộp vào token là
      // đổi sắc độ dark từ 300 sang 400 — đổi diện mạo, không phải đặt tên.
      'text-amber-700 dark:text-amber-400': 'text-fg-warn',
    }
    for (const [needle, token] of Object.entries(MAPPED)) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng ${token}.\n${where.join('\n')}`).toBe(0)
      // Cùng cặp nhưng bị chèn class xen giữa (đường lách của phép so chuỗi liền):
      // soi theo DÒNG chứa cả hai vế. Từng có 48 chỗ lách kiểu này.
      const [light, dark] = needle.split(' ')
      const inter = sameLineOccurrences(light, dark)
      expect(
        inter.count,
        `Cặp ${light} + ${dark} bị tách rời trên cùng dòng — vẫn là viết tay cặp màu đã có token ${token}.\n${inter.where.join('\n')}`,
      ).toBe(0)
    }
  })

  // LUẬT NÀY CỐ Ý CHƯA BẬT — đọc lý do trước khi bật.
  //
  // Nhánh fix/toan-bo-audit ban `outline-green-500` và `focus:border-green-500` vì ở ĐÓ,
  // commit bef36fd đã nới vòng focus toàn cục ra phủ cả input/select/textarea. Trên
  // master thì :focus-visible ở index.css chỉ phủ `a, button, [role="button"],
  // [role="switch"], [role="tab"], summary` — KHÔNG có input. Bật ban này mà chưa nới
  // ring thì 57 ô nhập mất sạch chỉ báo tiêu điểm: tệ hơn hẳn một ring 2,3:1.
  //
  // Muốn bật: nới :focus-visible ở index.css ra input/select/textarea TRƯỚC, đo lại
  // tương phản ring bằng cách vẽ ra pixel, rồi mới xoá 57 chỗ tự chế và mở khối này.
  it.skip('không tự chế focus style trượt chuẩn — ring toàn cục đã lo', () => {
    for (const needle of ['outline-green-500', 'focus:border-green-500']) {
      const { count, where } = occurrences(needle)
      expect(count, `${needle} trượt 3:1. Xoá đi — ring token ở index.css tự lấp.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: red-400 trên trắng chỉ 2,89:1 và red-500 chỉ 4,05:1 — cả hai trượt 4,5:1
  // cho chữ ở light mode. Chúng CHỈ hợp lệ sau tiền tố dark:. Đếm bằng hiệu:
  // "text-red-400" đếm cả bản có dark: đứng trước, nên trừ đi là ra số dùng trần.
  it('không dùng red-400/red-500 làm chữ ở light mode', () => {
    for (const shade of ['text-red-400', 'text-red-500']) {
      const bare = occurrences(shade).count - occurrences(`dark:${shade}`).count
      expect(
        bare,
        `${shade} không có dark: đứng trước — trượt AA ở light. Dùng text-money-out hoặc red-700.`,
      ).toBe(0)
    }
  })

  // Lý do: #9ca3af là gray-400 (2,54:1) viết bằng hex — từng lọt vào fill của donut
  // và nét ngân sách vì guardrail cũ chỉ ban dạng stroke="...". Ban ở MỌI dạng.
  it('không còn hex gray-400 ở bất kỳ dạng nào', () => {
    const { count, where } = occurrences('#9ca3af')
    expect(count, `gray-400 hex chỉ 2,54:1. Dùng var(--color-gray-500) trở lên.\n${where.join('\n')}`).toBe(0)
  })

  // Lý do: màu đồ thị đi qua PROP của Recharts, không qua class Tailwind — nên MỌI
  // guardrail đếm class ở trên đều không thấy chúng. Đó là điểm mù thật: trước
  // 2026-07-30 có 21 chỗ đặt chữ nhãn trục bằng hex `#9ca3af` (gray-400) = 2,54:1 trên
  // nền trắng — đúng cái idiom mà test `text-gray-400` phía trên đã ban, chỉ khác là
  // viết bằng hex nên lọt qua. Hex còn KHÔNG lật được theo .dark, mà nhãn trục cần
  // 4,5:1 ở CẢ HAI chế độ và không sắc xám nào đạt cả hai → buộc phải là var(--fg-muted).
  //
  // Chỉ ban dạng object-literal `fill: '#`; KHÔNG ban `fill="#` vì đó là path của logo
  // Google ở LoginPage — màu thương hiệu, cố định là đúng.
  it('chữ trong đồ thị dùng token, không dùng hex', () => {
    const { count, where } = occurrences("fill: '#")
    expect(
      count,
      `Hex không lật được dark mode. Dùng fill: 'var(--fg-muted)'.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Lý do: nét trong đồ thị cần 3:1 (WCAG 1.4.11). Ba hex dưới đây ĐO THẬT là trượt
  // trên nền trắng, nên không được dùng làm nét — kể cả khi trông ổn ở dark mode, vì
  // "trông ổn ở một chế độ" chính là cách chúng lọt vào lần đầu.
  it('không dùng hex trượt 3:1 làm nét trong đồ thị', () => {
    const FAILS: Record<string, string> = {
      '#9ca3af': '2,54:1 (gray-400)',
      '#d1d5db': '1,47:1 (gray-300)',
      '#0ea5e9': '2,77:1 (sky-500)',
    }
    for (const [hex, ratio] of Object.entries(FAILS)) {
      const { count, where } = occurrences(`stroke="${hex}"`)
      expect(
        count,
        `${hex} chỉ ${ratio} trên trắng. Dùng var(--fg-muted) hoặc var(--color-sky-600).\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // Lý do: đã có tên text-2xs (11px) / text-3xs (10px). Giá trị tuỳ ý quay lại là
  // scale lại bị chọc lỗ.
  it('dùng bậc chữ đã đặt tên, không chêm giá trị tuỳ ý', () => {
    for (const [needle, token] of [
      ['text-[0.6875rem]', 'text-2xs'],
      ['text-[0.625rem]', 'text-3xs'],
    ]) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng ${token}.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: 0.5625rem = 9px, mà --app-font-scale nhỏ nhất là 0.9 → 8,1px.
  // Sàn dưới là text-3xs (10px), token cố ý không có tên cho 9px.
  it('không có chữ nhỏ hơn sàn 10px', () => {
    const { count, where } = occurrences('text-[0.5625rem]')
    expect(count, `Dưới sàn đọc được. Dùng text-3xs.\n${where.join('\n')}`).toBe(0)
  })
})

describe('design system — ngưỡng (chỉ được giảm)', () => {
  // Mỗi số dưới đây là ĐỘ NỢ kỹ thuật đo được lúc dựng hệ thống. Gộp vào
  // primitive ở src/components/ui thì hạ số tương ứng.
  const CEILINGS: { needle: string; max: number; use: string }[] = [
    // 93 chứ không 94: <ActionButton> gom dáng nút-có-chữ (viền mảnh / nền xanh),
    // kéo 4 chỗ viết tay ở AccountDetailPage + hai sheet điều chỉnh về một mối.
    //
    // 82 (2026-08-13, đợt gộp danh mục): tụt từ 93 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi nút chỉ còn MỘT bản viết tay thay vì lặp lại ở khu danh mục cũ. Hạ trần theo
    // đúng quy ước ở thông điệp lỗi của chính phép thử này.
    { needle: 'active:scale-95', max: 82, use: '<IconButton> / <ActionButton>' },
    // 28 chứ không 26: lượt sửa vùng chạm 2026-08-11 đưa BA công tắc role="switch"
    // (AssetGroupsPage, DebtPaymentSheet, roleFields) về đúng khuôn ba công tắc đã
    // đúng từ trước — vùng chạm 44×44 ở <button>, đường ray nhỏ ở <span> bên trong.
    // Trước đó đường ray đặt thẳng lên nút nên chạm chỉ 36×20 / 24×44.
    // KHÔNG gộp được vào <IconButton>: nó render một nút-icon, không có đường ray và
    // không mang role="switch"/aria-checked. Đây là tăng đúng chỗ, không phải nợ mới.
    //
    // 22 (2026-08-13, đợt gộp danh mục): tụt từ 28 vì HoldingsSection và
    // FundHoldingsSection bị xoá — vùng chạm viết tay của chúng gom về hai tab của
    // /invest, nơi không còn lặp lại ở khu danh mục cũ. Hạ trần theo đúng quy ước ở
    // thông điệp lỗi của chính phép thử này.
    { needle: 'min-h-11 min-w-11', max: 22, use: '<IconButton> / iconButtonClass()' },
    // 85 chu khong 82: lượt chuẩn hoá đã kéo 29 thẻ TỪ dạng `rounded-xl bg-white …
    // dark:bg-gray-900` VÀO dạng này, nên con số tăng mà tổng số thẻ viết tay không
    // đổi. Không phải thêm thẻ mới. Gộp vào <Card> thì hạ tiếp.
    //
    // 83 (2026-08-11): ba khối tuỳ chọn trong Cài đặt (Giao diện / Cách trình bày / Cỡ
    // chữ) đã gộp về <Card as="section" padding="none">. Phải đổi cả ba cùng lúc —
    // chúng nằm liền nhau nên để lẻ một cái viết tay là cái đó lệch dáng.
    { needle: 'rounded-xl bg-surface', max: 83, use: '<Card>' },
    // 96 (2026-08-13, đợt gộp danh mục): tụt từ 97 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi câu chỉ còn MỘT bản. FundHoldingsSection từng ghi ngay tại chỗ ngưỡng này
    // "đã sát trần" (không thêm tabular-nums viết tay cho số 口 vì gần chạm 97); giờ
    // file đó không còn nên lời ghi đó cũng hết cần thiết. Hạ trần theo đúng quy ước ở
    // thông điệp lỗi của chính phép thử này: trần không hạ là trần rỗng.
    { needle: 'tabular-nums', max: 96, use: '<Money> (tự bật tabular-nums)' },
    // 35 (đo 2026-08-06): cặp xanh nhấn viết tay. Nợ này TĂNG từ 29 lúc dựng hệ thống
    // — quy ước mới chưa thắng thói quen cũ, nên phải có trần. Mỗi chỗ cần XÉT NGHĨA
    // khi gộp: link/hành động → text-fg-accent, giá trị tiền → text-money-in
    // (docs/design-system.md mục "Chưa làm"). Không quét máy móc được.
    // 34 (2026-08-11): hai <Link> "tạo bộ danh mục" ở HealthView đã đổi sang
    // text-fg-accent. Đúng nghĩa — chúng là LINK, không phải giá trị tiền.
    //
    // 32 (2026-08-13, đợt gộp danh mục): tụt từ 34 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi chỗ chỉ còn MỘT bản. Hạ trần theo đúng quy ước ở thông điệp lỗi của chính
    // phép thử này.
    { needle: 'text-green-700 dark:text-green-400', max: 32, use: 'text-fg-accent (link/hành động) hoặc text-money-in (tiền) — xét nghĩa từng chỗ' },
    // Hex xanh/đỏ đời Tailwind v3 trong hằng số biểu đồ — không sai contrast nhưng
    // lệch palette v4 (green-600 v4 = #00a63e). Cũng tăng từ lúc dựng hệ thống (12+
    // file → 16 file). Thay dần khi đụng tới file, đừng thêm chỗ mới.
    { needle: "'#16a34a'", max: 14, use: 'màu palette v4 cho hằng số biểu đồ (vd var(--color-green-700) khi vẽ SVG tay)' },
    { needle: "'#ef4444'", max: 13, use: 'màu palette v4 cho hằng số biểu đồ' },
    // ---- Bốn luật lấy từ nhánh fix/toan-bo-audit (2026-08-11) ----------------------
    //
    // Trần ở đây ĐO TRÊN MASTER, không copy số của nhánh: nhánh đó đã gộp 40+ màn vào
    // bộ primitive riêng của nó nên số của nó thấp hơn nhiều (vd active:scale-95 còn 68
    // so với 93 ở đây). Copy số sang là test đỏ ngay mà chẳng chỉ ra lỗi nào thật.
    //
    // Vẫn đáng thêm dù trần đang cao: việc của ngưỡng là chặn MỌC THÊM, không phải
    // chứng nhận đã sạch.
    //
    // Nút chính viết tay. Token là `bg-accent` (green-700) — dùng qua <ActionButton
    // variant="primary"> thì không bị đếm.
    //
    // 62 (2026-08-13, đợt gộp danh mục): tụt từ 63 vì HoldingsSection và
    // FundHoldingsSection bị xoá — nội dung của chúng gom về hai tab của /invest, nơi
    // mỗi nút chỉ còn MỘT bản. Hạ trần theo đúng quy ước ở thông điệp lỗi của chính
    // phép thử này.
    { needle: 'bg-green-700', max: 62, use: '<ActionButton variant="primary"> hoặc bg-accent' },
    // Hai bán kính ngoài scale 4 tầng (docs §Bán kính). `rounded-2xl` có chủ đích ở thẻ
    // hero và sheet trượt lên; phần còn lại là tuỳ tiện. `rounded-md` thì lạc hẳn.
    // 37 (2026-08-12): sheet khai thu dự kiến của mặt lập kế hoạch. Đúng ngoại lệ ghi
    // ngay trên — sheet trượt lên dùng rounded-t-2xl, và cả app đang thống nhất thế.
    // 38 (2026-08-13): FundTradeFormSheet (ghi/sửa lệnh quỹ Nhật) — cùng khuôn sheet
    // trượt lên với TradeFormSheet, một ngoại lệ hợp lệ khác chứ không phải nợ mới.
    { needle: 'rounded-2xl', max: 38, use: 'rounded-xl (scale chuẩn), trừ thẻ hero / sheet' },
    { needle: 'rounded-md', max: 13, use: 'rounded-lg (scale chuẩn)' },
    // Ngưỡng `<label className` (106) đã BỎ hôm 2026-08-11, không phải vì hết nợ mà vì
    // nó được thay bằng luật thật ở trên ("không có <label> mồ côi") — luật đó phân loại
    // đúng theo spec nên không cần đại diện gần đúng nữa.
  ]

  for (const { needle, max, use } of CEILINGS) {
    it(`\`${needle}\` không vượt ${max} (gộp dần vào ${use})`, () => {
      const { count, where } = occurrences(needle)
      expect(
        count,
        count > max
          ? `Thêm mới ${count - max} chỗ. Dùng ${use} thay vì viết tay.\n${where.join('\n')}`
          : `Đã giảm xuống ${count} — hạ ngưỡng trong file test này xuống ${count}.`,
      ).toBeLessThanOrEqual(max)
    })
  }
})

describe('design system — token phải tồn tại', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')

  it('khai đủ token ngữ nghĩa cho cả hai chế độ', () => {
    const required = [
      '--fg-primary',
      '--fg-secondary',
      '--fg-muted',
      '--fg-on-track',
      '--money-in',
      '--money-out',
      '--fg-warn',
      '--surface',
      '--surface-sunken',
      '--border-subtle',
    ]
    // Mỗi token phải có ở :root VÀ .dark, không thì dark mode rơi về giá trị light.
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'))
    const darkBlock = css.slice(css.indexOf('.dark {'))
    for (const t of required) {
      expect(rootBlock, `${t} thiếu ở :root`).toContain(`${t}:`)
      expect(darkBlock, `${t} thiếu ở .dark`).toContain(`${t}:`)
    }
  })

  it('token ngữ nghĩa được map ra tiện ích Tailwind bằng @theme inline', () => {
    // Thiếu `inline` thì Tailwind copy giá trị lúc build, .dark sẽ không lật màu.
    expect(css).toContain('@theme inline')
    expect(css).toContain('--color-fg-muted: var(--fg-muted)')
    expect(css).toContain('--color-money-in: var(--money-in)')
  })
})

// ============================================================================
// Chế độ trình bày Gọn / Đầy đủ (src/lib/density.ts)
//
// Cả tính năng dựa trên MỘT quy ước: chữ chỉ để dạy thì đi qua <Guide>/<FullOnly>/
// <ExplainBox>, còn lại thì không. Quy ước sống được hay không phụ thuộc việc đoạn chữ
// TIẾP THEO ai viết có nhớ nó — mà repo không có test render nào để bắt. Nên chặn ở
// mức nguồn, đúng cách các luật trên đang làm.
// ============================================================================
describe('chế độ Gọn — chữ để dạy phải đi qua cổng', () => {
  // Khối hướng dẫn nền xanh (`bg-blue-50` + chữ blue-800) là dạng chữ để dạy THUẦN
  // KHIẾT nhất trong app: 5 chỗ, chỗ nào cũng chỉ nói cách dùng màn hình, không mang
  // một con số nào. Đã đổi hết sang <Guide>. Viết lại bằng <p> nghĩa là chế độ Gọn
  // lặng lẽ hở một lỗ, mà nhìn màn hình ở chế độ Đầy đủ thì không thấy gì sai.
  it('khối hướng dẫn nền xanh luôn là <Guide>, không phải <p>', () => {
    const { count, where } = occurrences('<p className="mb-3 rounded-xl bg-blue-50')
    expect(
      count,
      `Khối hướng dẫn phải dùng <Guide> để chế độ Gọn ẩn được.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Ba sắc độ trạng thái (đỏ/vàng/xanh đạt 3:1 cho ĐỒ HOẠ) khai một chỗ ở
  // components/ui/statusColors.ts. Trước đây chúng nằm ở features/health với tên
  // zoneColors và chỉ tab Sức khỏe dùng; chế độ Gọn kéo chúng ra khắp app (chấm trạng
  // thái, chip kết luận, thanh nợ). Viết lại cặp sáng/tối bằng tay ở chỗ khác là mở
  // lại đúng cái bẫy đã ghi ở docs/design-system.md: hai chỗ vẽ cùng một ý nghĩa mà
  // lệch màu. Trừ chính file khai — ở đó cặp màu LÀ nội dung.
  it('không viết lại sắc độ trạng thái bằng tay ngoài statusColors.ts', () => {
    const needles = [
      'bg-red-600 dark:bg-red-400/70',
      'bg-amber-600 dark:bg-amber-500/70',
      'bg-green-700 dark:bg-green-500/70',
    ]
    for (const needle of needles) {
      const where: string[] = []
      let count = 0
      for (const f of FILES) {
        if (f.path.endsWith('statusColors.ts')) continue
        const n = f.text.split(needle).length - 1
        if (n > 0) {
          count += n
          where.push(`${f.path.replace(SRC, '')} (${n})`)
        }
      }
      expect(
        count,
        `Đọc STATUS_FILL từ components/ui thay vì viết lại.\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // VerdictNote ở chế độ Gọn nén câu kết luận thành chip. Không có `short` (hoặc chí
  // ít `label`) thì chip rơi về một từ chung ("Cần chú ý") — vẫn còn màu, nhưng MẤT
  // con số, tức là mất đúng thứ khiến chip đáng nhìn. Đây là hỏng âm thầm: ở chế độ
  // Đầy đủ màn hình vẫn đẹp như thường.
  //
  // Trần là 1 chứ không 0: một chỗ ở HealthScoreCard cố ý không có, vì nó nằm trong
  // <FullOnly> — đồng hồ ngay trên đã hiện cả điểm lẫn chữ Tốt/Cần chú ý/Rủi ro nên ở
  // chế độ Gọn câu đó bị bỏ hẳn, không nén thành chip.
  it('mỗi <VerdictNote> có short (hoặc label) để nén thành chip', () => {
    let count = 0
    const where: string[] = []
    for (const f of FILES) {
      // Cắt từ mỗi thẻ mở tới dấu '>' đầu tiên KHÔNG nằm trong {…}: prop `short` hay
      // là biểu thức nhiều dòng có chứa cả '>' (toán tử so sánh, JSX lồng).
      for (const m of f.text.matchAll(/<VerdictNote\b/g)) {
        let i = m.index + m[0].length
        let depth = 0
        while (i < f.text.length) {
          const c = f.text[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
          i++
        }
        const props = f.text.slice(m.index, i)
        if (!props.includes('short') && !props.includes('label')) {
          count++
          where.push(`${f.path.replace(SRC, '')} (dòng ${f.text.slice(0, m.index).split('\n').length})`)
        }
      }
    }
    expect(
      count,
      count > 1
        ? `Thiếu prop short → chip ở chế độ Gọn mất con số.\n${where.join('\n')}`
        : `Đã xuống ${count} — hạ ngưỡng trong file test này.`,
    ).toBeLessThanOrEqual(1)
  })

  // Trần cho đoạn văn xuôi CHƯA đi qua cổng: <p> mang class chữ phụ (`fg-muted`) mà
  // bên trong là ≥45 ký tự chữ thật (đã bỏ mọi {biểu thức}).
  //
  // Không thể đặt 0: phần lớn số còn lại là thứ PHẢI ở lại — cảnh báo thiếu tỷ giá,
  // dòng số liệu, câu giải thích ô đang bị vô hiệu, trạng thái rỗng không còn đường
  // đi tiếp. Xét từng chỗ mới biết, không quét máy móc được. Trần chỉ để chặn việc
  // thêm văn xuôi mới mà quên bọc <Guide>.
  it('văn xuôi trong <p class="…fg-muted…"> không vượt trần', () => {
    const PROSE = /<p className="([^"]*fg-muted[^"]*)"\s*>([\s\S]*?)<\/p>/g
    // Bỏ: phụ đề dữ liệu (truncate), trạng thái rỗng căn giữa (py-*), nhãn in đậm
    const SKIP = ['truncate', 'py-6', 'py-8', 'py-10', 'font-semibold', 'font-medium']
    let count = 0
    const where: string[] = []
    for (const f of FILES) {
      for (const m of f.text.matchAll(PROSE)) {
        if (SKIP.some((s) => m[1].includes(s))) continue
        const chu = m[2].replace(/\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim()
        if (chu.length < 45) continue
        count++
        where.push(`${f.path.replace(SRC, '')}: ${chu.slice(0, 60)}…`)
      }
    }
    expect(
      count,
      count > PROSE_MAX
        ? `Thêm ${count - PROSE_MAX} đoạn văn xuôi mới. Nếu là chữ để DẠY thì bọc <Guide>; nếu là cảnh báo/dữ liệu thì để nguyên và nâng trần kèm lý do.\n${where.join('\n')}`
        : `Đã xuống ${count} — hạ PROSE_MAX xuống ${count}.`,
    ).toBeLessThanOrEqual(PROSE_MAX)
  })
})
