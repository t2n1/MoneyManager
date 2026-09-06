-- Tỷ trọng MỤC TIÊU của một nhóm tài sản (bps, 3000 = 30%) — người dùng khai một lần
-- lúc bình tĩnh, app kiểm mỗi lần xem để nhắc khi cơ cấu thật lệch quá 5 điểm %.
-- Gợi ý chỉnh luôn là GÓP THÊM bằng tiền mới, không bán: bán trong NISA là mất suất
-- miễn thuế vĩnh viễn (bài học giáo trình C8/C16, đối chiếu 09/2026).
--
-- null = nhóm này không đặt mục tiêu (không phải mục tiêu 0%).
alter table public.asset_group_settings
  add column if not exists target_bps integer
  check (target_bps is null or (target_bps >= 0 and target_bps <= 10000));

comment on column public.asset_group_settings.target_bps is
  'Tỷ trọng mục tiêu của nhóm trong tổng tài sản, bps (3000 = 30%). null = không đặt.';
