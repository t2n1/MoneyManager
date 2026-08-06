// Bảng loại tiền — MODULE LÁ: cố tình KHÔNG import gì cả.
//
// Vì sao tách khỏi money.ts: money.ts phải gọi isPrivacyEnabled() nên nó kéo theo
// lib/privacy.ts, mà privacy.ts import React và đọc localStorage ngay lúc nạp
// module. Bộ luật thông báo (features/notifications/rules/**) phải chạy được
// nguyên xi trong Supabase Edge Function (mục J của spec), nên không được có bất
// kỳ đường import GIÁ TRỊ nào từ đó tới React/localStorage. aggregate.ts và
// rates.ts chỉ cần CURRENCIES, nên chúng trỏ vào đây thay vì money.ts.
// money.ts vẫn xuất lại hai thứ này để mọi chỗ import cũ không phải sửa.
// Test canh: src/features/notifications/purity.test.ts

export type CurrencyCode = 'JPY' | 'VND' | 'USD'

export const CURRENCIES: Record<
  CurrencyCode,
  {
    symbol: string
    decimals: number
    label: string
    position: 'prefix' | 'suffix'
    /** Dấu phân cách hàng nghìn (JPY dùng ',' theo chuẩn Nhật; VND/USD dùng '.') */
    group: string
    /** Dấu thập phân (chỉ dùng khi decimals > 0) */
    decimal: string
  }
> = {
  JPY: { symbol: '¥', decimals: 0, label: 'Yên Nhật', position: 'prefix', group: ',', decimal: '.' },
  VND: { symbol: '₫', decimals: 0, label: 'Đồng Việt Nam', position: 'suffix', group: '.', decimal: ',' },
  USD: { symbol: '$', decimals: 2, label: 'Đô la Mỹ', position: 'prefix', group: '.', decimal: ',' },
}

/**
 * Chèn dấu phân cách hàng nghìn vào chuỗi CHỮ SỐ (không dấu, không phần thập phân).
 * Ở đây chứ không ở money.ts vì lib/rates.ts cũng cần mà nó bị cấm nhập money.ts
 * (xem features/notifications/purity.test.ts).
 */
export const groupThousands = (digits: string, sep: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
