import { describe, expect, it } from 'vitest'
import { ageLabel, freshnessSummary, STALE_RATE_DAYS } from './freshness'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe('ageLabel', () => {
  it('dưới một phút → "vừa xong"', () => {
    expect(ageLabel(30_000)).toBe('vừa xong')
  })

  it('theo phút khi dưới một giờ', () => {
    expect(ageLabel(5 * MIN)).toBe('5 phút trước')
  })

  it('theo giờ khi dưới một ngày', () => {
    expect(ageLabel(3 * HOUR)).toBe('3 giờ trước')
  })

  it('đúng một ngày → "hôm qua"', () => {
    expect(ageLabel(DAY)).toBe('hôm qua')
  })

  it('nhiều ngày → đếm ngày', () => {
    expect(ageLabel(5 * DAY)).toBe('5 ngày trước')
  })

  it('mốc ở tương lai (đồng hồ máy lệch) → "vừa xong", không ra số âm', () => {
    expect(ageLabel(-2 * HOUR)).toBe('vừa xong')
  })
})

describe('freshnessSummary', () => {
  const NOW = 1_785_974_400_000 // 2026-08-06T00:00:00Z, mốc cố định
  const TODAY = '2026-08-06'

  const base = {
    ratesFetchedAt: NOW - 3 * HOUR,
    priceSession: '2026-08-06',
    staleSymbolCount: 0,
    lastValuationOn: '2026-08-01',
    nowMs: NOW,
    todayISO: TODAY,
  }

  it('không có nguồn nào → null (không hiện dòng rỗng)', () => {
    expect(
      freshnessSummary({
        ratesFetchedAt: null,
        priceSession: null,
        staleSymbolCount: 0,
        lastValuationOn: null,
        nowMs: NOW,
        todayISO: TODAY,
      }),
    ).toBeNull()
  })

  it('mọi thứ đều mới → tone ok', () => {
    const r = freshnessSummary(base)
    expect(r?.tone).toBe('ok')
    expect(r?.details).toHaveLength(3)
  })

  it('nêu tuổi tỷ giá trong dòng gộp', () => {
    expect(freshnessSummary(base)?.line).toContain('Tỷ giá 3 giờ trước')
  })

  it(`tỷ giá quá ${STALE_RATE_DAYS} ngày → tone warn`, () => {
    const r = freshnessSummary({ ...base, ratesFetchedAt: NOW - 4 * DAY })
    expect(r?.tone).toBe('warn')
    expect(r?.details.find((d) => d.label === 'Tỷ giá')?.tone).toBe('warn')
  })

  it('có mã cổ phiếu kẹt giá cũ → tone warn', () => {
    const r = freshnessSummary({ ...base, staleSymbolCount: 2 })
    expect(r?.tone).toBe('warn')
  })

  it('giá trị tự khai quá 90 ngày → tone warn', () => {
    const r = freshnessSummary({ ...base, lastValuationOn: '2026-01-01' })
    expect(r?.details.find((d) => d.label === 'Giá trị tự khai')?.tone).toBe('warn')
  })

  it('thiếu nguồn nào thì bỏ nguồn đó, không bịa', () => {
    const r = freshnessSummary({ ...base, priceSession: null, lastValuationOn: null })
    expect(r?.details).toHaveLength(1)
    expect(r?.details[0].label).toBe('Tỷ giá')
  })
})
