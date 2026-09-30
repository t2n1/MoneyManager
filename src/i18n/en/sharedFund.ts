import type { Dict } from '../index'

// Quỹ chung hai người (migration 0073): màn /quy-chung, ô góp trong form nhập và form định
// kỳ, phần cài đặt trong "Ghi sổ cùng ai".
const d: Dict = {
  'Quỹ chung': 'Shared fund',
  'Khoản góp quỹ chung trỏ tới phần không có trong file': 'A shared-fund contribution points to a part not in the file',
  'Chỉ chuyển khoản mới góp được vào quỹ chung': 'Only transfers can be shared-fund contributions',
  'Quỹ chung trỏ tới tài khoản không có trong file': 'The shared fund points to an account not in the file',
  'Góp cho phần': 'Contribute to',
  'Rút từ phần': 'Withdraw from',
  'Chưa gán phần': 'No part assigned',
  'Ai góp': 'Who contributes',
  'Tên người kia': 'Partner’s name',
  'Tài khoản quỹ chung': 'Shared fund account',
  'Chưa đặt': 'Not set',
  'Chuyển khoản vào tài khoản này sẽ hỏi thêm “góp cho phần nào” và “ai góp”.':
    'Transfers into this account also ask “which part” and “who contributes”.',
  'Mở Quỹ chung': 'Open shared fund',
  'Góp tháng này': 'Contributed this month',
  'chưa ai góp': 'no contributions yet',
  'Quỹ đã chi': 'Fund spent',
  'Còn trong quỹ': 'Left in fund',
  'luỹ kế tới hết tháng': 'running total to month end',
  'Ai góp bao nhiêu': 'Who contributed what',
  'Từng phần': 'By part',
  'Chưa có khoản góp nào. Ghi một chuyển khoản vào tài khoản quỹ chung và chọn “Góp cho phần”.':
    'No contributions yet. Record a transfer into the shared fund account and pick “Contribute to”.',
  'Góp {sum} (mình {mine} · {partner} {theirs}) · chi {spent}':
    'In {sum} (me {mine} · {partner} {theirs}) · spent {spent}',
  ' · rút {amount}': ' · withdrew {amount}',
  'đang thiếu': 'short',
  'Góp = chuyển khoản vào tài khoản quỹ chung, có chọn phần và người góp. Chi từ quỹ tự vào phần theo danh mục (danh mục con thuộc phần của danh mục cha). “Còn lại” cộng dồn từ tháng đầu tiên: tháng rẻ dư, tháng đắt lấy phần dư bù — góp cố định là vậy.':
    'A contribution is a transfer into the shared fund account, tagged with a part and who paid. Spending from the fund lands in a part by category (a subcategory belongs to its parent’s part). “Left” is a running total from the first month: cheap months build a surplus that expensive months draw on — that is how fixed contributions work.',
  'đang thiếu {amount} — quỹ đang lấy tiền phần khác bù. Góp thêm cho phần này.':
    'short by {amount} — the fund is covering it from other parts. Contribute more to this part.',
  '{name}: nên tăng mức góp': '{name}: raise contributions',
  '3 tháng liền chi nhiều hơn góp. Nên tăng mức góp hằng tháng.':
    'Spending beat contributions 3 months in a row. Raise the monthly contribution.',
  '{name} dư {amount}': '{name} surplus {amount}',
  '3 tháng liền góp dư, đã tích {amount}. Có thể giảm mức góp hoặc chuyển phần dư sang tiết kiệm chung.':
    'Surplus 3 months in a row, {amount} built up. Lower the contribution or move the surplus to shared savings.',
  'Chưa đặt quỹ chung. Vào {link}, chọn “Hai người” rồi chọn tài khoản quỹ chung.':
    'No shared fund yet. Go to {link}, choose “Two people”, then pick the shared fund account.',
  // Công tắc góc nhìn (PerspectiveBar) + dòng phụ ô Chi của Sổ
  'Cả nhà': 'Household',
  'Xem sổ của ai': 'Whose books to view',
  'Góp quỹ chung tính là chi của phần đã góp; chi từ quỹ và khoản “chung” chỉ có ở Cả nhà. Hạn mức ngân sách vẫn là của cả nhà.':
    'Shared-fund contributions count as spending in the part they fund; fund spending and “shared” entries only appear under Household. Budget limits are still the household’s.',
  '+ {amount} góp quỹ chung': '+ {amount} to shared fund',
}

export default d
