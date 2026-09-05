// "Việc cần làm" — khối ĐẦU TIÊN của Bản tin (§4.9 / bản vẽ 16a).
//
// ⚠️ Đây KHÔNG phải một engine mới. App đã có bộ luật sinh việc xuyên app
// (`features/notifications/rules/`) với đúng những thứ khó nhất: mã ổn định (một việc
// chỉ báo một lần), chống nói hai lần một ý (vượt trần rồi thì thôi báo nhịp), ngưỡng
// chống nhiễu (mục vặt dưới 5% tổng ngân sách không báo), và gộp dòng khi nhiều khoản
// cùng loại. Khối này chỉ ĐỌC RA và bày lại.
//
// Đừng tính lại bất cứ điều kiện nào ở đây. Muốn thêm một loại việc → viết một rule
// thuần trong `rules/`, nơi nó test được và chạy được cả trên edge function.
//
// Ba thứ khối này tôn trọng vì chúng đã nằm sẵn trong `useNotifications`:
//   · trần 5 việc (ACTION_LIMIT) và thứ hạng theo severity;
//   · cờ bật/tắt TỪNG LOẠI ở Cài đặt → Thông báo (arrangeNotifications lọc offTypes) —
//     người đã tắt một loại mà vẫn bị nhắc ở đây sẽ coi đó là lỗi;
//   · trạng thái đã ẩn của từng việc.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { Card, StatusDot, iconButtonClass } from "../../components/ui";
import { toISODate } from "../../lib/dates";
import { MOTION_TODO_MS } from "../../lib/motion";
import type {
  AppNotification,
  NotificationSeverity,
} from "../notifications/types";
import { dueSoonCount, todoBadge, todoSource, urgentCount } from "./todoView";
import { SectionTitle } from '../../components/ui'

/** Nối <button aria-controls> với vùng co giãn — thiếu nó thì trình đọc màn hình biết
 *  nút này đóng/mở, nhưng không biết nó đóng/mở CÁI GÌ. */
const LIST_ID = "todo-panel-list";

const TONE: Record<NotificationSeverity, "bad" | "warn" | "info"> = {
  high: "bad",
  medium: "warn",
  low: "info",
};

const TONE_LABEL: Record<NotificationSeverity, string> = {
  high: "Gấp",
  medium: "Nên làm sớm",
  low: "Khi rảnh",
};

interface Props {
  items: AppNotification[];
  /** Ẩn một việc. Bộ luật sinh lại nó khi tình huống tái diễn — xem state.ts. */
  onDismiss: (key: string) => void;
  /**
   * Vào thẳng Card bọc ngoài. BulletinPage dùng để bày khối này ở HAI chỗ theo
   * breakpoint (`xl:hidden` đầu trang / `hidden xl:block` đỉnh cột phụ) — xem chú
   * thích ở đó vì sao đó không phải hai bản trong cây a11y.
   */
  className?: string;
}

export function TodoPanel({ items, onDismiss, className }: Props) {
  // MẶC ĐỊNH MỞ SẴN (bản vẽ redesign 2026-09-05): khối này giờ đứng đầu cột phụ của
  // desktop, và một danh sách việc phải bấm mới thấy là một danh sách không ai bấm.
  // Vẫn KHÔNG nhớ lựa chọn qua localStorage — nhớ thì từ lần thứ hai trở đi nó không
  // còn mặc định mở nữa, tức người đóng một lần là mất luôn mặc định.
  const [open, setOpen] = useState(true);

  // §12: "dòng gạch ngang rồi co chiều cao về 0 — 200ms". Việc bị ẩn phải sống thêm bấy
  // nhiêu lâu để có cái mà co lại, nên nút ẩn đi qua trạng thái trung gian này trước khi
  // gọi `onDismiss`.
  //
  // MỘT HẸN GIỜ RIÊNG cho từng khoá, không phải một "khoá đang rời" duy nhất: bấm ẩn cái
  // thứ hai trong lúc cái thứ nhất còn đang co thì với một hẹn giờ chung, cái thứ nhất bị
  // huỷ giữa đường — dòng bật lại nguyên trạng và việc đó KHÔNG BAO GIỜ được ẩn. Mất một
  // lệnh của người dùng thì tệ hơn hẳn vài dòng code.
  const [leaving, setLeaving] = useState<readonly string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  function hide(key: string) {
    if (timers.current.has(key)) return; // bấm hai lần vào cùng một dòng
    setLeaving((cur) => [...cur, key]);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        setLeaving((cur) => cur.filter((k) => k !== key));
        onDismiss(key);
      }, MOTION_TODO_MS),
    );
  }

  // Đồng hồ đọc MỘT LẦN cho cả khối: gọi trong vòng map thì hai dòng có thể rơi hai bên
  // nửa đêm và ra hai con số ngày khác nhau trên cùng một danh sách.
  const todayISO = toISODate(new Date());
  const soon = dueSoonCount(items, todayISO);
  const gap = urgentCount(items);
  // Không có việc gì KHÔNG phải là trạng thái rỗng đáng vẽ một khối trống: khối này
  // biến mất hẳn, và Bản tin bắt đầu thẳng bằng câu kết luận. Một tấm thẻ ghi "không
  // có việc nào" mỗi ngày cũng là một dòng phải đọc.
  if (items.length === 0) return null;

  return (
    <Card elevation="panel" padding="panel" as="section" className={className}>
      <div className="flex items-center justify-between gap-2">
        {/* <button> NẰM TRONG <h2>, không phải <h2> nằm trong <button>: tiêu đề phải ở
            lại cây tiêu đề của trang để đọc màn bằng danh sách heading còn thấy khối này
            khi nó đang đóng. (`CardsSection` lồng ngược lại — nội dung của <button> chỉ
            được là phrasing content, nên <h2> bên trong là sai; không chép lỗi đó sang.)

            "· 1 có hạn trong tuần": trần 5 việc nghĩa là danh sách lúc nào cũng gần đầy,
            nên riêng "4 việc" không nói được hôm nay có gì gấp hay không (16a). Thu gọn
            rồi thì mệnh đề đó càng phải ở ngoài. */}
        <SectionTitle className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={LIST_ID}
            className="-my-1 flex w-full items-center gap-1.5 py-1 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
            {/* Dưới lg: HAI DÒNG, không cắt — cùng luật với tiêu đề việc bên dưới. Ở
                375px `truncate` cắt thành "· 2 có h…", tức bỏ đúng mệnh đề trả lời "có
                gì gấp không" mà chú thích trên vừa nói là phải giữ. Từ lg mới đủ rộng
                để một dòng. */}
            <span className="min-w-0 flex-1 line-clamp-2 lg:line-clamp-none lg:truncate">
              Việc cần làm ({items.length})
              {soon > 0 && (
                <span className="font-normal text-fg-muted">
                  {" "}
                  · {soon} có hạn trong tuần
                </span>
              )}
            </span>
            {/* Việc GẤP phải thấy được cả khi đóng — cùng lý do `CardsSection` để badge
                "thiếu tiền" ở ngoài: đây là tín hiệu duy nhất bảo người dùng rằng có cái
                đáng mở ra. Giấu nó sau một cú bấm là biến khối này thành khối không ai
                bấm. Chỉ hiện khi > 0: một badge "0 gấp" mỗi ngày cũng là một thứ phải đọc. */}
            {gap > 0 && (
              <span className="shrink-0 rounded-full bg-state-bad-bg px-2 py-0.5 text-2xs font-semibold text-state-bad-fg">
                {gap} gấp
              </span>
            )}
          </button>
        </SectionTitle>
        <Link
          to="/settings/notifications"
          className="-my-2 shrink-0 py-2 text-2xs text-fg-muted hover:underline"
        >
          Chọn loại nhắc
        </Link>
      </div>

      {/* Cùng cách co của từng dòng bên dưới (0fr→1fr + min-h-0), không dựng cách thứ hai
          trong một file đã có một cách: `max-height` phải đoán trước một con số px, mà
          năm việc với dòng nào cũng có thể xuống hai hàng là đoán sai chắc. */}
      <div
        id={LIST_ID}
        className={`grid motion-todo ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="mt-2 divide-y divide-border-subtle">
            {items.map((n) => {
              const badge = todoBadge(n, todayISO);
              const going = leaving.includes(n.key);
              return (
                // <li> thành lưới MỘT hàng để co được bằng grid-template-rows: chiều cao `auto`
                // không nội suy được, mà `max-height` thì phải đoán trước một con số px — dòng
                // nào xuống hai hàng là đoán sai. 0fr→1fr đo đúng chiều cao thật của nội dung.
                <li
                  key={n.key}
                  className={`grid motion-todo ${going ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`}
                >
                  {/* min-h-0 là điều kiện để hàng lưới co xuống dưới chiều cao nội dung — thiếu
                nó thì `0fr` không có tác dụng gì. */}
                  <div
                    className={`flex min-h-0 items-center gap-2 overflow-hidden ${going ? "line-through" : ""}`}
                  >
                    <Link
                      to={n.to}
                      className="flex min-w-0 flex-1 items-start gap-2.5 py-2"
                    >
                      <StatusDot
                        tone={TONE[n.severity]}
                        label={TONE_LABEL[n.severity]}
                      />
                      <span className="min-w-0 flex-1">
                        {/* Dưới lg: HAI DÒNG, không cắt một dòng. Tiêu đề việc luôn có dạng
                    "<tình huống> — <việc phải làm>", mà `truncate` ở 375px cắt đúng
                    trước dấu gạch dài: "Nhóm Ăn uống vượt trần ¥7,327 — chủ …" bỏ mất
                    nguyên vế HÀNH ĐỘNG, tức phần duy nhất trả lời "rồi sao". Hai dòng
                    tốn ~18px, rẻ hơn một việc không đọc được.
                    Từ lg thì giữ một dòng: ở đó khối nằm cột phải 380px cạnh nội dung
                    chính, và trần 5 việc nghĩa là mỗi dòng cao thêm là cả khối cao thêm
                    năm lần. */}
                        <span className="block text-sm text-fg-primary line-clamp-2 lg:line-clamp-none lg:truncate">
                          {n.title}
                        </span>
                        {/* Dòng NGUỒN — luận điểm chính của 16a: gom mọi kết luận về một chỗ thì
                    phải nói được việc này ĐẾN TỪ ĐÂU, không thì người dùng mất đường
                    quay về màn có đầy đủ ngữ cảnh. Ghép trước `detail` bằng dấu gạch dài
                    để cả hai nằm trên MỘT dòng: khối này có trần 5 việc, thêm một dòng
                    thứ ba cho mỗi việc là cao thêm gần một nửa. */}
                        <span className="block truncate text-2xs text-fg-muted">
                          Từ {todoSource(n)}
                          {n.detail && ` — ${n.detail}`}
                        </span>
                      </span>
                      {/* Nhãn hạn/loại ĐỨNG PHẢI, không đứng trái như mock: ở đây bên trái đã có
                  StatusDot mang mức độ, mà hai huy hiệu cạnh nhau thì không ai biết cái
                  nào là cái phải đọc trước. Bên phải nó nằm cùng cột với chevron, thành
                  một cột "trạng thái" đọc dọc được. */}
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold tabular-nums tracking-label ${
                          badge.urgent
                            ? "bg-state-warn-bg text-state-warn-fg"
                            : "bg-surface-sunken text-fg-muted"
                        }`}
                      >
                        {badge.text}
                      </span>
                      <ChevronRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted"
                        aria-hidden
                      />
                    </Link>
                    {/* Nút ẩn tách khỏi vùng bấm chính: cả dòng là "đi làm việc này", riêng nút
                này là "thôi, đừng nhắc nữa". Gộp vào một chỗ bấm thì lỡ tay là mất việc. */}
                    <button
                      type="button"
                      onClick={() => hide(n.key)}
                      disabled={going}
                      aria-label={`Ẩn: ${n.title}`}
                      title="Ẩn việc này"
                      className={iconButtonClass("ghost", "shrink-0")}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* KHÔNG có khối "Đã xong tuần này (3)" mà 16a vẽ, và đây là chủ ý.
          Nó cần một mốc "đã hoàn thành", mà thứ gần nhất app có là `dismissed_at`. Dùng
          nó thì đếm ra ngược sự thật: `splitStaleActionKeys` XOÁ state của việc mà lượt
          tính không còn sinh ra — tức việc THẬT SỰ xong thì rơi khỏi đếm, còn việc chỉ
          bị ẩn mà chưa làm thì ở lại và bị đếm thành "đã xong". Muốn làm đúng phải có
          một sổ hoàn thành riêng; chưa có thì thà không đếm. */}
    </Card>
  );
}
