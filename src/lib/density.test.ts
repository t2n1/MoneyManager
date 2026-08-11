import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DENSITY,
  densityFromProfile,
  getMirroredDensity,
  parseDensity,
  resetDensityCache,
  setMirroredDensity,
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

  it('mặc định là Gọn — phải KHỚP `default \'visual\'` của cột ở migration 0040', () => {
    // Lệch nhau thì người dùng mới thấy app nhảy chế độ ngay khi hồ sơ về.
    expect(DEFAULT_DENSITY).toBe('visual')
  })
})

describe('densityFromProfile', () => {
  it('đọc đúng hai giá trị hợp lệ từ cột hồ sơ', () => {
    expect(densityFromProfile('visual')).toBe('visual')
    expect(densityFromProfile('full')).toBe('full')
  })

  it('THIẾU cột → null, không phải mặc định', () => {
    // Đây là lỗi thật, phát hiện khi chạy app với Supabase thật: cache hồ sơ trên máy
    // được lưu TRƯỚC migration 0040 nên không có cột `density_pref`. Nếu coi
    // undefined là 'visual' thì useDensitySync ghi đè bản sao về Gọn, kể cả khi người
    // dùng đã chọn Đầy đủ ở máy khác — và vì useProfile đặt staleTime: Infinity, nó
    // ép như vậy tới khi cache hết hạn (24h).
    //
    // Đổi `densityFromProfile` về `parseDensity` là test này đỏ.
    expect(densityFromProfile(undefined)).toBeNull()
    expect(densityFromProfile(null)).toBeNull()
  })

  it('giá trị không phải chuỗi cũng là "chưa nói gì"', () => {
    expect(densityFromProfile(0)).toBeNull()
    expect(densityFromProfile(false)).toBeNull()
    expect(densityFromProfile({})).toBeNull()
  })

  it('chuỗi RÁC thì về mặc định — khác hẳn thiếu cột', () => {
    // DB có check in ('visual','full') nên giá trị lạ là bất thường; lúc đó mặc định
    // là ứng xử an toàn. Nhưng "cột chưa tồn tại" thì phải để bản sao ở máy quyết.
    expect(densityFromProfile('compact')).toBe(DEFAULT_DENSITY)
    expect(densityFromProfile('')).toBe(DEFAULT_DENSITY)
  })
})

describe('getMirroredDensity', () => {
  it('đọc bản sao đã lưu ở máy', () => {
    useStorage(fakeStorage({ density: 'full' }))
    expect(getMirroredDensity()).toBe('full')
  })

  it('chưa lưu gì thì ra mặc định', () => {
    useStorage(fakeStorage())
    expect(getMirroredDensity()).toBe('visual')
  })

  it('không có localStorage cũng không nổ (Safari riêng tư)', () => {
    useStorage(undefined)
    expect(getMirroredDensity()).toBe(DEFAULT_DENSITY)
  })

  it('chỉ đọc localStorage MỘT lần rồi nhớ lại', () => {
    const s = fakeStorage({ density: 'full' })
    const spy = vi.spyOn(s, 'getItem')
    useStorage(s)
    getMirroredDensity()
    getMirroredDensity()
    getMirroredDensity()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('setMirroredDensity', () => {
  it('ghi vào localStorage và đổi giá trị đọc ra', () => {
    const s = fakeStorage()
    useStorage(s)
    setMirroredDensity('full')
    expect(s.getItem('density')).toBe('full')
    expect(getMirroredDensity()).toBe('full')
  })

  it('không có localStorage thì vẫn đổi được trong phiên', () => {
    useStorage(undefined)
    setMirroredDensity('full')
    expect(getMirroredDensity()).toBe('full')
  })

  it('gọi mọi người đang nghe', () => {
    useStorage(fakeStorage())
    const a = vi.fn()
    const b = vi.fn()
    subscribeDensity(a)
    const offB = subscribeDensity(b)
    setMirroredDensity('full')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offB()
    setMirroredDensity('visual')
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('TRÙNG giá trị thì không ghi, không gọi ai', () => {
    // Đây là đường đi thật, không phải ca giả: `useDensitySync` bơm giá trị từ hồ sơ mỗi
    // lần query đổi tham chiếu, mà giá trị thường y hệt. Không chặn ở đây thì mỗi lần
    // hồ sơ được refetch là cả cây render lại. Bỏ dòng chặn trong setMirroredDensity là
    // test này đỏ.
    const s = fakeStorage({ density: 'full' })
    useStorage(s)
    expect(getMirroredDensity()).toBe('full')
    const spy = vi.spyOn(s, 'setItem')
    const nghe = vi.fn()
    subscribeDensity(nghe)
    setMirroredDensity('full')
    setMirroredDensity('full')
    expect(spy).not.toHaveBeenCalled()
    expect(nghe).not.toHaveBeenCalled()
    // Đổi thật thì vẫn phải chạy
    setMirroredDensity('visual')
    expect(nghe).toHaveBeenCalledTimes(1)
  })

  it('người nghe ĐĂNG KÝ THÊM trong lượt gọi thì người mới đợi lượt sau', () => {
    // Hình dạng lỗi thật: một component ẩn/hiện vì chính lần đổi này, và cái vừa hiện
    // ra lại đăng ký nghe. Lặp trực tiếp trên Set thì phần tử mới thêm VÀO GIỮA lượt
    // lặp cũng bị đi qua — nếu nó lại đăng ký thêm nữa thì vòng lặp không bao giờ
    // dừng. Bỏ phép chép mảng trong setMirroredDensity là test này đỏ.
    useStorage(fakeStorage())
    const moi = vi.fn()
    subscribeDensity(() => {
      subscribeDensity(moi)
    })
    setMirroredDensity('full')
    expect(moi).not.toHaveBeenCalled()
    // Lượt sau thì người mới mới được gọi (và chỉ một lần, dù người kia đăng ký thêm nữa)
    setMirroredDensity('visual')
    expect(moi).toHaveBeenCalledTimes(1)
  })
})
