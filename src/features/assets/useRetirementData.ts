// Dữ liệu cho màn 退職金 (はぐくみ企業年金) — gom sổ, phiếu lương, và hai tham số người dùng
// khai, rồi trả về một object phẳng mà mỗi trường nói rõ nó là số ĐO, số SÀN, hay số ƯỚC.
//
// Xem docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md — luật xuyên suốt
// màn này là mỗi con số phải nói ra nó thuộc loại nào, vì ba loại sai theo ba kiểu khác nhau.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useLifePhases,
  useProfile,
  useRangeTransactions,
} from '../../hooks/queries'
import {
  addMonths,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
} from '../../lib/dates'
import type { AccountRow, KikinSheet } from '../../types/database.types'
import { TEN_TK_HUU } from '../phieu-luong/nhap'
import { benefitAt, SHEET_2025_08, type CalibrationPoint, type KikinBenefit } from '../tax/kikinBenefit'
import { annualPensionLoss } from '../tax/nenkinLoss'
import {
  KIKIN_GIVE_RATE_BPS_2025,
  measureMonthlyContribution,
  projectBalance,
  type BalanceProjection,
  type MonthlyContribution,
} from './balanceAccrual'
import {
  pensionByMonth,
  standardDropSince,
  type MonthPension,
  type StandardDrop,
} from './retirementRows'

/**
 * Bao nhiêu tháng phiếu lương kéo về. 60 tháng vì phiếu của chủ app có từ 12/2021 và
 * 定時決定 chỉ đổi bậc mỗi tháng 9 — muốn thấy "bậc trước khi đóng 掛金" thì phải với tới
 * ít nhất một kỳ 定時決定 trước đó. Không kéo cả bảng: đây là một màn, không phải báo cáo.
 */
const MONTHS_BACK = 60

/** 掛金 tối đa của chế độ (プラン③ trên sheet 基金). Dùng để kẹp ô "thử mức đóng khác". */
export const KIKIN_MAX_MONTHLY = 73_000

export interface RetirementData {
  /** Tài khoản `退職金`; null = chưa có (chưa nhập phiếu lương nào có DB掛金). */
  account: AccountRow | null

  // ── ĐO ────────────────────────────────────────────────────────────────────
  /** Số dư hôm nay (yên). `market_value` nếu có ảnh chụp, không thì số dư sổ. */
  balance: number
  /** Nhịp đóng đo bằng TRUNG VỊ 12 tháng gần nhất. */
  contribution: MonthlyContribution
  /** Từng tháng đã đóng, cũ trước — để vẽ lịch sử. */
  history: { monthKey: string; minor: number }[]
  /** Tháng đầu tiên có khoản đóng; null = chưa có khoản nào. */
  startedMonth: string | null
  /** 標準報酬月額 từng tháng suy từ phiếu lương, cũ trước. */
  pension: MonthPension[]
  /** So bậc trước/sau mốc bắt đầu đóng; null = chưa đủ hai phía để so. */
  standardDrop: StandardDrop | null

  // ── SÀN + ƯỚC ─────────────────────────────────────────────────────────────
  /** Năm chặng CUỐI của trang Tương lai bắt đầu; null = chưa đặt chặng nào. */
  toYear: number | null
  /** Tên chặng đó — in kèm con số để nó không tự phong là "năm nghỉ hưu". */
  phaseLabel: string | null
  /** `minor` là SÀN, `minorAtRate` là ƯỚC. null = không chiếu được. */
  projection: BalanceProjection | null
  /** 給付利率 đang dùng (bps). */
  rateBps: number
  /** true = suất trên là hằng số dựng sẵn (事業年度 2025), người dùng chưa khai. */
  rateIsDefault: boolean

  // ── ƯỚC ───────────────────────────────────────────────────────────────────
  /** Phần lợi ở mức đang đóng; null = không đủ điểm hiệu chuẩn. */
  benefit: KikinBenefit | null
  /** Ba điểm hiệu chuẩn đang dùng, và ngày của sheet. */
  sheet: { dated: string; points: readonly CalibrationPoint[]; isDefault: boolean }
  /** Lương hưu 厚生年金 mất mỗi năm nếu giữ mức tụt bậc hiện tại tới `toYear`. */
  pensionLossAnnual: number
  /** Tính phần lợi ở một mức đóng khác — cho ô "thử mức đóng khác". */
  benefitAtLevel: (monthly: number) => KikinBenefit | null

  // ── CỜ CẢNH BÁO ───────────────────────────────────────────────────────────
  /**
   * Tháng người dùng bước sang 40 (`YYYY-MM`), nếu nó nằm trong khoảng phiếu đang xem.
   * R4 của spec: 介護保険第2号 cộng ~1,62% vào dòng 健康保険料 đúng lúc đó — tiền TĂNG vì
   * một lý do chẳng liên quan tới 掛金, và màn hình phải nói ra kẻo người đọc trừ nhầm.
   */
  turns40In: string | null

  isLoading: boolean
}

export function useRetirementData(): RetirementData {
  const { data: accountRows = [], isLoading: accLoading } = useAccounts()
  const { data: balanceRows = [], isLoading: balLoading } = useAccountBalances()
  const { data: categories = [] } = useCategories()
  const { data: profile } = useProfile()
  const { data: phases = [] } = useLifePhases()

  // Khớp theo TÊN CHÍNH XÁC, không regex — cùng lý do ImportPhieuLuongPage:79 nêu ra:
  // 退職金 là tên tài khoản do chính app tạo, và regex lỏng tay sẽ nhận bừa tài khoản khác.
  const account = useMemo(
    () => accountRows.find((a) => a.name === TEN_TK_HUU && !a.is_archived) ?? null,
    [accountRows],
  )

  const monthStartDay = profile?.month_start_day ?? 1
  const todayISO = toISODate(new Date())
  const thangNay = useMemo(
    () => monthKeyForDate(todayISO, monthStartDay),
    [todayISO, monthStartDay],
  )
  const range = useMemo(
    () => ({
      start: getMonthRange(addMonths(thangNay, -(MONTHS_BACK - 1)), monthStartDay).start,
      end: getMonthRange(thangNay, monthStartDay).end,
    }),
    [thangNay, monthStartDay],
  )
  const { data: txs = [], isLoading: txLoading } = useRangeTransactions(
    range,
    !!account && !!profile,
  )

  const balance = useMemo(() => {
    if (!account) return 0
    const b = balanceRows.find((r) => r.id === account.id)
    return b?.market_value ?? b?.balance ?? 0
  }, [account, balanceRows])

  const tenDanhMuc = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )
  const khoaThang = (iso: string) => monthKeyString(monthKeyForDate(iso, monthStartDay))

  /** Khoản THU vào chính tài khoản 退職金 — `nhap.ts` ghi DB掛金 thành một dòng thu. */
  const dongVao = useMemo(() => {
    if (!account) return []
    return txs
      .filter((t) => t.type === 'income' && t.account_id === account.id)
      .map((t) => ({ monthKey: khoaThang(t.occurred_on), minor: t.amount }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  }, [txs, account, monthStartDay])

  const startedMonth = dongVao[0]?.monthKey ?? null

  /** Nhịp đóng đo trên 12 tháng GẦN NHẤT, không trên cả 60 — mức đóng đổi được. */
  const contribution = useMemo(() => {
    const tu = monthKeyString(addMonths(thangNay, -11))
    return measureMonthlyContribution(dongVao.filter((d) => d.monthKey >= tu))
  }, [dongVao, thangNay])

  const pension = useMemo(
    () =>
      pensionByMonth(
        txs
          .filter((t) => t.type === 'expense')
          .map((t) => ({
            monthKey: khoaThang(t.occurred_on),
            category: (t.category_id && tenDanhMuc.get(t.category_id)) || '',
            amount: t.amount,
          })),
      ),
    [txs, tenDanhMuc, monthStartDay],
  )

  const standardDrop = useMemo(
    () => (startedMonth ? standardDropSince(pension, startedMonth) : null),
    [pension, startedMonth],
  )

  const changCuoi = useMemo(
    () =>
      phases.length === 0
        ? null
        : phases.reduce((a, b) => (b.start_year > a.start_year ? b : a)),
    [phases],
  )

  const rateBps = profile?.kikin_give_rate_bps ?? KIKIN_GIVE_RATE_BPS_2025
  const rateIsDefault = profile?.kikin_give_rate_bps == null

  const projection = useMemo(
    () =>
      changCuoi
        ? projectBalance(balance, contribution, changCuoi.start_year, thangNay, rateBps)
        : null,
    [balance, contribution, changCuoi, thangNay, rateBps],
  )

  const sheet = useMemo(() => {
    const khai: KikinSheet | null = profile?.kikin_sheet ?? null
    if (khai && khai.points.length >= 2) {
      return {
        dated: khai.dated,
        points: khai.points.map((p) => ({
          monthlyContribution: p.m,
          socialInsuranceAnnual: p.si,
          taxAnnual: p.tax,
        })),
        isDefault: false,
      }
    }
    return { dated: '2025-08', points: SHEET_2025_08, isDefault: true }
  }, [profile])

  const benefit = useMemo(
    () => benefitAt(contribution.minorPerMonth, sheet.points),
    [contribution, sheet],
  )

  /**
   * Lương hưu mất: chỉ tính khi ĐÃ tụt bậc thật và bậc đó đo được. Chưa tụt (đang chờ
   * 定時決定) hoặc `unknown` thì 0 — không chiếu một khoản mất chưa xảy ra.
   */
  const pensionLossAnnual = useMemo(() => {
    if (!standardDrop || standardDrop.unknown || standardDrop.drop <= 0) return 0
    if (!projection) return 0
    // Số tháng tham gia = số tháng ĐÃ đóng cho tới nay + số tháng còn đóng tới lúc nghỉ.
    const daDong = dongVao.length
    return annualPensionLoss(standardDrop.drop, daDong + projection.months)
  }, [standardDrop, projection, dongVao])

  /**
   * R4 của spec. `birth_year` chỉ tới NĂM nên không biết tháng sinh — trả về tháng 1 của
   * năm tròn 40 là mốc SỚM NHẤT có thể, đủ để màn hình cảnh báo đúng vùng thời gian.
   */
  const turns40In = useMemo(() => {
    const namSinh = profile?.birth_year
    if (!namSinh) return null
    const nam40 = namSinh + 40
    const tuNam = Number(range.start.slice(0, 4))
    const denNam = Number(range.end.slice(0, 4))
    return nam40 >= tuNam && nam40 <= denNam ? `${nam40}-01` : null
  }, [profile, range])

  return {
    account,
    balance,
    contribution,
    history: dongVao,
    startedMonth,
    pension,
    standardDrop,
    toYear: changCuoi?.start_year ?? null,
    phaseLabel: changCuoi?.label ?? null,
    projection,
    rateBps,
    rateIsDefault,
    benefit,
    sheet,
    pensionLossAnnual,
    benefitAtLevel: (monthly) =>
      benefitAt(Math.min(Math.max(0, monthly), KIKIN_MAX_MONTHLY), sheet.points),
    turns40In,
    isLoading: accLoading || balLoading || txLoading,
  }
}
