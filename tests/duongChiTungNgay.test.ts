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
  // Hai thẻ là một CẶP THU-PHÓNG: trên mỗi cột một tháng, dưới mỗi điểm một ngày của
  // tháng đang chọn, và cả hai đọc cùng `activeMonthKey` nên bấm một cột ở trên là đường
  // dưới đổi theo. Rời nhau ra thì mối liên hệ đó không còn đọc được từ màn hình.
  it('đứng ngay sau cặp "Dòng tiền 8 tháng" + "Ngân sách"', () => {
    expect(at(trang, '<DailySpendPanel')).toBeGreaterThan(at(trang, '<BudgetPanel'))
  })

  it('đứng TRƯỚC khối "Giao dịch gần đây"', () => {
    expect(at(trang, '<DailySpendPanel')).toBeLessThan(at(trang, 'Giao dịch gần đây'))
  })

  // Nhét vào cặp hai cột (`basis-full xl:basis-0`) thì panel chỉ ~380px ở xl, mà đường
  // này có tới 31 điểm ngày — nhãn trục đè lên nhau.
  it('chiếm hết chiều ngang, không vào cặp hai cột', () => {
    const doan = trang.slice(at(trang, '<DailySpendPanel'), at(trang, '<DailySpendPanel') + 400)
    expect(doan).not.toContain('basis-full xl:basis-0')
  })

  it('đường chỉ vẽ tới hôm nay ở tháng hiện tại', () => {
    expect(trang).toMatch(/cutoffISO=\{dangXemThangNay \?/)
    expect(the).toContain('d.date <= cutoffISO')
  })
})

describe('Chi từng ngày — lề phải của vùng vẽ', () => {
  // Điểm cuối của LineChart nằm ĐÚNG mép phải vùng vẽ và nhãn trục canh giữa theo nó, nên
  // nửa nhãn tràn ra ngoài svg rồi bị cắt. Hai biểu đồ đường ở trang Ngân sách dùng
  // right: 14 vì nhãn của chúng là "8/31"; nhãn ở đây là "31/08" — ĐO trên trình duyệt ra
  // 31px, tức nửa nhãn 16px, và với right: 14 đo được cắt 2px.
  it('right: 18, không quay lại 14', () => {
    expect(the).toMatch(/margin=\{\{[^}]*right:\s*18/)
  })

  // Đo ở 375px: dòng chi tiết ngày đỉnh cần ĐÚNG hai dòng cho ba khoản. `truncate` cắt
  // sau khoản đầu và hai khoản sau mất im lặng — mà đó là phần trả lời "hôm đó có gì".
  it('dòng chi tiết ngày đỉnh xuống dòng, không cắt một dòng', () => {
    expect(the).toContain('line-clamp-2')
    expect(the, 'không quay lại truncate cho dòng chi tiết ngày đỉnh').not.toMatch(
      /className="mt-1 truncate/,
    )
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
