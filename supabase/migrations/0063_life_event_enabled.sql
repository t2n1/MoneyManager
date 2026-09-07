-- Tắt tạm một mốc cuộc đời mà KHÔNG xoá nó.
--
-- Vì sao cần một cột chứ không phải một trạng thái tạm trong bộ nhớ: câu hỏi "kế hoạch
-- này ra sao nếu bỏ mốc mua nhà" là câu người ta hỏi đi hỏi lại qua nhiều lần mở app,
-- không phải một cú vặn thử rồi thôi. Giữ trong bộ nhớ thì mở lại là mất, và lúc bấm
-- "Lưu thay đổi" thì không có câu trả lời nào đúng cho "mốc đang tắt thì ghi thế nào".
--
-- Cách duy nhất trước đây để trả lời câu đó là XOÁ mốc rồi nhập lại — tức là mất số
-- người dùng đã khai, và không so được hai bên cạnh nhau.
--
-- Mặc định TRUE: mọi mốc đang có vẫn tính vào phép chiếu y như trước.
alter table public.life_events
  add column if not exists enabled boolean not null default true;

comment on column public.life_events.enabled is
  'false = tắt tạm, KHÔNG tính vào phép chiếu nhưng vẫn giữ nguyên số liệu. Mặc định true.';
