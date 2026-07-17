import { isDemoMode } from '../lib/demo'
import { demoRepo } from './demoRepo'
import type { Repo } from './repo'
import { supabaseRepo } from './supabaseRepo'

export const repo: Repo = isDemoMode ? demoRepo : supabaseRepo
export type {
  AccountPatch,
  CategoryPatch,
  DateRange,
  NewAccount,
  NewCategory,
  NewTransaction,
  ProfilePatch,
  Repo,
  TransactionPatch,
  TxFilter,
} from './repo'
