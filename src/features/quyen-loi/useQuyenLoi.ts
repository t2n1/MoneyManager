// Gom dữ liệu cho màn Quyền lợi, khung Bản tin và bộ luật thông báo → tinhQuyenLoi().
//
// MỘT truy vấn giao dịch (listBenefitTransactions, OR ba nhánh) cho cửa sổ [year−5, year+1):
// lần gửi tiền (~12/năm), khoản thuế trên phiếu lương (~24/năm), nạp NISA/iDeCo. Hook này
// chạy trong useNotifications ở MỌI màn, nên không được kéo cả năm giao dịch.
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
import { taxCategoryIds } from '../tax/categories'
import { FURUSATO_CATEGORY_NAME } from './furusato'
import { tinhQuyenLoi, type QuyenLoiKetQua } from './quyenLoi'
import { SO_NAM_HOAN_THUE } from './refund'

const EMPTY: never[] = []

export interface UseQuyenLoiResult {
  ketQua: QuyenLoiKetQua | undefined
  /** Mọi query đã thành công → ketQua là số thật, không phải số của dữ liệu nửa chừng. */
  isReady: boolean
  isError: boolean
  furusatoCategoryId: string | null
  /** Giao dịch đã tải cho [year−5, year+1) — trang Quyền lợi lọc lần gửi chưa gán từ đây. */
  txs: TransactionRow[]
}

export function useQuyenLoi(year: number, todayISO: string, enabled = true): UseQuyenLoiResult {
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
    return {
      categoryIds: ids.sort(),
      toAccountIds: accounts.filter((a) => a.tax_shelter != null).map((a) => a.id).sort(),
    }
  }, [categories, accounts])
  const range = useMemo(
    () => ({ start: `${year - SO_NAM_HOAN_THUE}-01-01`, end: `${year + 1}-01-01` }),
    [year],
  )
  const txsQ = useBenefitTransactions(range, filter, enabled && !!profile && categoriesQ.isSuccess && accountsQ.isSuccess)

  const furusatoCategoryId =
    categories.find((c) => c.type === 'expense' && c.name === FURUSATO_CATEGORY_NAME)?.id ?? null

  const isReady =
    !!profile && ratesOk && relativesQ.isSuccess && accountsQ.isSuccess && categoriesQ.isSuccess && txsQ.isSuccess
  const isError = relativesQ.isError || accountsQ.isError || categoriesQ.isError || txsQ.isError

  const ketQua = useMemo(() => {
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
    })
  }, [isReady, profile, year, todayISO, relativesQ.data, txsQ.data, categories, accounts, base, rates])

  return { ketQua, isReady, isError, furusatoCategoryId, txs: txsQ.data ?? EMPTY }
}
