import type { Dict } from '../index'

// Tên tiếng Anh của tài khoản và nhóm tài sản MẶC ĐỊNH (seed trong supabase/migrations, và nhóm
// app tự tạo). Khoá `acc|<tên trong DB>` / `grp|<tên trong DB>`, tra bằng accountLabel() /
// assetGroupLabel() — xem src/i18n/index.ts.
const d: Dict = {
  // Tài khoản seed của handle_new_user (0001, 0003, 0017, 0025, 0030 — cùng bốn tên).
  'acc|Tiền mặt': 'Cash',
  'acc|Ngân hàng': 'Bank',
  'acc|Đầu tư VN': 'VN investments',
  'acc|Dự trữ USD': 'USD reserve',
  // Tài khoản app tự tạo: nhập phiếu lương (phieu-luong/nhap.ts TK_HUU_MOI).
  'acc|退職金': 'Retirement fund (退職金)',
  // Tài khoản của bản demo (data/demoRepo.ts).
  'acc|Chứng khoán VN': 'VN brokerage',
  'acc|Thẻ Rakuten': 'Rakuten Card',

  // Nhóm seed của 0003_asset_group.
  'grp|Tiêu dùng': 'Spending',
  'grp|Đầu tư': 'Investments',
  'grp|Dự phòng': 'Emergency fund',
  // Nhóm app tự gán: nhập phiếu lương (TK_HUU_MOI.asset_group).
  'grp|Tiết kiệm': 'Savings',
  // Nhóm của bản demo.
  'grp|Tài sản Việt Nam': 'Vietnam assets',
  'grp|Tài sản Nhật': 'Japan assets',
}

export default d
