import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSpaces } from '@/hooks/useSpaces';
import type { Account, Category, Transaction, TransactionType, TransactionStatus, DateCriterion, Settlement, TransactionSplit, PaymentMethod, Card, Invoice, Budget, Goal } from '@/types';

export function useAccounts() {
  const { activeSpaceId } = useSpaces();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('space_id', activeSpaceId)
      .order('created_at', { ascending: true });
    if (!error && data) setAccounts(data as Account[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`accounts-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchAccounts()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchAccounts]);

  return { accounts, loading, refresh: fetchAccounts };
}

export function useCategories() {
  const { activeSpaceId } = useSpaces();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('space_id', activeSpaceId)
      .order('name', { ascending: true });
    if (!error && data) setCategories(data as Category[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`categories-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchCategories()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchCategories]);

  return { categories, loading, refresh: fetchCategories };
}

export interface TransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  categoryId?: string;
  accountId?: string;
  dateCriterion: DateCriterion;
  startDate: string;
  endDate: string;
}

export function useTransactions(filters: TransactionFilters) {
  const { activeSpaceId } = useSpaces();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    let query = supabase
      .from('transactions')
      .select(`
        *,
        categories:categories!transactions_category_id_fkey(name, kind),
        accounts:accounts!transactions_account_id_fkey(name, type),
        destination_accounts:accounts!transactions_destination_account_id_fkey(name, type),
        destination_members:profiles!transactions_destination_member_id_fkey(display_name),
        payment_methods:payment_methods!transactions_payment_method_id_fkey(name),
        cards:cards!transactions_card_id_fkey(name, brand),
        splits:transaction_splits(id, member_id, share_cents, share_percent, profiles:profiles!transaction_splits_member_id_fkey(display_name))
      `)
      .eq('space_id', activeSpaceId);

    if (filters.type) query = query.eq('type', filters.type);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.accountId) query = query.eq('account_id', filters.accountId);

    const dateField = filters.dateCriterion;
    query = query.gte(dateField, filters.startDate).lte(dateField, filters.endDate);
    query = query.order('occurred_at', { ascending: false });

    const { data, error } = await query;
    if (!error && data) setTransactions(data as unknown as Transaction[]);
    setLoading(false);
  }, [activeSpaceId, filters.type, filters.status, filters.categoryId, filters.accountId,
      filters.dateCriterion, filters.startDate, filters.endDate]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`transactions-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchTransactions()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transaction_splits' },
        () => fetchTransactions()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchTransactions]);

  return { transactions, loading, refresh: fetchTransactions };
}

export function useSplits(transactionId: string | null) {
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSplits = useCallback(async () => {
    if (!transactionId) { setSplits([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('transaction_splits')
      .select(`
        *,
        profiles:profiles!transaction_splits_member_id_fkey(display_name)
      `)
      .eq('transaction_id', transactionId);
    if (!error && data) setSplits(data as unknown as TransactionSplit[]);
    setLoading(false);
  }, [transactionId]);

  useEffect(() => { fetchSplits(); }, [fetchSplits]);

  return { splits, loading, refresh: fetchSplits };
}

export function useSettlements() {
  const { activeSpaceId } = useSpaces();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSettlements = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('settlements')
      .select(`
        *,
        from_profile:profiles!settlements_from_member_id_fkey(display_name),
        to_profile:profiles!settlements_to_member_id_fkey(display_name)
      `)
      .eq('space_id', activeSpaceId)
      .order('created_at', { ascending: false });
    if (!error && data) setSettlements(data as unknown as Settlement[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`settlements-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'settlements', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchSettlements()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchSettlements]);

  return { settlements, loading, refresh: fetchSettlements };
}

export function usePaymentMethods() {
  const { activeSpaceId } = useSpaces();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPaymentMethods = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('space_id', activeSpaceId)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (!error && data) setPaymentMethods(data as PaymentMethod[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchPaymentMethods(); }, [fetchPaymentMethods]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`payment-methods-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchPaymentMethods()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchPaymentMethods]);

  return { paymentMethods, loading, refresh: fetchPaymentMethods };
}

export function useCards() {
  const { activeSpaceId } = useSpaces();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCards = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('space_id', activeSpaceId)
      .order('created_at', { ascending: true });
    if (!error && data) setCards(data as Card[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`cards-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cards', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchCards()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchCards]);

  return { cards, loading, refresh: fetchCards };
}

export function useInvoices() {
  const { activeSpaceId } = useSpaces();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        cards:cards!invoices_card_id_fkey(name, brand),
        items:invoice_items(*, categories:categories!invoice_items_category_id_fkey(name))
      `)
      .eq('space_id', activeSpaceId)
      .order('due_date', { ascending: false });
    if (!error && data) setInvoices(data as unknown as Invoice[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`invoices-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchInvoices()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_items' },
        () => fetchInvoices()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchInvoices]);

  return { invoices, loading, refresh: fetchInvoices };
}

export function useBudgets() {
  const { activeSpaceId } = useSpaces();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('budgets')
      .select(`
        *,
        categories:categories!budgets_category_id_fkey(name, kind)
      `)
      .eq('space_id', activeSpaceId)
      .order('period_month', { ascending: false });
    if (!error && data) setBudgets(data as unknown as Budget[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`budgets-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'budgets', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchBudgets()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchBudgets]);

  return { budgets, loading, refresh: fetchBudgets };
}

export function useGoals() {
  const { activeSpaceId } = useSpaces();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!activeSpaceId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('goals')
      .select(`
        *,
        contributions:goal_contributions(*, profiles:profiles!goal_contributions_contributed_by_fkey(display_name))
      `)
      .eq('space_id', activeSpaceId)
      .order('created_at', { ascending: false });
    if (!error && data) setGoals(data as unknown as Goal[]);
    setLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`goals-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `space_id=eq.${activeSpaceId}` },
        () => fetchGoals()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'goal_contributions' },
        () => fetchGoals()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId, fetchGoals]);

  return { goals, loading, refresh: fetchGoals };
}
