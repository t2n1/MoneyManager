# Ngân sách tự cân trong tháng

Ngày 21/09/2026.

## Vấn đề

Ngân sách chốt đầu tháng là một con số đứng yên, còn chi tiêu thì không. Đo trên sổ thật
6 tháng (2026-03…08): đặt mỗi mục đúng trung bình của chính nó rồi soi lại, tổng tháng
vẫn lệch tới **±¥131.372**. Bốc hết khối bất thường ra, phần nền còn lại vẫn lệch
**±¥63.889**. Không có cách đặt trần nào cứu được, vì bản thân chi tiêu dao động chừng đó.

Nhưng phần lớn các tháng đó, chỗ vượt ở mục này có chỗ dư ở mục kia bù được — chỉ là app
không bao giờ nói ra. Người dùng thấy bốn dòng đỏ và kết luận "kế hoạch lại vỡ", trong khi
tổng tháng vẫn an toàn.

## Điều muốn đạt

Trần từng mục **linh hoạt trong tháng** theo dữ liệu thật, với ràng buộc: **tổng ngân sách
không đổi**.

## Quyết định đã chốt

1. **Đề xuất, không tự động.** App tính ra đề nghị, người dùng bấm đồng ý mới ghi. Lý do:
   nếu app tự chuyển thì không bao giờ còn dòng nào đỏ, mà cũng không còn tín hiệu nào
   báo người dùng đang tiêu lệch. Con số chốt đầu tháng phải giữ được tư cách một lời hứa.
2. **Nguồn bù = mục được DỰ BÁO còn dư**, không phải mục "tiêu chậm so với ngày". Lý do:
   khoản dồn một cục (Khách sạn tiêu ¥0 suốt 25 ngày rồi ¥27.000 ngày 26) sẽ bị rút sạch
   trước khi tới lượt nó tiêu.

## Bộ máy

`src/features/budgets/rebalance.ts` — thuần, không React.

Vào: các dòng hạn mức TÍNH VÀO TỔNG (bỏ mốc theo dõi), kèm `amount` gốc, `budgeted` hiệu
lực (đã cộng dồn), `spent`, cờ chi cố định, và chi từng ngày. Ra: **một** đề nghị hoặc `null`.

Mỗi mục gọi `forecastMonthEnd()` của `features/reports/insights.ts` — dùng lại, không viết
bản thứ hai. Truyền `fixedSoFar = spent` cho mục `cost_type: 'fixed'`: khoản cố định trả
một lần mỗi tháng, nội suy theo tốc độ ngày sẽ phình gấp nhiều lần ngay sau hôm trả.

**Hai vế dùng hai cận khác nhau của cùng một khoảng dự báo:**

| Vế | Đo bằng | Vì sao |
| --- | --- | --- |
| Mục sắp vượt | `projected` | ước lượng giữa, không thổi phồng khoản thiếu |
| Mục cho | `budgeted − high` | chỉ coi là dư phần mà kể cả trường hợp xấu nó vẫn không cần |

Lấy cùng một cận cho cả hai thì sẽ có lúc rút của một mục rồi chính mục đó vượt.

## Ngưỡng

- Chỉ chạy **từ ngày 7**. Trước đó nội suy từ vài ngày là số rác.
- Chỉ đề nghị khi thiếu **≥ ¥3.000 VÀ ≥ 10% trần** của mục đó.
- Số chuyển làm tròn **xuống** bội 500 — làm tròn lên có thể vượt phần dư của mục cho.
- Không rút quá `amount` gốc của mục cho, kể cả khi `budgeted` lớn hơn nhờ phần dồn.

## Không có nguồn

Khi không mục nào còn dư, KHÔNG im lặng: trả về đề nghị với `from = null` để UI nói thẳng
*"không có chỗ nào để lấy — tổng tháng này sẽ vượt ¥X"*. Đây là câu app hiện chưa bao giờ
nói, và là câu đáng giá nhất trong cả tính năng.

## Ghi dữ liệu

Hai lệnh upsert: mục cho `amount − X`, rồi mục nhận `amount + X`. **Trừ trước**; nếu lệnh
hai hỏng thì hoàn lại lệnh một rồi báo lỗi — thà không đổi gì còn hơn tổng bị tụt mất X.
Chỉ đổi `amount`, không đụng `rollover`.

Thiếu/dư đo trên `budgeted` (đã gồm dồn) nhưng lệnh ghi đổi `amount` gốc. Mục cho đang bật
dồn thì rút bớt hôm nay cũng làm giảm phần dồn sang tháng sau — câu xác nhận phải nói ra.

## Bấm "Để yên"

localStorage theo `tháng + mục`. Im cho tới khi khoản thiếu tăng thêm 50% so với lúc từ
chối. Không đồng bộ giữa máy — chấp nhận được, đây là chống làm phiền chứ không phải dữ liệu.

## Chỗ hiện

Chỉ **tháng hiện tại**, trong `BudgetView`. Tháng tương lai chưa có chi thật nên không có
gì để cân.

## Test

`rebalance.test.ts`, thuần. Ca bắt buộc: không có nguồn → nói ra, không im; trước ngày 7
và thiếu dưới ngưỡng → `null`; **bất biến: đề nghị cộng lại bằng 0** (giữ tổng không phình);
mục cố định đã trả không bị coi là sắp vượt; không rút quá `amount` gốc.
