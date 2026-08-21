// Mốc đối chiếu: hai tool này KHÔNG phải phần chính của việc nối Claude vào Sổ Gạo — chúng
// phục vụ lại đúng số mà tab Báo cáo và tab Ngân sách đã hiện.
//
// Vì sao vẫn phải có: khi Claude nói "tháng 7 bạn chi ¥310.000" mà tab Báo cáo nói số khác,
// người dùng phải biết được cái nào sai. Một phát hiện không kiểm chứng được về tiền thì tệ
// hơn không có phát hiện. Và phép thử ở parity.test.ts biến lời hứa đó thành cái chốt tự động.
//
// Cả hai gọi lại hàm sẵn có của app, KHÔNG tự tính: sumIncomeExpense và buildBudgetReport.
import { docThang, dungRo, type DuLieu, type PhamVi } from '../basket'
import { tien, type Tien } from '../format'
import { addMonths, monthKeyString } from '../../lib/dates'
import { sumIncomeExpense, type CurrencyOf } from '../../features/reports/aggregate'
import { buildBudgetReport, carryFromPreviousMonth } from '../../features/budgets/progress'

function currencyOfCua(du: DuLieu): CurrencyOf {
  const m = new Map(du.accounts.map((a) => [a.id, a.currency]))
  return (accountId: string) => m.get(accountId) ?? du.base
}

export function baoCaoThang(
  input: { thang: string },
  du: DuLieu,
): {
  thu: Tien; chi: Tien; chuyen: Tien; de_lai: Tien
  thieu_ty_gia: boolean; pham_vi: PhamVi; ghi_chu: string[]
} {
  docThang(input.thang) // kiểm dạng sớm, lỗi nói rõ dạng đúng
  const ro = dungRo(du, { tu_thang: input.thang, den_thang: input.thang })
  const s = sumIncomeExpense(ro.txs, currencyOfCua(du), du.base, ro.rates, ro.transferIds)

  const ghi_chu: string[] = []
  if (s.hasMissingRate) {
    ghi_chu.push(
      'Thiếu tỷ giá cho ít nhất một khoản; khoản đó bị loại khỏi tổng (không quy 1:1), ' +
        'nên các số dưới đây là CHƯA ĐỦ.',
    )
  }
  if (ro.txs.length === 0) {
    ghi_chu.push(
      `Chưa có giao dịch nào trong tháng ${input.thang} ` +
        `(${ro.phamVi.tu_ngay} → ${ro.phamVi.den_ngay}, mốc cuối không tính).`,
    )
  }

  return {
    thu: tien(s.income, du.base),
    chi: tien(s.expense, du.base),
    chuyen: tien(s.transfer, du.base),
    // Ba tầng cộng lại ĐÚNG bằng thu — ràng buộc của khối 01 báo cáo tháng. Có thể ÂM.
    de_lai: tien(s.income - s.expense - s.transfer, du.base),
    thieu_ty_gia: s.hasMissingRate,
    pham_vi: ro.phamVi,
    ghi_chu,
  }
}

export function nganSach(
  input: { thang: string },
  du: DuLieu,
): {
  dong: {
    danh_muc: string; han_muc: Tien; da_tieu: Tien; con_lai: Tien
    vuot: boolean; chi_la_moc_theo_doi: boolean
  }[]
  thieu_ty_gia: boolean; pham_vi: PhamVi; ghi_chu: string[]
} {
  const thangKey = docThang(input.thang)
  const ro = dungRo(du, { tu_thang: input.thang, den_thang: input.thang })
  const tenDanhMuc = new Map(du.categories.map((c) => [c.id, c.name]))
  const chaCua = new Map(du.categories.map((c) => [c.id, c.parent_id]))
  const parentOf = (categoryId: string) => chaCua.get(categoryId) ?? null
  const currencyOf = currencyOfCua(du)

  // `buildBudgetReport` KHÔNG tự lọc tháng — tab Ngân sách lọc trước bằng
  // `useBudgets(monthKey)` (queries.ts:885). `du.budgets` ở đây là CẢ SỔ mọi tháng, nên
  // không lọc là mỗi tháng nhận hạn mức của mọi tháng.
  const budgetsThang = du.budgets.filter((b) => b.month_key === input.thang)

  // Dồn hạn mức (mục AH): làm đúng như hook của app — chỉ đi tìm tháng trước khi tháng này
  // thật sự có hạn mức bật dồn.
  const thangTruoc = monthKeyString(addMonths(thangKey, -1))
  const coDon = budgetsThang.some((b) => b.rollover)
  const roTruoc = coDon ? dungRo(du, { tu_thang: thangTruoc, den_thang: thangTruoc }) : null
  const carry =
    roTruoc === null
      ? new Map<string, number>()
      : carryFromPreviousMonth(
          du.budgets.filter((b) => b.month_key === thangTruoc),
          roTruoc.txs,
          currencyOf,
          du.base,
          roTruoc.rates,
          parentOf,
          roTruoc.transferIds,
        )

  const bc = buildBudgetReport(
    budgetsThang,
    ro.txs,
    currencyOf,
    du.base,
    ro.rates,
    parentOf,
    carry,
    ro.transferIds,
  )

  const ghi_chu: string[] = []
  if (bc.hasMissingRate) {
    ghi_chu.push('Thiếu tỷ giá cho ít nhất một khoản — số đã tiêu là CHƯA ĐỦ.')
  }
  if (coDon) {
    ghi_chu.push(
      `Có hạn mức bật dồn: phần chưa tiêu của tháng ${thangTruoc} đã được cộng vào hạn mức ` +
        'tháng này, đúng như tab Ngân sách trong app.',
    )
  }
  if (bc.lines.length === 0) {
    ghi_chu.push(`Chưa đặt ngân sách nào áp cho tháng ${input.thang}.`)
  }

  return {
    dong: bc.lines.map((l) => ({
      danh_muc: tenDanhMuc.get(l.categoryId) ?? '(danh mục đã xoá)',
      han_muc: tien(l.budgeted, du.base),
      da_tieu: tien(l.spent, du.base),
      con_lai: tien(l.budgeted - l.spent, du.base),
      // Đọc `status` của app, KHÔNG tự so `spent > budgeted`: ngưỡng vượt là luật của app
      // (statusOf trong progress.ts), và hai ngưỡng khác nhau là một cái bug im lặng.
      vuot: l.status === 'over',
      // Dòng "mốc theo dõi" là con của một nhóm đã có trần cha — hạn mức của nó KHÔNG phải
      // một trần thật. Không nói ra thì Claude sẽ đọc nó như trần và cộng trùng vào tổng.
      chi_la_moc_theo_doi: l.isMarker,
    })),
    thieu_ty_gia: bc.hasMissingRate,
    pham_vi: ro.phamVi,
    ghi_chu,
  }
}
