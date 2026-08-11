import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DENSITY,
  getDensity,
  parseDensity,
  resetDensityCache,
  setDensity,
  subscribeDensity,
} from './density'

// Test chạy ở môi trường node (vite.config.ts không khai jsdom) nên `localStorage`
// không tồn tại — phải tự dựng. Dùng Map thay vì object để không đụng phải prototype
// key (`toString`, `constructor`) nếu sau này ai đó đổi khoá lưu.
function fakeStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage
}

function useStorage(s: Storage | undefined) {
  if (s === undefined) {
    Reflect.deleteProperty(globalThis, 'localStorage')
    return
  }
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true })
}

beforeEach(() => {
  resetDensityCache()
})

afterEach(() => {
  useStorage(undefined)
  resetDensityCache()
})

describe('parseDensity', () => {
  it('nhận đúng hai giá trị hợp lệ', () => {
    expect(parseDensity('visual')).toBe('visual')
    expect(parseDensity('full')).toBe('full')
  })

  it('về mặc định với giá trị rác, chưa lưu, hoặc undefined', () => {
    expect(parseDensity(null)).toBe(DEFAULT_DENSITY)
    expect(parseDensity(undefined)).toBe(DEFAULT_DENSITY)
    expect(parseDensity('')).toBe(DEFAULT_DENSITY)
    expect(parseDensity('VISUAL')).toBe(DEFAULT_DENSITY)
    expect(parseDensity('compact')).toBe(DEFAULT_DENSITY)
  })

  it('mặc định là Gọn — đây là quyết định sản phẩm, không phải giá trị tuỳ ý', () => {
    expect(DEFAULT_DENSITY).toBe('visual')
  })
})

describe('getDensity', () => {
  it('đọc giá trị đã lưu', () => {
    useStorage(fakeStorage({ density: 'full' }))
    expect(getDensity()).toBe('full')
  })

  it('chưa lưu gì thì ra mặc định', () => {
    useStorage(fakeStorage())
    expect(getDensity()).toBe('visual')
  })

  it('không có localStorage cũng không nổ (Safari riêng tư)', () => {
    useStorage(undefined)
    expect(getDensity()).toBe(DEFAULT_DENSITY)
  })

  it('chỉ đọc localStorage MỘT lần rồi nhớ lại', () => {
    const s = fakeStorage({ density: 'full' })
    const spy = vi.spyOn(s, 'getItem')
    useStorage(s)
    getDensity()
    getDensity()
    getDensity()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('setDensity', () => {
  it('ghi vào localStorage và đổi giá trị đọc ra', () => {
    const s = fakeStorage()
    useStorage(s)
    setDensity('full')
    expect(s.getItem('density')).toBe('full')
    expect(getDensity()).toBe('full')
  })

  it('không có localStorage thì vẫn đổi được trong phiên', () => {
    useStorage(undefined)
    setDensity('full')
    expect(getDensity()).toBe('full')
  })

  it('gọi mọi người đang nghe', () => {
    useStorage(fakeStorage())
    const a = vi.fn()
    const b = vi.fn()
    subscribeDensity(a)
    const offB = subscribeDensity(b)
    setDensity('full')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offB()
    setDensity('visual')
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('người nghe ĐĂNG KÝ THÊM trong lượt gọi thì người mới đợi lượt sau', () => {
    // Hình dạng lỗi thật: một component ẩn/hiện vì chính lần đổi này, và cái vừa hiện
    // ra lại đăng ký nghe. Lặp trực tiếp trên Set thì phần tử mới thêm VÀO GIỮA lượt
    // lặp cũng bị đi qua — nếu nó lại đăng ký thêm nữa thì vòng lặp không bao giờ
    // dừng. Bỏ phép chép mảng trong setDensity là test này đỏ (moi → 1 lần gọi).
    useStorage(fakeStorage())
    const moi = vi.fn()
    subscribeDensity(() => {
      subscribeDensity(moi)
    })
    setDensity('full')
    expect(moi).not.toHaveBeenCalled()
    // Lượt sau thì người mới mới được gọi (và chỉ một lần, dù người kia đăng ký thêm nữa)
    setDensity('visual')
    expect(moi).toHaveBeenCalledTimes(1)
  })
})
