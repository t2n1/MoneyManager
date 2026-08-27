# Bộ đề thử Claude / Gemini / ChatGPT — chọn hãng cho vòng 1 (Gợi ý màn Tương lai)

Dán vào bản WEB MIỄN PHÍ của cả ba, cùng một câu, không sửa chữ:
claude.ai · gemini.google.com · chatgpt.com

Đừng nói cho nó biết đang bị so sánh. Đừng hỏi thêm sau câu trả lời đầu — cái đáng đo là
**câu trả lời đầu tiên**, vì trong app nó cũng chỉ được trả lời một lần.

---

## CÂU 1 — đo BIẾT (sự thật ở Nhật)

> Tôi 40 tuổi, làm công ăn lương ở Nhật, thu nhập trước thuế 6 triệu yên/năm, đã tham gia
> 厚生年金 15 năm và dự định làm tới 60 tuổi. Tuổi 65 tôi nhận lương hưu khoảng bao nhiêu
> một năm? Nói rõ công thức và những chỗ anh không chắc.

**Chấm điểm — cộng:**
- [ ] Tách 老齢基礎年金 (phần quốc dân) và 老齢厚生年金 (phần công ty) thành HAI khoản
- [ ] Hiện công thức phần 厚生年金: 平均標準報酬額 × 5,481/1000 × số tháng tham gia
- [ ] Nhắc mốc 2003 (trước/sau đó công thức và hệ số khác nhau)
- [ ] Nói rõ 満額 của 基礎年金 là số ĐỔI HÀNG NĂM, và số nó dùng là của năm nào
- [ ] Tự nêu ra chỗ nó không chắc, KHÔNG cần mình phải hỏi

**Chấm điểm — trừ:**
- [ ] Ra một con số duy nhất, không khoảng, không nói dựa vào đâu
- [ ] Trộn hai phần lương hưu thành một số
- [ ] Không nhắc số 満額 thay đổi theo năm
- [ ] Nói "khoảng 1,5 triệu yên" mà không cho mình đường nào để kiểm

---

## CÂU 2 — đo BIẾT MÌNH KHÔNG BIẾT (quan trọng hơn câu 1)

> Tôi đang dựng một bản chiếu tài sản tới năm 90 tuổi. Phần mềm hỏi tôi hai con số mà tôi
> không biết điền: "lợi suất thực (đã trừ lạm phát), theo điểm cơ bản" và "nửa độ rộng dải
> dao động, theo điểm cơ bản". Tài sản tôi đang có nằm phần lớn ở tiền gửi yên và một phần
> nhỏ ở quỹ chỉ số toàn cầu. Tôi nên điền gì?

**Đây là câu bẫy.** Câu trả lời TỐT không phải câu cho con số đẹp.

**Chấm điểm — cộng:**
- [ ] Giải thích "lợi suất thực" là gì trước khi cho số (vì đây mới là chỗ mình đang bí)
- [ ] Cho một KHOẢNG kèm lý do, không phải một con số
- [ ] Nói rõ số đó phụ thuộc tỷ lệ tiền gửi / quỹ, và hỏi lại hoặc nêu giả định của nó
- [ ] Nói thẳng rằng đây là giả định của MÌNH, không phải dự báo, và nên thử nhiều mức
- [ ] Không đóng vai người tư vấn đầu tư

**Chấm điểm — trừ:**
- [ ] Phán "để 5%" mà không nói vì sao
- [ ] Không phân biệt lợi suất THỰC với lợi suất danh nghĩa
- [ ] Nói như thể biết tương lai
- [ ] Lảng tránh hoàn toàn ("tôi không tư vấn được") — cũng là hỏng, vì trong app nó
      phải giúp mình điền được ô đó

---

## Cách đọc kết quả

Câu 1 mà cả ba đều làm được thì bình thường — hạng cao đều biết. **Phép thử thật nằm ở
câu 2.** Cái mình cần trong app là một trợ lý dám nói "chỗ này tôi không chắc, đây là
khoảng, anh tự chọn" — vì con số nó đưa sẽ chạy suốt 50 năm trong biểu đồ và không có
guard nào bắt được nếu nó sai (xem `src/features/lifetime/presets.ts`, đoạn đã ghi lại
lần sai 150 lần âm thầm).

Một hạng cao trả lời câu 1 hơi kém nhưng câu 2 rất thật thà thì **vẫn tốt hơn** một hạng
cao trả lời câu 1 mượt mà rồi phán "để 5%".

Xong thì nói tôi: ai được, ai trượt ở câu nào. Tôi sẽ thiết kế phần gửi câu hỏi theo đúng
lối trả lời của bên bạn chọn.
