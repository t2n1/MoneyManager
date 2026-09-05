# Khảo sát: "Chi chưa ghi sổ" — cơ chế hiện tại

**Ngày:** 2026-09-05 · Giai đoạn: brainstorm, chưa code.

## Đường đi hiện tại của phần hụt

1. Người dùng bấm **Điều chỉnh số dư** ở [ReconcileSheet.tsx](../../../src/features/assets/ReconcileSheet.tsx),
   gõ số dư THỰC TẾ.
2. [reconcilePlan()](../../../src/features/assets/reconcile.ts) tính `diff = target − currentBalance`.
   `diff < 0` → sinh giao dịch **chi**; `diff > 0` → **thu**.
3. Giao dịch bù gắn danh mục tên `'Điều chỉnh số dư'`
   ([ADJUST_CATEGORY_NAME](../../../src/features/categories/flowCategories.ts:27)).

## Chỗ số bị mất

`'Điều chỉnh số dư'` là **danh mục dòng chảy** (`flowCategories`) và có
`CategoryKind = 'transfer'`. Chú thích trong
[database.types.ts:19](../../../src/types/database.types.ts:19) nói thẳng:

> `transfer` = tiền vẫn của mình, chỉ đứng ở chỗ khác. Danh mục transfer KHÔNG vào tổng chi,
> KHÔNG vào tỷ lệ giữ lại, KHÔNG đặt được hạn mức.

Với ví tiền mặt, câu đó **sai**: tiền không "đứng ở chỗ khác", nó đã tiêu mất.
Hệ quả dây chuyền:

- Tổng **Chi** của tháng thiếu đúng bằng phần quên ghi → tháng nào quên nhiều, tháng đó trông rẻ.
- **Ngân sách** ([budgetDisplay.ts:65](../../../src/features/budgets/budgetDisplay.ts:65)) loại luôn
  → còn báo "chưa vượt hạn mức".
- Số dư thì đúng. Nên đây khớp đúng câu đã biết: *tổng Chi là sàn, không phải tổng.*

## Điều đáng mừng

**Không cần đổi schema.** Số đã nằm sẵn trong DB dưới dạng giao dịch chi mang danh mục
`'Điều chỉnh số dư'`. Việc cần làm là *đọc nó ra và gọi đúng tên*, không phải thu thập thêm.

## Phân biệt phải giữ

- Bù trên **ví tiền mặt** (`type = 'cash'`) → gần như chắc chắn là chi quên ghi.
- Bù trên **thẻ tín dụng** mang ghi chú `CARD_RECONCILE_NOTE` → lệch sao kê, KHÔNG phải
  tiền mặt quên ghi. Phải loại khỏi con số này.
- Bù chiều **thu** → hoặc thu quên ghi, hoặc ghi thừa một khoản chi. Không cùng nghĩa.

## Còn phải chốt với người dùng

Cộng thẳng vào tổng Chi, hay để riêng cạnh nó. → đang hỏi.

## Quyết định đã chốt với người dùng (2026-09-05)

1. Người dùng **có đối chiếu đều đặn**, ít nhất mỗi tháng một lần → dữ liệu đã nằm sẵn trong DB.
2. Cách hiện: **cách C** — cộng vào tổng Chi, VÀ thành một dòng riêng `Chưa ghi rõ` trong bảng
   danh mục. Lý do chọn: giữ tính chất "bảng danh mục cộng lại đúng bằng tổng Chi".
3. Ngân sách: **có** ăn vào hạn mức TỔNG, và câu phán phải nói rõ lý do khi chính phần chưa ghi
   là thứ đẩy qua hạn mức.
4. Bù trên **thẻ tín dụng**: loại (nhận ra bằng `CARD_RECONCILE_NOTE`).
5. Chiều **thu**: đối xứng — bù trừ trong tháng, dư ra thì dòng đổi tên `Ghi thừa` và TRỪ vào tổng.

## Bán kính ảnh hưởng (đo bằng tìm chữ, KHÔNG phải GitNexus)

GitNexus trả `impactedCount: 0` cho cả `sumIncomeExpense` lẫn `categoryBreakdown` — **sai**.
Index cũ 5 commit và FTS extension hỏng; chính tool tự cảnh báo `epistemic: lower-bound` và bảo
kiểm lại bằng text search. Số thật:

- `sumIncomeExpense` — 11 file gọi (chưa kể test)
- `categoryBreakdown` — 15 file gọi (chưa kể test)

Trải trên **budgets, notifications, reports, transactions, và `src/mcp/tools/`**.

**Hệ quả kiến trúc:** KHÔNG được sửa hai hàm này. Sửa là đổi lặng lẽ 22 chỗ, gồm cả
`axisTargets`, `useMethodFit`, `rhythmRules`, và MCP server — mà `api/mcp.mjs` là bundle đã
commit, phải chạy `npm run bundle:mcp` lại. Thay vào đó: phần "chưa ghi rõ" là một đầu vào
RIÊNG, chỉ những màn đã chốt mới đọc.
