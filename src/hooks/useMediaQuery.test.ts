import { describe, expect, it, vi } from 'vitest'
import { subscribeMediaQuery, type MediaQueryLike } from './useMediaQuery'

// Repo này KHÔNG có jsdom/happy-dom/@testing-library (kiểm bằng package.json), nên
// `useMediaQuery` (hook thật, dùng `useState`/`useEffect` + `window.matchMedia`) không thể
// render/test ở đây — không có `window` để dựng. `subscribeMediaQuery` là phần THUẦN được
// tách ra đúng để có một biên test được: nó nhận một đối tượng giống `MediaQueryList` (chỉ
// `matches`/`addEventListener`/`removeEventListener`, không cần `lib.dom` thật) và một hàm
// callback — không đụng React, không đụng DOM thật.

/** `MediaQueryList` giả tối thiểu: giữ đúng MỘT listener 'change', đủ để mô phỏng
 *  matchMedia thật (một `useMediaQuery` chỉ đăng ký một listener cho một `mq`). */
function fakeMediaQueryList(initialMatches: boolean): MediaQueryLike & { fireChange(matches: boolean): void } {
  let listener: (() => void) | null = null
  const mq = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: 'change', l: () => void) => {
      listener = l
    }),
    removeEventListener: vi.fn((_type: 'change', l: () => void) => {
      if (listener === l) listener = null
    }),
    fireChange(matches: boolean) {
      mq.matches = matches
      listener?.()
    },
  }
  return mq
}

describe('subscribeMediaQuery', () => {
  it('báo trạng thái hiện tại NGAY, không đợi sự kiện change đầu tiên', () => {
    const mq = fakeMediaQueryList(true)
    const onChange = vi.fn()
    subscribeMediaQuery(mq, onChange)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('báo lại đúng giá trị mới mỗi khi mq đổi (cả true→false lẫn false→true)', () => {
    const mq = fakeMediaQueryList(false)
    const onChange = vi.fn()
    subscribeMediaQuery(mq, onChange)

    mq.fireChange(true)
    mq.fireChange(false)

    expect(onChange.mock.calls.map((c) => c[0])).toEqual([false, true, false])
  })

  it('gắn đúng MỘT listener change vào mq', () => {
    const mq = fakeMediaQueryList(false)
    subscribeMediaQuery(mq, vi.fn())
    expect(mq.addEventListener).toHaveBeenCalledTimes(1)
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('hàm huỷ trả về gỡ ĐÚNG listener đã gắn — sau đó mq đổi không còn gọi onChange nữa', () => {
    const mq = fakeMediaQueryList(false)
    const onChange = vi.fn()
    const unsubscribe = subscribeMediaQuery(mq, onChange)
    const registeredListener = (mq.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1]

    unsubscribe()

    expect(mq.removeEventListener).toHaveBeenCalledWith('change', registeredListener)

    onChange.mockClear()
    mq.fireChange(true) // gọi thẳng listener nội bộ của fake — mô phỏng "đã gỡ nên im"
    expect(onChange).not.toHaveBeenCalled()
  })
})
