-- Mốc cuộc đời: hình dạng con số, nhịp lặp, và icon.
--
-- Trước migration này mọi mốc chỉ nói được một câu: "số này, MỖI NĂM, đều tăm tắp từ
-- năm đầu tới năm cuối". Bốn thứ người ta thật sự muốn khai đều không nói được:
--
--   * "Cưới tốn ¥3.000.000" kéo 2029–2030 → bản chiếu trừ ¥6M. Cái bẫy này bắt được
--     trên app 2026-09-02; `src/features/lifetime/eventSpan.ts` sinh ra để CẢNH BÁO
--     nó, vì lúc đó không có cách nào khai cho đúng.
--   * "Đổi xe mỗi 8 năm" → phải tạo 5 mốc rời, và sửa số là sửa cả 5.
--   * "Học phí tăng nhanh hơn giá chung" → chỉ có bật/tắt lạm phát, không có mức riêng.
--   * "Nuôi con 22 năm" → tốn ít lúc bé, vọt lúc đại học; một số phẳng sai cả hai đầu.
--
-- VÌ SAO MỘT CỘT ENUM chứ không ba cờ boolean: `total`, `ramp`, `growth` trả lời CÙNG
-- một câu hỏi ("con số biến thiên thế nào dọc khoảng"). Ba cờ độc lập cho 8 tổ hợp mà
-- 5 trong số đó vô nghĩa, và mỗi tổ hợp vô nghĩa là một chỗ để luật ưu tiên ngầm quyết
-- định hộ người dùng. Một enum thì bốn ca, ca nào cũng đọc ra được một câu tiếng Việt.
--
-- `repeat_every_years` thì TRỰC GIAO thật (chọn NĂM NÀO, không nói BAO NHIÊU) nên nó
-- là cột riêng, ghép được với cả bốn hình.
--
-- MẶC ĐỊNH GIỮ NGUYÊN HÀNH VI CŨ: 'per_year' + growth 0 + repeat null + end null cho
-- ra đúng con số mà bản chiếu hôm nay đang tính. Không dòng nào đang có đổi số.
alter table public.life_events
  add column if not exists amount_shape text not null default 'per_year',
  add column if not exists end_amount_minor bigint,
  add column if not exists growth_bps integer not null default 0,
  add column if not exists repeat_every_years integer,
  add column if not exists icon text not null default '';

-- Ràng buộc đặt rời từng câu với `if not exists` gián tiếp: `add constraint` không có
-- `if not exists` trong Postgres, nên bọc vào DO để chạy lại migration không nổ.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'life_events_amount_shape_check'
  ) then
    alter table public.life_events
      add constraint life_events_amount_shape_check
      check (amount_shape in ('per_year', 'total', 'ramp', 'growth'));
  end if;

  -- Trần 100 năm: nhịp lặp dài hơn cả một đời người thì mốc chỉ rơi đúng một lần, tức
  -- người dùng gõ sai chứ không phải có ý đó. 0 và số âm thì vòng năm sẽ chia cho 0
  -- hoặc lùi vô hạn.
  if not exists (
    select 1 from pg_constraint where conname = 'life_events_repeat_check'
  ) then
    alter table public.life_events
      add constraint life_events_repeat_check
      check (repeat_every_years is null or repeat_every_years between 1 and 100);
  end if;

  -- Cùng luật với `amount_minor >= 0` của migration 0031: dấu âm/dương do `kind` mang,
  -- không do số mang. Một `end_amount_minor` âm sẽ làm đoạn nội suy đi qua 0 rồi đổi
  -- dấu giữa khoảng — tức một mốc "Chi" biến thành Thu ở nửa sau mà không có gì nói ra.
  if not exists (
    select 1 from pg_constraint where conname = 'life_events_end_amount_check'
  ) then
    alter table public.life_events
      add constraint life_events_end_amount_check
      check (end_amount_minor is null or end_amount_minor >= 0);
  end if;
end $$;

comment on column public.life_events.amount_shape is
  'Con số biến thiên thế nào dọc [start_year, end_year]: per_year = số này mỗi năm (mặc định, hành vi trước 0066); total = số này là TỔNG cả khoảng, chia đều theo lần rơi; ramp = đổi dần từ amount_minor tới end_amount_minor, nội suy theo NĂM; growth = nhân dồn growth_bps mỗi năm. Luật đầy đủ ở src/features/lifetime/eventAmount.ts.';

comment on column public.life_events.end_amount_minor is
  'Số của năm CUỐI, theo minor units của currency dòng này. Chỉ có nghĩa khi amount_shape = ''ramp''; thiếu thì eventAmount.ts rơi về per_year (KHÔNG trả 0 — mốc không được lặng lẽ biến mất khỏi bản chiếu).';

comment on column public.life_events.growth_bps is
  'Mức nhân dồn mỗi năm kể từ start_year, basis points. Âm được (số teo dần). Chỉ có nghĩa khi amount_shape = ''growth''. Cộng dồn RIÊNG, không thay lạm phát: cờ inflate vẫn áp riêng ở project.ts, nên "tăng 2% NHANH HƠN giá chung" = growth_bps 200 + inflate true.';

comment on column public.life_events.repeat_every_years is
  'Mốc lặp mỗi bao nhiêu năm, tính TỪ start_year. null hoặc 1 = mọi năm trong khoảng. Trực giao với amount_shape: nó chọn NĂM NÀO mốc rơi vào, không nói mỗi lần bao nhiêu.';

comment on column public.life_events.icon is
  'Tên icon trong bộ icon mốc (src/features/lifetime/eventIcons.tsx). Chuỗi rỗng = dùng mũi tên lên/xuống theo kind như trước. KHÔNG vào phép tính.';
