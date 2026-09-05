// Canh thẻ "Chi từng ngày" ở trang Bản tin — ba thứ đo được bằng tay mà đọc code không thấy.
//
// Repo không khai test.environment nên không render được component (xem paydayStripMoc.test.ts
// cho cùng chỗ mù đó). Bài này đọc thẳng nguồn.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Bỏ mọi chú thích — chú thích còn nhắc cái lịch cũ là chuyện đúng, chỉ code mới bị canh. */
function boChuThich(nguon: string): string {
  return nguon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const trang = boChuThich(readFileSync(`${ROOT}src/features/bulletin/BulletinPage.tsx`, 'utf8'))
const the = boChuThich(readFileSync(`${ROOT}src/features/bulletin/DailySpendPanel.tsx`, 'utf8'))

/** Vị trí ký tự của mốc trong nguồn; ném nếu không tìm thấy hoặc thấy nhiều hơn một lần. */
function at(nguon: string, moc: string): number {
  const i = nguon.indexOf(moc)
  expect(i, `không tìm thấy mốc "${moc}"`).toBeGreaterThan(-1)
  expect(nguon.indexOf(moc, i + 1), `mốc "${moc}" xuất hiện nhiều hơn một lần`).toBe(-1)
  return i
}

describe('Chi từng ngày — chỗ đứng trong Bản tin', () => {
  // Từ bản vẽ redesign (2026-09-05) hai hình của CẶP THU-PHÓNG nằm chung MỘT thẻ: dải
  // 8 tháng (CashflowStrip) đứng đầu thẻ Chi tiêu, phần ngày ngay dưới, cùng đọc
  // `activeMonthKey` nên bấm một cột tháng là phần ngày đổi theo. Tách chúng ra hai thẻ
  // lại là mất mối liên hệ đó khỏi màn hình.
  it('dải 8 tháng nằm TRONG thẻ, trên phần ngày', () => {
    const strip = at(the, '<CashflowStrip')
    expect(strip).toBeGreaterThan(at(the, '<SectionTitle>Chi tiêu'))
    expect(strip).toBeLessThan(the.indexOf('ref={plotRef}'))
  })

  it('thẻ đứng sau bốn ô KPI và TRƯỚC khối "Giao dịch gần đây"', () => {
    expect(at(trang, '<DailySpendPanel')).toBeGreaterThan(at(trang, '<KpiRow'))
    expect(at(trang, '<DailySpendPanel')).toBeLessThan(at(trang, 'Giao dịch gần đây'))
  })

  // Nhét vào cặp hai cột (`basis-full xl:basis-0`) thì panel chỉ ~380px ở xl, mà đường
  // này có tới 31 điểm ngày — nhãn trục đè lên nhau. Thẻ phải nằm ở CỘT CHÍNH co giãn.
  it('chiếm hết chiều ngang cột chính, không vào cặp hai cột', () => {
    const doan = trang.slice(at(trang, '<DailySpendPanel'), at(trang, '<DailySpendPanel') + 400)
    expect(doan).not.toContain('basis-full xl:basis-0')
  })

  // `cutoffISO` nay là BIẾN ở BulletinPage (chế độ "So năm ngoái" cũng cần nó cho
  // cumulativeCompare) — ràng buộc giữ nguyên: cutoff phải phân biệt tháng hiện tại
  // (hôm nay) với tháng đã qua (ngày cuối tháng), và mọi hình chỉ vẽ tới cutoff.
  it('đường chỉ vẽ tới hôm nay ở tháng hiện tại', () => {
    expect(trang).toMatch(/const cutoffISO = dangXemThangNay \?/)
    expect(the).toContain('d.date <= cutoffISO')
  })
})

// ĐÍNH CHÍNH (B41/B48, 2026-08-23) — hai phép thử cũ ở chỗ này đã bị XOÁ, không phải bị
// nới lỏng, vì cả hai canh những thứ nay không còn tồn tại:
//
//   · `right: 18` canh lề phải của `<LineChart>`. B41 đổi đường thành CỘT: điểm cuối của
//     đường nằm đúng mép phải vùng vẽ nên nửa nhãn trục tràn ra ngoài svg, còn cột thì nằm
//     TRONG dải của nó và nhãn ngày ở dải nhãn bên dưới — không còn lề nào để canh.
//   · `line-clamp-2` canh khối chi tiết ngày đỉnh, một đoạn chữ cho MỘT ngày. B48 thay nó
//     bằng danh sách "ba ngày đáng hỏi" — mỗi ngày một dòng cao 44px, nên không có đoạn
//     nào phải cắt ở hai dòng nữa.
//
// Bên dưới là những thứ THAY chúng: cùng loại ràng buộc (đo được bằng tay, đọc code không
// thấy), cho hình vẽ mới.
describe('Chi từng ngày — cột, không phải đường', () => {
  // Đường nội suy giữa hai ngày, tức vẽ ra một dòng tiền "chảy" từ đỉnh xuống 0 qua mấy
  // ngày sau — nhưng chi mỗi ngày là sự kiện RỜI RẠC.
  it('không còn LineChart, không còn recharts trong thẻ này', () => {
    expect(the, 'B41: cột thay đường').not.toMatch(/LineChart|<Line|ReferenceDot/)
    expect(the, 'vẽ bằng div — cùng lý do CashflowStrip').not.toContain("from 'recharts'")
  })

  // `ReferenceDot` đánh dấu đỉnh là vẽ HAI LẦN cùng một điều: với cột thì cột cao nhất tự
  // là dấu đỉnh (B41.2).
  it('ngày chưa tới là vạch xám, không phải khoảng trắng', () => {
    expect(the, 'B41.1: trắng đọc ra "không tiêu gì", vạch xám đọc ra "chưa tới"').toContain(
      'h-[3px] w-full rounded-[1px] bg-border-strong',
    )
  })

  // Trục để tự chạy tới max thì một khoản cố định là cả biểu đồ chết; bỏ ngày đó khỏi biểu
  // đồ thì tổng của thẻ không còn khớp ô CHI THÁNG ngay trên nó.
  it('cắt trục bằng axisCeiling và NÓI RA cả hai số', () => {
    expect(the).toContain('axisCeiling')
    expect(the, 'B42.3: nhãn phải nói cả mức cắt lẫn số thật của ngày bị cắt').toMatch(
      /cắt ở \{formatCompact\(ceiling, base\)\}/,
    )
    expect(the, 'B42.2: cột bị cắt có vạch chéo, không phải cột phẳng').toContain(
      'repeating-linear-gradient(135deg',
    )
  })

  // `DaySpend.total` có chú thích "có thể ÂM nếu ngày đó hoàn tiền nhiều hơn chi". Bản vẽ
  // đường để nó tụt xuống dưới 0 một cách vô hình; cột mọc lên từ 0 thì nó mất tăm.
  it('ngày hoàn tiền mọc XUỐNG dưới đường 0', () => {
    expect(the, 'B47.2').toContain('rounded-b-[2px] bg-money-in')
    expect(the, 'B48.2: ngày âm luôn có mặt trong "ba ngày đáng hỏi"').toContain(
      'daysWorthAsking',
    )
  })
})

describe('Chi từng ngày — công tắc bỏ khoản cố định', () => {
  // LUẬT CHẶN B46.1. Thẻ này ngồi cùng màn với ô CHI THÁNG; mặc định lọc thì tổng biểu đồ
  // lệch cả trăm nghìn yên so với ô ngay trên mà không dòng nào giải thích.
  it('mặc định là "Tất cả", không phải "Bỏ cố định"', () => {
    expect(the).toMatch(/localStorage\.getItem\(SCOPE_KEY\) === 'flex' \? 'flex' : 'all'/)
  })

  // Không ai được đọc một biểu đồ đã lọc rồi tưởng đó là chi cả tháng (B46.2).
  it('khi BẬT thì tiêu đề nói đang lọc và góc phải in cả hai số', () => {
    expect(the).toContain('đã bỏ khoản cố định')
    expect(the, 'phải in tổng chưa lọc bên cạnh').toContain('amount={fullTotal}')
  })

  // `typical` là TRUNG VỊ, không cộng trừ được — giữ trung vị của tập chưa lọc là so ngày
  // thường của một tập với đường của tập khác (B46.3).
  it('lọc ở nguồn chuỗi, không trừ bớt sau khi tính', () => {
    expect(trang).toMatch(/dailySpendSeries\([\s\S]{0,300}excludeIds,/)
  })
})

describe('Chi từng ngày — dải nhãn', () => {
  // LUẬT CHẶN B44.1: một giao dịch mang được nhiều nhãn, nên tổng các nhãn LỚN HƠN tổng
  // chi. Xếp chồng vào cột là đếm phần giao nhau hai lần — `tags/aggregate.ts` cấm.
  it('nhãn ở dải RIÊNG dưới biểu đồ, không xếp chồng vào cột', () => {
    const dai = boChuThich(readFileSync(`${ROOT}src/features/bulletin/DayTagStrip.tsx`, 'utf8'))
    expect(the, 'dải nhãn là component riêng, không nằm trong vòng lặp cột').toContain(
      '<DayTagStrip',
    )
    expect(at(the, '<DayTagStrip'), 'dải nhãn đứng SAU biểu đồ').toBeGreaterThan(
      the.indexOf('ref={plotRef}'),
    )
    // B44.2: in cả hai số, kèm câu giải thích khoảng lệch.
    expect(dai).toContain('cells.taggedTotal')
    expect(dai).toContain('cells.rowsTotal')
    expect(dai, 'không có câu này thì hai số đọc ra như lỗi tính').toContain(
      'khoản mang',
    )
  })
})

describe('Chi từng ngày — thứ ĐÃ CÂN NHẮC VÀ BỎ', () => {
  // B47 chốt bỏ: thêm nhiễu vào đúng cái thẻ vừa dọn xong, và câu hỏi nhịp tuần đã có nhà
  // ở tab Sức khỏe (`rhythm`). Ghi thành phép thử để lần sau không ai "thêm cho đủ".
  it('không tô nhạt cuối tuần', () => {
    for (const f of ['src/features/bulletin/DailySpendPanel.tsx', 'src/features/bulletin/DayTagStrip.tsx']) {
      const code = boChuThich(readFileSync(`${ROOT}${f}`, 'utf8'))
      expect(code, `${f}: cuối tuần thuộc tab Sức khỏe, không thuộc thẻ này`).not.toMatch(
        /getUTCDay|getDay\(\)|cuoiTuan|weekend/,
      )
    }
  })
})

describe('Lịch chi tiêu ô vuông đã xoá hẳn', () => {
  // Nó vẽ ĐÚNG bộ số của thẻ này. Dựng lại một trong hai cái là app vẽ một bộ số hai lần —
  // đúng thứ mà bản 26a của trang Báo cáo đi dẹp.
  it('không còn file SpendHeatmapCard.tsx', () => {
    expect(existsSync(`${ROOT}src/features/reports/SpendHeatmapCard.tsx`)).toBe(false)
  })

  it('không nguồn nào còn nhắc SpendHeatmapCard hay MonthSpendCalendar', () => {
    for (const f of [
      'src/features/reports/monthPace.tsx',
      'src/features/budgets/BudgetView.tsx',
    ]) {
      const code = boChuThich(readFileSync(`${ROOT}${f}`, 'utf8'))
      expect(code, `${f} còn nhắc lịch ô vuông`).not.toMatch(
        /SpendHeatmapCard|MonthSpendCalendar/,
      )
    }
  })
})
