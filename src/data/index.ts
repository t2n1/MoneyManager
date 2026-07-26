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
  NewRecurringOccurrence,
  NewRecurringRule,
  NewSavingsGoal,
  NewTag,
  NewTransaction,
  NewValuation,
  ProfilePatch,
  SavingsGoalPatch,
  RecurringRulePatch,
  Repo,
  TagPatch,
  TransactionPatch,
  TxFilter,
} from './repo'
