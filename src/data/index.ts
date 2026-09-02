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
