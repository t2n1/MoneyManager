import { describe, expect, it } from 'vitest'
import { loadStatus, mergeLoad, pendingText } from './loadStatus'

describe('loadStatus', () => {
  it('có dữ liệu → ready, kể cả khi lượt tải lại sau đó lỗi', () => {
    expect(loadStatus({ data: [], isError: false, isFetching: false })).toBe('ready')
    expect(loadStatus({ data: [1], isError: true, isFetching: false })).toBe('ready')
  })

  it('chưa có dữ liệu, đang tải → pending', () => {
    expect(loadStatus({ data: undefined, isError: false, isFetching: true })).toBe('pending')
  })

  it('chưa có dữ liệu và đã lỗi hẳn → failed', () => {
    expect(loadStatus({ data: undefined, isError: true, isFetching: false })).toBe('failed')
  })

  it('đã lỗi nhưng đang thử lại → pending, để bấm "Thử lại" thấy app đang làm', () => {
    expect(loadStatus({ data: undefined, isError: true, isFetching: true })).toBe('pending')
  })
})

describe('mergeLoad', () => {
  it('rỗng hoặc toàn ready → ready', () => {
    expect(mergeLoad()).toBe('ready')
    expect(mergeLoad('ready', 'ready')).toBe('ready')
  })

  it('có một nguồn còn chờ → pending', () => {
    expect(mergeLoad('ready', 'pending')).toBe('pending')
  })

  it('failed thắng pending — chờ một nguồn đã chết là chờ mãi', () => {
    expect(mergeLoad('pending', 'failed', 'ready')).toBe('failed')
  })
})

describe('pendingText', () => {
  it('chờ thì nói đang tính, lỗi thì nói không tải được — không bao giờ in số', () => {
    expect(pendingText('pending')).toBe('Đang tính…')
    expect(pendingText('failed')).toBe('Chưa tải được')
  })
})
