import { isDemoMode } from '../lib/demo'
import { demoRepo } from './demoRepo'
import type { Repo } from './repo'
import { supabaseRepo } from './supabaseRepo'

export const repo: Repo = isDemoMode ? demoRepo : supabaseRepo
export { BACKUP_VERSION } from './repo'
export type {
  BackupData,
  AccountPatch,
  AssetGroupSettingPatch,
  CategoryPatch,
  DateRange,
  DebtPatch,
  NewAccount,
  NewCategory,
  NewDebt,
  NewDebtPayment,
  NewPlannedExpense,
  NewRecurringOccurrence,
  NewRecurringRule,
  NewSavingsGoal,
  NewStockTrade,
  NewTag,
  NewTransaction,
  NewValuation,
  PlannedExpensePatch,
  ProfilePatch,
  SavingsGoalPatch,
  RecurringRulePatch,
  Repo,
  StockTradePatch,
  TagPatch,
  TransactionPatch,
  TxFilter,
} from './repo'
