-- ============================================================
-- Sổ Chi Tiêu — Migration 0046: categories.kind (expense | transfer)
--
-- VÌ SAO CẦN CỘT NÀY
-- "Gửi tiền về VN" ¥30,000 đang được xếp vào CHI. Nhưng đó là CHUYỂN TÀI SẢN
-- (tiền vẫn của mình, chỉ đứng ở một tài khoản khác), không phải tiêu. Xếp
-- vào chi làm ba con số nói sai cùng lúc:
--   · tỷ lệ giữ lại đọc ra 38% thay vì 46%
--   · Tiền nhà tụt từ 51% xuống 45% tổng chi (mẫu số bị phồng)
--   · trần Ngân sách đặt được cho một khoản không phải chi tiêu
--
-- App đã có cờ `transactions.is_remittance` (0013) nhưng nó chỉ MÔ TẢ — không
-- một hàm tổng hợp nào đọc nó. Và nó ở tầng giao dịch, nên không trả lời được
-- câu "danh mục này có phải chi tiêu hay không" mà Ngân sách cần.
--
-- Đây là cột trên DANH MỤC, không phải trên giao dịch: người dùng có thể có
-- những khoản chuyển tài sản khác (nạp NISA, gửi tiết kiệm có kỳ hạn) và mỗi
-- lần đánh dấu từng giao dịch là mời sai sót.
--
-- Ca `type='transfer'` của gửi tiền (chuyển sang tài khoản VND) vốn đã bị mọi
-- hàm tổng hợp bỏ qua. Cột này chỉ đổi hành vi cho ca `type='expense'`.
--
-- ĐÂY LÀ LỰA CHỌN CỦA NGƯỜI DÙNG, KHÔNG PHẢI QUY ĐỊNH CỦA APP.
-- 0013 ghi rằng ca `expense` là "hỗ trợ gia đình" — với người coi đó là tiêu
-- thật thì họ đặt lại thành 'expense' và app phải tôn trọng. Vì vậy cột thêm
-- vào NULLABLE và trigger chỉ điền khi giá trị là NULL: một 'expense' KHAI RÕ
-- (kể cả khi khôi phục từ file sao lưu) không bao giờ bị trigger đổi lại thành
-- 'transfer'. Nếu để `default 'expense'` thì không cách nào phân biệt "người
-- dùng chọn expense" với "chưa ai chọn gì", và mỗi lần khôi phục sao lưu là
-- một lần app ghi đè lựa chọn của họ.
-- ============================================================

-- 1) Cột NULLABLE trước: NULL = "chưa ai quyết", để trigger ở bước 3 điền.
alter table public.categories
  add column if not exists kind text
    check (kind in ('expense','transfer'));

-- 2) Backfill cho dữ liệu hiện có. Khớp theo TÊN vì đó là cách app đang nhận ra
-- hai danh mục này (flowCategories.ts → REMIT_CATEGORY_NAME / ADJUST_CATEGORY_NAME),
-- và roleSave.ts tự tạo "Gửi tiền về VN" với đúng tên đó.
update public.categories
set kind = case
  when name in ('Gửi tiền về VN', 'Điều chỉnh số dư') then 'transfer'
  else 'expense'
end
where kind is null;

-- 3) Seed cho người dùng MỚI. `handle_new_user()` chèn danh mục theo tên và không
-- truyền `kind`, nên trigger này là chỗ điền. Nó CHỈ chạm hàng có kind IS NULL —
-- xem lý do ở đầu file.
create or replace function public.default_category_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind is null then
    new.kind := case
      when new.name in ('Gửi tiền về VN', 'Điều chỉnh số dư') then 'transfer'
      else 'expense'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_default_category_kind on public.categories;
create trigger trg_default_category_kind
  before insert on public.categories
  for each row execute function public.default_category_kind();

-- 4) Giờ mọi hàng đều có giá trị và trigger bảo đảm hàng mới cũng vậy → chốt NOT NULL.
-- Chốt sau trigger, không trước: `handle_new_user()` không truyền cột này, nên NOT NULL
-- mà chưa có trigger là mọi lần đăng ký mới đều nổ.
alter table public.categories
  alter column kind set not null;

comment on column public.categories.kind is
  'expense = tiêu thật; transfer = chuyển tài sản (gửi về VN, điều chỉnh số dư). '
  'Danh mục transfer KHÔNG vào tổng chi, KHÔNG vào tỷ lệ giữ lại, KHÔNG đặt được hạn mức. '
  'Là lựa chọn của người dùng: trigger chỉ điền khi NULL, không ghi đè giá trị đã khai.';
