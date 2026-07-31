# Nạp & đối chiếu dữ liệu Zaim

Hai script, hai việc khác nhau:

| Script | Việc |
|---|---|
| `run.mjs` | Đọc CSV Zaim + backup app → xuất backup mới có thêm giao dịch Zaim (để bấm **Khôi phục**) |
| `audit.mjs` | Đọc CSV Zaim + backup app **hiện tại** → trả lời "app có ĐỦ chưa" và "có gán NHẦM NHÓM không" |

Thiết kế: [`docs/superpowers/specs/2026-07-31-zaim-import-design.md`](../../docs/superpowers/specs/2026-07-31-zaim-import-design.md)

## Kiểm tra lại đợt nạp đã rồi (việc cần làm trước)

> **Phải deploy bản có sửa phân trang trước khi xuất backup.** Supabase cắt mỗi request ở
> **1.000 dòng** (mặc định, xem Dashboard → Settings → API → Max rows) và cắt **im lặng**.
> `exportAll` trước đây gọi `.select('*')` trần, nên với sổ ~14.000 giao dịch thì file
> "Xuất dữ liệu" **chỉ chứa 1.000 giao dịch**. Xuất bằng bản cũ rồi chạy audit sẽ ra
> "thiếu 13.000 dòng" — đó là ảo, do bản xuất bị cắt, không phải app mất dữ liệu.
>
> Nguy hơn: **Khôi phục ghi đè toàn bộ.** Nạp lại từ một file bị cắt như vậy là xoá thật
> phần còn lại. Đã sửa ở `src/data/paging.ts` (đọc hết bằng `.range()`), nhưng chỉ có tác
> dụng sau khi bản mới lên Vercel.

1. Trong app (bản đã có sửa trên): **Cài đặt → Dữ liệu → Sao lưu → Xuất dữ liệu**. Được file
   `so-chi-tieu-backup-<ngày>.json`. Đây là ảnh chụp những gì **thật sự** đang nằm trong app
   — khác với file `-them-zaim.json` mà `run.mjs` tạo ra (file đó chỉ là thứ *đáng lẽ* phải vào).
   Mở file, đếm nhanh số phần tử trong `transactions`: nếu đúng 1.000 thì bản đang chạy vẫn
   là bản cũ, đừng dùng file đó để đối chiếu và **tuyệt đối đừng Khôi phục từ nó**.
2. Chạy:

```bash
node scripts/zaim-import/audit.mjs "<đường-dẫn>/Zaim.20260731114811-UTF-08.csv" "<đường-dẫn>/so-chi-tieu-backup-<ngày>.json"
```

Báo cáo in ra màn hình và lưu cạnh file backup thành `zaim-audit-report.txt`.

### Đọc kết luận

Khối **KẾT LUẬN** ở đầu trả lời gọn cả hai câu hỏi:

- `✓ ĐỦ` / `✗ THIẾU n` — so từng giao dịch theo khóa `ngày | ±tiền | tài khoản | ghi chú`,
  **đếm theo bội** (hai bữa trưa 500¥ cùng ngày là hai giao dịch, thiếu một cái vẫn báo thiếu).
- `Không nạp THEO THIẾT KẾ` — số dòng cố ý bỏ (chuyển khoản/điều chỉnh số dư của Zaim,
  tiền 0, và các danh mục đã chốt bỏ: `会社交通費`, nạp ví điện tử, `証券`…). Phần A liệt kê
  đủ để bạn kiểm lại có đồng ý hay không.
- `⚠ MẤT NGOÀI Ý MUỐN` — **con số này lẽ ra phải là 0.** Khác 0 nghĩa là script không đọc
  được dòng đó (tiền không ra số, ngày sai dạng, lệch cột, tiền tệ khác JPY), kèm ví dụ để
  tra ngược trong CSV.
- Danh sách cặp danh mục cần soát lại → phần C.

Phần B liệt kê **tháng nào hụt bao nhiêu dòng / bao nhiêu tiền** và 20 dòng thiếu đầu tiên,
nên chỗ mất là chỗ nhìn thấy được, không phải một con số tổng.

### Nếu thiếu

Chạy lại `run.mjs` với backup **mới xuất** (không phải backup cũ) rồi Khôi phục lại. Khóa
chống trùng lo phần đã có, nên không nhân đôi. Nếu vẫn thiếu đúng những dòng đó thì lỗi nằm
ở bảng nối (thiếu tài khoản/danh mục app mà bảng cần) — báo cáo có in ra ở khối KẾT LUẬN.

## Ba chỗ trong bảng nối tôi nghĩ nên xem lại

Đều là **quyết định đã chốt**, nên tôi không tự đổi. Chạy audit xong sẽ thấy số dòng thật của
từng chỗ để quyết:

1. **`エンタメ>音楽` và `エンタメ>映画・動画` → `Sở thích>Subscription`.** Vé xem phim lẻ và
   album mua rời không phải thuê bao. Gộp vào đây làm thẻ "Tổng thuê bao" ở tab Thấu hiểu
   đếm vượt lên. Nếu phần lớn là Netflix/Spotify thật thì giữ; nếu lẫn nhiều mua lẻ thì nên
   tách sang `Sở thích` (nhóm cha) hoặc một danh mục riêng.
2. **`通信._default` và `日用雑貨._default` → `Khác`.** Mọi chi tiết chưa khai riêng của hai
   nhóm này rơi hết vào "Khác" — mất phân loại. `通信` gần như chắc chắn nên về
   `Nhà ở>Điện thoại`; `日用雑貨` nên về cùng chỗ với `Household Supplies`.
3. **Ví không nối được đổ hết vào `Paypay Wallet`.** Gồm cả `-` (~2.352 dòng), `SMBC`,
   `Vãng lai` và các ví tên người (`Minh Kome`, `Chi`, `Nợ`, `Ví VN`…). Phần D của báo cáo
   đếm chính xác bao nhiêu dòng và bao nhiêu tiền bị dồn vào đó. Nếu con số lớn thì lịch sử
   của Paypay Wallet là hỗn hợp nhiều ví khác nhau — nên tạo thêm tài khoản rồi nối lại.

## Số dư tài khoản sau khi nạp

Số dư app = `initial_balance` + tổng giao dịch. Nạp 9 năm lịch sử là cộng thêm một khoản
ròng lớn mà `initial_balance` không hề biết → **số dư hiện tại sai đúng bằng khoản đó**.
Phần E của báo cáo in ra con số theo từng tài khoản. Sửa bằng: mở từng tài khoản →
**Điều chỉnh số dư** về số thực tế (app tự tạo giao dịch bù, không tính vào thống kê).

## Chạy test

```bash
npx vitest run scripts/zaim-import
```

`transform.mjs` và `audit-lib.mjs` là hàm thuần và là chỗ đặt toàn bộ luật; `run.mjs` /
`audit.mjs` chỉ đọc-ghi file và in báo cáo.
