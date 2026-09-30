import type { Dict } from '../index'

// Tên tiếng Anh của nhãn và nhóm nhãn MẶC ĐỊNH (seed trong supabase/migrations, và nhãn app tự
// tạo). Khoá `tag|<tên trong DB>` / `tgrp|<tên trong DB>`, tra bằng tagLabel() / tagGroupLabel()
// — xem src/i18n/index.ts.
const d: Dict = {
  'tgrp|Với ai?': 'Who?',
  'tgrp|Ở đâu?': 'Where?',
}

export default d
