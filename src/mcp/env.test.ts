import { describe, expect, it } from 'vitest'
import { docCauhinh } from './env'

const day = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SO_GAO_USER_ID: 'uuid-user',
  MCP_BEARER_TOKEN: 'a'.repeat(32),
}

describe('docCauhinh', () => {
  it('đủ biến thì trả cấu hình', () => {
    expect(docCauhinh(day)).toEqual({
      supabaseUrl: 'https://x.supabase.co',
      serviceRoleKey: 'service-key',
      userId: 'uuid-user',
      token: 'a'.repeat(32),
    })
  })

  it('thiếu biến nào thì ném lỗi gọi ĐÚNG TÊN biến đó', () => {
    const { SO_GAO_USER_ID: _bo, ...thieu } = day
    expect(() => docCauhinh(thieu)).toThrow(/SO_GAO_USER_ID/)
  })

  it('token ngắn hơn 32 ký tự thì từ chối — nó là toàn bộ hàng rào', () => {
    expect(() => docCauhinh({ ...day, MCP_BEARER_TOKEN: 'ngan' })).toThrow(/32/)
  })

  it('cắt khoảng trắng hai đầu — đặt secret từ PowerShell hay lọt ký tự xuống dòng', () => {
    expect(docCauhinh({ ...day, MCP_BEARER_TOKEN: `${'a'.repeat(32)}\n` }).token).toBe('a'.repeat(32))
  })
})
