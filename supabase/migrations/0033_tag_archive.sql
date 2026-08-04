-- ============================================================
-- Sổ Chi Tiêu — Migration 0033: Lưu trữ nhãn (is_archived)
-- Nhãn theo dịp/dự án chỉ tăng chứ không giảm: "Về VN 2026" xong chuyến vẫn
-- chiếm chỗ trong ô chọn nhãn của form nhập mãi mãi. Trước đây muốn dẹp thì chỉ
-- còn cách xóa, mà xóa nhãn thì transaction_tags cascade → mất luôn tổng chi phí
-- cả chuyến trong báo cáo.
--
-- is_archived tách hai việc đó: nhãn ẩn khỏi ô chọn khi nhập, nhưng liên kết và
-- mọi số liệu lịch sử giữ nguyên (Chi theo nhãn, lọc ở Tìm kiếm vẫn có).
-- Ràng buộc unique (user_id, name) vẫn tính cả nhãn đã lưu trữ — trùng tên với
-- một nhãn đang ẩn thì app chọn lại nhãn cũ và bỏ lưu trữ, không tạo bản trùng.
-- ============================================================

alter table public.tags
  add column if not exists is_archived boolean not null default false;
