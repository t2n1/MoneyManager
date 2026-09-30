import { describe, expect, it } from 'vitest'
import type { FundAlert } from '../../sharedFund/sharedFund'
import type { NotificationInput } from '../types'
import { sharedFundRules } from './sharedFundRules'

const input = (alerts?: FundAlert[]) =>
  ({
    categories: [{ id: 'dien', name: 'Điện' }],
    formatMoney: (n: number) => `¥${n}`,
    sharedFund: alerts ? { alerts, currency: 'JPY' } : undefined,
  }) as unknown as NotificationInput

describe('sharedFundRules', () => {
  it('chưa có dữ liệu quỹ → im', () => {
    expect(sharedFundRules(input(undefined))).toEqual([])
  })

  it('phần âm → việc cần làm, số tiền dương, mã không kèm kỳ', () => {
    const [n] = sharedFundRules(input([{ partId: 'dien', kind: 'negative', balance: -600 }]))
    expect(n).toMatchObject({
      key: 'fund-part-short:dien:negative',
      kind: 'action',
      type: 'fund-part-short',
      severity: 'medium',
      title: 'Điện thiếu ¥600',
      to: '/quy-chung',
    })
  })

  it('3 tháng liền thiếu → việc cần làm mức thấp', () => {
    const [n] = sharedFundRules(input([{ partId: 'dien', kind: 'short-streak', balance: 3_000 }]))
    expect(n).toMatchObject({ type: 'fund-part-short', severity: 'low', title: 'Điện: nên tăng mức góp' })
  })

  it('dư kéo dài → tin để biết; dư tăng thêm thì là tin mới (mã kèm số dư)', () => {
    const [a] = sharedFundRules(input([{ partId: 'dien', kind: 'surplus-streak', balance: 25_000 }]))
    const [b] = sharedFundRules(input([{ partId: 'dien', kind: 'surplus-streak', balance: 30_000 }]))
    expect(a).toMatchObject({ kind: 'info', type: 'fund-part-surplus', title: 'Điện dư ¥25000' })
    expect(a.key).not.toBe(b.key)
  })

  it('danh mục đã xoá vẫn ra câu đọc được', () => {
    const [n] = sharedFundRules(input([{ partId: 'mat', kind: 'negative', balance: -1 }]))
    expect(n.title).toBe('Danh mục đã xoá thiếu ¥1')
  })
})
