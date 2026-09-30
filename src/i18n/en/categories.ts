import type { Dict } from '../index'

// Tên tiếng Anh của các danh mục MẶC ĐỊNH (seed trong supabase/migrations, và danh mục app tự
// tạo như Cho vay / Gửi tiền về VN / Thuế & An sinh). Khoá `cat|<tên trong DB>`, tra bằng
// categoryLabel() — xem src/i18n/index.ts. Thêm danh mục mặc định mới thì thêm dòng ở đây.
// Tên có sẵn tiếng Nhật (ふるさと納税 (寄附)) hay tên riêng (Luup, Taxi, Gym, Gas) giữ nguyên.
const d: Dict = {
  // --- Bộ cũ 0001_init (người dùng lâu năm có thể vẫn giữ) ---
  'cat|Mua sắm': 'Shopping',
  'cat|Hóa đơn & tiện ích': 'Bills & utilities',
  'cat|Nhà cửa': 'Home',
  'cat|Giải trí': 'Entertainment',
  'cat|Quà tặng & từ thiện': 'Gifts & charity',

  // --- Nhóm cha Chi (0017 / 0030) ---
  'cat|Nhà ở': 'Housing',
  'cat|Ăn uống': 'Food & dining',
  'cat|Giao tế': 'Social',
  'cat|Đi lại': 'Transport',
  'cat|Thời trang': 'Fashion',
  'cat|Sở thích': 'Hobbies',
  'cat|Sức khỏe': 'Health',
  'cat|Tài chính & Đầu tư': 'Finance & investing',
  'cat|Tài chính': 'Finance',
  'cat|Giáo dục': 'Education',
  'cat|Du lịch': 'Travel',
  'cat|Giấy tờ & Pháp lý': 'Paperwork & legal',
  'cat|Quà tặng': 'Gifts',
  'cat|Khác': 'Other',

  // --- Danh mục con Chi ---
  'cat|Tiền nhà': 'Rent',
  'cat|Nội thất': 'Furniture',
  'cat|Đồ bếp': 'Kitchenware',
  'cat|Đồ vệ sinh cá nhân': 'Toiletries',
  'cat|Điện': 'Electricity',
  'cat|Nước': 'Water',
  'cat|Gas': 'Gas',
  'cat|Điện thoại': 'Phone',
  'cat|Bữa sáng': 'Breakfast',
  'cat|Bữa trưa': 'Lunch',
  'cat|Bữa tối': 'Dinner',
  'cat|Ăn ngoài': 'Eating out',
  'cat|Đồ uống': 'Drinks',
  'cat|Đi chợ': 'Groceries',
  'cat|Bạn bè': 'Friends',
  'cat|Tình cảm': 'Dating',
  'cat|Xe buýt': 'Bus',
  'cat|Tàu điện': 'Train',
  'cat|Taxi': 'Taxi',
  'cat|Ô tô': 'Car',
  'cat|Bãi đỗ xe': 'Parking',
  'cat|Luup': 'Luup',
  'cat|Quần áo': 'Clothing',
  'cat|Giày dép': 'Shoes',
  'cat|Phụ kiện': 'Accessories',
  'cat|Mỹ phẩm': 'Cosmetics',
  'cat|Giặt là': 'Laundry',
  'cat|Cây cối': 'Plants',
  'cat|Nhiếp ảnh': 'Photography',
  'cat|Đăng ký': 'Subscriptions',
  'cat|Thể thao': 'Sports',
  'cat|Gym': 'Gym',
  'cat|Bệnh viện': 'Hospital',
  'cat|Thuốc': 'Medicine',
  'cat|Thuốc lá': 'Tobacco',
  'cat|Thi cử': 'Exams',
  'cat|Học phí': 'Tuition',
  'cat|Sách vở': 'Books & supplies',
  'cat|Vé máy bay': 'Flights',
  'cat|Khách sạn': 'Hotels',
  'cat|Tham quan & ăn chơi': 'Sightseeing & fun',
  'cat|Quà mang về': 'Souvenirs',
  'cat|Visa & lưu trú': 'Visa & residence',
  'cat|Hộ chiếu & lãnh sự': 'Passport & consular',
  'cat|Dịch thuật & công chứng': 'Translation & notary',
  'cat|Quà': 'Presents',
  'cat|Hỗ trợ gia đình': 'Family support',

  // --- Thu ---
  'cat|Lương': 'Salary',
  'cat|Thưởng': 'Bonus',
  'cat|Được tặng': 'Gifts received',
  'cat|Đầu tư': 'Investment income',
  'cat|Bán đồ cũ': 'Secondhand sales',
  'cat|Phụ cấp đi lại': 'Commuting allowance',

  // --- Danh mục app tự tạo (flowCategories.ts, roleSave.ts) ---
  'cat|Cho vay': 'Lending',
  'cat|Đi vay': 'Borrowing',
  'cat|Thu nợ': 'Debt collected',
  'cat|Trả nợ': 'Debt repayment',
  'cat|Điều chỉnh số dư': 'Balance adjustment',
  'cat|Gửi tiền về VN': 'Remittance to VN',

  // --- Thuế & An sinh (tax/categories.ts, phieu-luong/nhap.ts) ---
  'cat|Thuế & An sinh': 'Taxes & social insurance',
  'cat|Thuế thu nhập (所得税)': 'Income tax (所得税)',
  'cat|Thuế cư trú (住民税)': 'Resident tax (住民税)',
  'cat|Bảo hiểm y tế (健康保険)': 'Health insurance (健康保険)',
  'cat|Hưu trí (年金)': 'Pension (年金)',
  'cat|Bảo hiểm việc làm (雇用保険)': 'Employment insurance (雇用保険)',
  'cat|Bảo hiểm điều dưỡng (介護保険)': 'Long-term care insurance (介護保険)',

  // --- Tên danh mục bộ gợi ý nhập CSV tra theo (import/merchantCategory.ts) ---
  'cat|Cơm ngoài': 'Meals out',
  'cat|Ăn vặt & Cafe': 'Snacks & cafe',
  'cat|Đồ dùng trong nhà': 'Household goods',
  'cat|Tàu xe': 'Transit',
  'cat|Thuê xe & đỗ xe': 'Car rental & parking',
  'cat|Dịch vụ & Đăng ký': 'Services & subscriptions',
  'cat|Khóa học & Chứng chỉ': 'Courses & certificates',
  'cat|Quần áo & Giày dép': 'Clothing & shoes',
  'cat|Giải trí & Vé': 'Entertainment & tickets',
  'cat|Cắt tóc': 'Haircut',
}

export default d
