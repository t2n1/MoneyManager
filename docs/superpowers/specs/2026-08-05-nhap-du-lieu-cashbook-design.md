# Nhập dữ liệu Cashbook (05–07/2026) vào app

Ngày: 2026-08-05

## Mục tiêu

Đưa 194 dòng chi tiêu từ app quản lý tiền khác (Cashbook, file
`CASHBOOK_2026-05-01~2026-08-31.xlsx`) vào Sổ chi tiêu, và xử lý các dòng trùng.

## Bối cảnh

- App thật chạy trên Supabase (`.env.local`), không ghi trực tiếp từ ngoài được.
- Hai đường nhập có sẵn: nhập CSV (`src/features/import/csvImport.ts` — chỉ 3 cột
  ngày/tiền/ghi chú, `category_id: null`) và phục hồi sao lưu JSON
  (`src/data/backupImport.ts` — đủ trường, nhưng `importAll` xóa sạch rồi ghi lại).
- Chọn đường **trộn vào file sao lưu**: giữ đủ ví + danh mục + ghi chú, làm được ngay.
  Không tạo tính năng mới (để dịp khác).

## Đầu vào / đầu ra

- Vào: file xlsx Cashbook + `so-chi-tieu-backup-2026-08-05.json` (version 6, 10.637 giao dịch).
- Ra: một file sao lưu version 6 mới, người dùng nhập qua Cài đặt → Dữ liệu.
- Không tạo ví mới, không tạo danh mục mới, không gắn nhãn.

## Dữ liệu nguồn

194 dòng, **toàn bộ là chi**, toàn bộ **JPY**, từ 2026-05-15 đến 2026-07-14.
7 ví, 29 cặp Category/Subcategory. 21 dòng có ghi chú. Giờ phút bị bỏ
(app chỉ lưu `occurred_on` dạng ngày), nhưng dùng làm `created_at` để giữ thứ tự trong ngày.

## Khớp ví

| Cashbook | App |
|---|---|
| 11. Wallet | Ví (cash JPY) |
| 12. Yucho Bank | Yucho Bank |
| 13. Rakuten Bank | Rakuten Bank |
| 21. Credit Rakuten | Credit Rakuten |
| 22. Credit Paypay | Credit Paypay |
| 31. PayPay Wallet | Paypay Wallet (ewallet) |
| 41. Minh Kome | **bỏ** (1 dòng, 1.480 yên 15/06, Food/Lunch — theo yêu cầu) |

## Khớp danh mục

Chỉ dùng danh mục lá đã có trong app.

| Cashbook | App |
|---|---|
| Food/Breakfast · Lunch · Dinner · Eating out · Beverages · Groceries | Bữa sáng · Bữa trưa · Bữa tối · Ăn ngoài · Cafe · Đi chợ |
| Social Life/Friends · Relationship | Bạn bè · Tình yêu |
| Transport/Subway · Taxi · Car · Luup | Tàu điện · Taxi · Ô tô · Luup |
| Household/Rent · Kitchen · Toiletries · Electricity | Tiền nhà · Đồ bếp · Đồ vệ sinh cá nhân · Điện |
| Hobbies/Plants · Sports · Subscription · Tabaco | Cây cối · Thể thao · Subscription · Thuốc lá |
| Hobbies/**Music** | **Tình yêu** (vé concert đi cùng người yêu — người dùng chỉ định) |
| Health/Hospital · Medicine | Bệnh viện · Thuốc |
| Style/**Clothing và Fashion** · Accessories | **cả hai → Quần áo** · Phụ kiện |
| Education/Exams | Thi cử |
| Culture/Subscriptions | Subscription |
| Gift/Gift · Family support | Quà · Hỗ trợ gia đình |

## Chống trùng

Trùng trong nội bộ file không phải rủi ro chính. Rủi ro chính là **trùng với dữ liệu app
đã có**: app có 42 giao dịch trong khoảng 15/05–14/07, phần lớn nhập từ sao kê thẻ
(ghi chú tên cửa hàng tiếng Nhật). Cashbook là bản nhập tay của cùng những lần chi đó.

Luật dò: **cùng ngày + cùng số tiền**, ưu tiên cùng ví. Ra **15 dòng** khớp.
Đã loại 2 khớp giả (lệch ngày + khác ví + khác bản chất): 350 yên 18/05 và
1.100 yên ở Ví ngày 16/06 & 19/06.

Xử lý: **bỏ dòng Cashbook, giữ dòng app** (giữ tên cửa hàng), và **sửa danh mục dòng app**
khi danh mục app đang mơ hồ (`Khác`) hoặc đang ở danh mục cha; **giữ nguyên** khi
danh mục app đã đúng và cụ thể hơn Cashbook.

| Ngày | Tiền | Ghi chú app | App đang | → | Lý do |
|---|---|---|---|---|---|
| 19/05 | 55.630 | セブンイレブン | Đi chợ | Tình yêu | vé concert, người dùng chỉ định |
| 27/05 | 112.760 | Tiền nhà (Credit EPOS) | Tiền nhà | *giữ* | đã đúng; ví giữ Credit EPOS theo yêu cầu |
| 31/05 | 400 | 楽天SP イマイ | Khác | Tình yêu | app mơ hồ |
| 31/05 | 1.540 | パークス代々木原宿 | Khác | Tình yêu | app mơ hồ |
| 06/06 | 880 | タイムズ駐車場 | Bãi đỗ xe | *giữ* | app cụ thể và đúng bản chất hơn |
| 07/06 | 3.357 | 東京電力 | Điện | *giữ* | đã đúng |
| 11/06 | 830 | ループ | Đi lại (cha) | Luup | cha → lá |
| 13/06 | 1.936 | ポパイカメラ/NFC | Nội thất | **Nhiếp ảnh** | tiệm ảnh — theo bản chất |
| 13/06 | 5.678 | 食品館あおば | Khác | **Đi chợ** | siêu thị — theo bản chất |
| 15/06 | 2.170 | ループ | Đi lại (cha) | Luup | cha → lá |
| 16/06 | 1.100 | SQ*メンウラタ | Khác | Bữa tối | quán mì |
| 17/06 | 593 | セブンイレブン | Đi chợ | Bữa tối | Cashbook ghi bữa tối |
| 25/06 | 3.500 | ホテルゼロ渋谷 | Du lịch (cha) | **Khách sạn** | khách sạn — theo bản chất |
| 27/06 | 112.760 | Tiền nhà (Credit EPOS) | Tiền nhà | *giữ* | như 27/05 |
| 05/07 | 880 | タイムズ駐車場 | Ô tô | *giữ* | app đúng bản chất (đỗ xe), Cashbook ghi theo dịp |

Ba dòng in đậm là chỗ nguyên tắc *danh mục theo bản chất, nhãn theo dịp* mâu thuẫn với
cách Cashbook xếp: tên cửa hàng trong ghi chú app cho biết bản chất, còn Cashbook xếp
theo dịp (đi cùng người yêu). Đã chốt theo **bản chất**.

Nguyên tắc này chỉ áp cho 15 dòng trùng, vì chỉ ở đó mới có tên cửa hàng để đối chiếu.
40 dòng mới xếp vào *Tình yêu* là cách người dùng tự xếp trong Cashbook (Cashbook có
Food/Dinner riêng, nên chọn Relationship là chủ ý) — giữ nguyên.

## Kết quả

194 − 1 (Minh KOME) − 15 (trùng app) = **178 dòng mới**, cộng **10 dòng app được sửa danh mục**.

## Kiểm tra

1. `validateBackupPayload` thật của app (`src/data/backupImport.ts`) phải trả về mảng rỗng.
2. Đối chiếu số: tổng tiền 178 dòng mới, số dòng theo ví, theo danh mục.
3. Mọi trường của giao dịch mới khớp đúng bộ 20 trường của giao dịch đang có.
4. Không dòng nào của app bị mất; chỉ 10 dòng đổi `category_id` + `updated_at`.

## Kết quả kiểm tra (đã chạy)

13/13 đạt, qua bộ `validateBackupPayload` thật (chạy bằng vitest với một file test tạm,
đã xóa sau khi xong). Có kiểm cụ thể từng danh mục đích của 10 dòng được sửa, và kiểm
hai dòng tiền nhà 112.760 vẫn ở Credit EPOS / Tiền nhà, không bị đổi.

Đối chiếu tiền khớp khít:

```
Tổng 194 dòng Cashbook:         735.393 JPY
− Minh KOME (1 dòng):             1.480 JPY
− 15 dòng trùng với app:        304.014 JPY
= Đã nhập (178 dòng):           429.899 JPY
```

Theo ví: Credit Rakuten 118 dòng / 171.939 · Credit Paypay 32 / 169.030 ·
Ví 23 / 43.430 · Rakuten Bank 1 / 22.700 · Yucho Bank 1 / 20.000 ·
Paypay Wallet 3 / 2.800.

Theo tháng: 05/2026 53 dòng / 142.837 · 06/2026 96 / 246.738 · 07/2026 29 / 40.324.

Script trộn: `merge_cashbook.py` (chạy một lần, để trong scratchpad của phiên).
