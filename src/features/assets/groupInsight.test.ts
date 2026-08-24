import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { AssetAccount, AssetGroup } from './aggregate'
import { concentrationNote, groupDeltas, investmentScope } from './groupInsight'

function acc(
  id: string,
  name: string,
  currency: CurrencyCode,
  baseValue: number,
  type: AssetAccount['type'] = 'bank',
): AssetAccount {
  return {
    id,
    name,
    type,
    currency,
    balance: baseValue,
    marketValue: null,
    depreciatedBase: null,
    value: baseValue,
    baseValue,
    totalPnlBase: null,
    includeInTotals: true,
    hidden: false,
    sortOrder: 0,
  }
}

function group(name: string, accounts: AssetAccount[]): AssetGroup {
  const total = accounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
  return {
    name,
    total,
    share: 0,
    accounts,
    hasMissingRate: false,
    rawTotal: total,
    nativeTotal: null,
    nativeCurrency: null,
    nativeTotals: [],
    rawHasMissingRate: false,
    includeInTotals: true,
    hidden: false,
  }
}

// ¥1 ≈ 164,37 ₫ → rates.VND = 164.37 với base JPY
const RATES = { VND: 164.37 }

describe('groupDeltas', () => {
  it('quy đổi từng tài khoản rồi mới cộng, và chỉ ra tài khoản lớn nhất', () => {
    const g = group('Đầu tư', [
      acc('a', 'iDragon', 'VND', 0, 'investment'),
      acc('b', 'NISA', 'JPY', 0, 'investment'),
    ])
    const d = groupDeltas({
      groups: [g],
      // iDragon +631.750 ₫ ≈ +¥3.843 · NISA +¥1.000
      deltaById: new Map([
        ['a', 631_750],
        ['b', 1_000],
      ]),
      base: 'JPY',
      rates: RATES,
    }).get('Đầu tư')!
    expect(d.delta).toBe(4_843)
    expect(d.hasMissingRate).toBe(false)
    expect(d.biggest).toEqual({ name: 'iDragon', delta: 3_843 })
  })

  it('thiếu tỷ giá thì LOẠI khoản đó và bật cờ, không coi 1:1', () => {
    const g = group('Đầu tư', [acc('a', 'iDragon', 'VND', 0), acc('b', 'NISA', 'JPY', 0)])
    const d = groupDeltas({
      groups: [g],
      deltaById: new Map([
        ['a', 631_750],
        ['b', 1_000],
      ]),
      base: 'JPY',
      rates: {},
    }).get('Đầu tư')!
    expect(d.delta).toBe(1_000)
    expect(d.hasMissingRate).toBe(true)
  })

  it('nhóm không có Δ nào thì delta là null, không phải 0', () => {
    const d = groupDeltas({
      groups: [group('Ví', [acc('a', 'Ví', 'JPY', 0)])],
      deltaById: new Map(),
      base: 'JPY',
      rates: RATES,
    }).get('Ví')!
    expect(d.delta).toBeNull()
  })
})

describe('concentrationNote', () => {
  const mk = (rows: [string, number, [string, number] | null][]) =>
    new Map(
      rows.map(([name, delta, biggest]) => [
        name,
        {
          delta,
          hasMissingRate: false,
          biggest: biggest ? { name: biggest[0], delta: biggest[1] } : null,
        },
      ]),
    )

  it('chỉ ra nhóm gánh phần lớn, tài khoản lớn nhất, và phần các nhóm khác bù lại', () => {
    const c = concentrationNote(
      mk([
        ['Đầu tư', 3_843, ['iDragon', 3_843]],
        ['Chi tiêu', 53_692, ['Rakuten Bank', 62_502]],
        ['Tiết kiệm', 10_000, ['退職金', 10_000]],
        ['Dự phòng', -273_896, ['Yucho Bank', -273_896]],
      ]),
    )!
    expect(c.groupName).toBe('Dự phòng')
    expect(c.groupDelta).toBe(-273_896)
    expect(c.account).toEqual({ name: 'Yucho Bank', delta: -273_896 })
    expect(c.othersDelta).toBe(67_535)
    expect(c.totalDelta).toBe(-206_361)
  })

  it('dàn đều thì KHÔNG nói tập trung — câu đó sẽ chỉ người đọc đi kiểm sai chỗ', () => {
    expect(
      concentrationNote(
        mk([
          ['A', 100, null],
          ['B', 110, null],
          ['C', 95, null],
        ]),
      ),
    ).toBeNull()
  })

  it('đo trên tổng TUYỆT ĐỐI: hai nhóm triệt tiêu nhau vẫn không phải "tập trung"', () => {
    expect(
      concentrationNote(
        mk([
          ['A', 100_000, null],
          ['B', -100_000, null],
        ]),
      ),
    ).toBeNull()
  })

  it('không có Δ nào thì không có câu nào', () => {
    expect(concentrationNote(new Map())).toBeNull()
  })
})

describe('investmentScope', () => {
  it('nói ra tài khoản đầu tư nằm ngoài nhóm chính, và độ lệch đúng bằng tiền của nó', () => {
    const iDragon = acc('a', 'iDragon', 'VND', 2_132_113, 'investment')
    const nisa = acc('b', 'NISA', 'JPY', 80_436, 'investment')
    const taishoku = acc('c', '退職金', 'JPY', 50_000, 'investment')
    const s = investmentScope({
      investmentAccounts: [iDragon, nisa, taishoku],
      purposeGroups: [
        group('Đầu tư', [iDragon, nisa]),
        group('Tiết kiệm', [taishoku]),
      ],
    })!
    expect(s.mainGroupName).toBe('Đầu tư')
    expect(s.outsiders).toEqual([
      { id: 'c', name: '退職金', groupName: 'Tiết kiệm', baseValue: 50_000 },
    ])
    expect(s.gap).toBe(50_000)
  })

  it('tiền đầu tư rải đều thì KHÔNG nói — không có "nhà chính" để so lệch với', () => {
    // Câu "lệch đúng X với nhóm Y" ngụ ý Y là nhà của tiền đầu tư. Nhóm lớn nhất ở đây
    // chỉ giữ 40%, nên câu đó sẽ chỉ vào một nhóm không phải nhà, và liệt kê 60% danh mục
    // dưới nhãn "ngoại lệ". Sự thật lúc này là một câu khác.
    const a = acc('a', 'A', 'JPY', 400, 'investment')
    const b = acc('b', 'B', 'JPY', 350, 'investment')
    const c = acc('c', 'C', 'JPY', 250, 'investment')
    expect(
      investmentScope({
        investmentAccounts: [a, b, c],
        purposeGroups: [group('G1', [a]), group('G2', [b]), group('G3', [c])],
      }),
    ).toBeNull()
  })

  it('mọi tài khoản đầu tư cùng một nhóm thì không có gì lệch để nói', () => {
    const a = acc('a', 'iDragon', 'VND', 100, 'investment')
    const b = acc('b', 'NISA', 'JPY', 200, 'investment')
    expect(
      investmentScope({
        investmentAccounts: [a, b],
        purposeGroups: [group('Đầu tư', [a, b])],
      }),
    ).toBeNull()
  })
})
