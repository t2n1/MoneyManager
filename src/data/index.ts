import { isDemoMode } from '../lib/demo'
import type { Repo } from './repo'

// IMPORT ĐỘNG + top-level await, không phải import tĩnh cả hai bản: `isDemoMode` chỉ
// biết lúc CHẠY (nó đọc env qua fallback thiếu-URL nên không gấp được lúc build), mà
// import tĩnh nghĩa là người dùng thật tải luôn ~3.000 dòng demoRepo + dữ liệu mẫu
// không bao giờ chạy — đã đo thấy khoá 'sct-demo-db' nằm trong bundle production.
// Với import động, mỗi chế độ chỉ tải đúng bản repo của nó; phần còn lại của app vẫn
// thấy một `repo` đồng bộ y như cũ nhờ top-level await (build target es2022).
export const repo: Repo = isDemoMode
  ? (await import('./demoRepo')).demoRepo
  : (await import('./supabaseRepo')).supabaseRepo
export { BACKUP_VERSION } from './repo'
export type {
  BackupData,
  AccountPatch,
  AssetGroupSettingPatch,
  BenefitTxFilter,
  CategoryPatch,
  DateRange,
  DebtPatch,
  NewAccount,
  NewCategory,
  NewDebt,
  NewDebtPayment,
  NewFundTrade,
  NewPlannedExpense,
  NewRecurringOccurrence,
  NewRecurringRule,
  NewRelative,
  NewTrip,
  NewSavingsGoal,
  NewStockTrade,
  NewTag,
  NewTagGroup,
  NewTransaction,
  NewValuation,
  PlannedExpensePatch,
  ProfilePatch,
  SavingsGoalPatch,
  RecurringRulePatch,
  RelativePatch,
  Repo,
  FundTradePatch,
  StockTradePatch,
  TagPatch,
  TagGroupPatch,
  TransactionPatch,
  TxFilter,
} from './repo'
