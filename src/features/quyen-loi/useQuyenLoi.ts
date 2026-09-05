// Gom dữ liệu cho màn Quyền lợi, khung Bản tin và bộ luật thông báo → tinhQuyenLoi().
//
// MỘT truy vấn giao dịch (listBenefitTransactions, OR ba nhánh) cho cửa sổ benefitRange(year,
// namNay): lần gửi tiền (~12/năm), khoản thuế trên phiếu lương (~24/năm), nạp NISA/iDeCo. Hook
// này chạy trong useNotifications ở MỌI màn, nên không được kéo cả năm giao dịch.
//
// `todayISO` truyền vào, không đọc đồng hồ ở đây: useNotifications đã đọc một lần và
// mọi luật phải cùng một "hôm nay" (hai lần đọc có thể rơi hai bên nửa đêm).
import { useMemo } from 'react'
import type { TransactionRow } from '../../types/database.types'
import {
  useAccounts,
  useBenefitTransactions,
  useCategories,
  useProfile,
  useRates,
  useRelatives,
} from '../../hooks/queries'
import { calendarYearOf } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import { taxCategoryIds } from '../tax/categories'
import { FURUSATO_CATEGORY_NAME } from './furusato'
import { IRYOHI_CATEGORY_NAMES } from './iryohi'
import { benefitRange, tinhQuyenLoi, type QuyenLoiKetQua } from './quyenLoi'

const EMPTY: never[] = []

export interface UseQuyenLoiResult {
  ketQua: QuyenLoiKetQua | undefined
  /** Mọi query đã thành công → ketQua là số thật, không phải số của dữ liệu nửa chừng. */
  isReady: boolean
  isError: boolean
  furusatoCategoryId: string | null
  /** Giao dịch đã tải cho benefitRange(year, namNay) — trang Quyền lợi lọc lần gửi chưa gán từ đây. */
  txs: TransactionRow[]
}

export function useQuyenLoi(year: number, todayISO: string, enabled = true): UseQuyenLoiResult {
  // formatMoney đọc trạng thái riêng tư toàn cục (mục J của spec useNotifications) —
  // đăng ký ở đây để bật/tắt riêng tư làm tính lại `ketQua`, không thì tiền trong
  // `viec`/`ly_do` bị "đứng hình" theo giá trị lúc build lần trước.
  const privacyOn = usePrivacyMode()
  const { data: profile } = useProfile()
  const { base, rates, isSuccess: ratesOk } = useRates()
  const relativesQ = useRelatives()
  const accountsQ = useAccounts()
  const categoriesQ = useCategories()
  const accounts = accountsQ.data ?? EMPTY
  const categories = categoriesQ.data ?? EMPTY

  const filter = useMemo(() => {
    const ids = [...taxCategoryIds(categories)]
    const fu = categories.find((c) => c.type === 'expense' && c.name === FURUSATO_CATEGORY_NAME)
    if (fu) ids.push(fu.id)
    // Khoản ⑤ đếm hai danh mục y tế — thiếu khối này thì tinhIryohi chạy trên tập rỗng
    // trong khi màn Quyền lợi vẫn vẽ khối ⑤: hai nơi nói hai câu.
    for (const ten of IRYOHI_CATEGORY_NAMES) {
      const c = categories.find((x) => x.type === 'expense' && x.name === ten)
      if (c) ids.push(c.id)
    }
    return {
      categoryIds: ids.sort(),
      toAccountIds: accounts.filter((a) => a.tax_shelter != null).map((a) => a.id).sort(),
    }
  }, [categories, accounts])
  // Phủ CẢ năm đang xem lẫn cửa sổ 5 năm khoản ② soát từ hôm nay — chọn một năm cũ trên
  // <Select> không được làm rơi mất mấy năm gần đây khỏi khoản ②, và ngược lại.
  const range = useMemo(
    () => benefitRange(year, calendarYearOf(todayISO)),
    [year, todayISO],
  )
  const txsQ = useBenefitTransactions(range, filter, enabled && !!profile && categoriesQ.isSuccess && accountsQ.isSuccess)

  const furusatoCategoryId =
    categories.find((c) => c.type === 'expense' && c.name === FURUSATO_CATEGORY_NAME)?.id ?? null

  const isReady =
    !!profile && ratesOk && relativesQ.isSuccess && accountsQ.isSuccess && categoriesQ.isSuccess && txsQ.isSuccess
  const isError = relativesQ.isError || accountsQ.isError || categoriesQ.isError || txsQ.isError

  const ketQua = useMemo(() => {
    // Nhắc `privacyOn` ngay trong thân memo là CỐ Ý (cùng lý do useNotifications.ts):
    // formatMoney đọc cờ riêng tư từ store NGOÀI React, nên bật/tắt riêng tư không đổi
    // đối số nào bên dưới mà mọi chuỗi tiền trong `viec`/`ly_do` vẫn phải tính lại.
    void privacyOn
    if (!isReady || !profile) return undefined
    return tinhQuyenLoi({
      year,
      todayISO,
      relatives: relativesQ.data ?? EMPTY,
      txs: txsQ.data ?? EMPTY,
      categories,
      accounts,
      base,
      rates: rates ?? {},
      fuyoClaimedYears: profile.fuyo_claimed_years ?? [],
      fmt: (n) => formatMoney(n, 'JPY'),
    })
  }, [isReady, profile, year, todayISO, relativesQ.data, txsQ.data, categories, accounts, base, rates, privacyOn])

  return { ketQua, isReady, isError, furusatoCategoryId, txs: txsQ.data ?? EMPTY }
}
