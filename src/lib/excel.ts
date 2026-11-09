import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { accountDisplayLabel } from '@/types';
import type { Account, Category, Card, PaymentMethod, Transaction } from '@/types';
import { logger } from '@/lib/logger';

interface ExportData {
  accounts: Account[];
  categories: Category[];
  cards: Card[];
  paymentMethods: PaymentMethod[];
  transactions: Transaction[];
}

function centsToCurrency(cents: number): number {
  return cents / 100;
}

function currencyToCents(value: number | string): number {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  return Math.round(num * 100);
}

function formatDateISO(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}

export async function fetchAllData(spaceId: string): Promise<ExportData> {
  const [accountsRes, categoriesRes, cardsRes, paymentMethodsRes, transactionsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('space_id', spaceId).order('created_at'),
    supabase.from('categories').select('*').eq('space_id', spaceId).order('name'),
    supabase.from('cards').select('*').eq('space_id', spaceId).order('name'),
    supabase.from('payment_methods').select('*').eq('space_id', spaceId).order('name'),
    supabase.from('transactions')
      .select('*, categories:categories!transactions_category_id_fkey(name), accounts:accounts!transactions_account_id_fkey(name, institution, holder_name), payment_methods:payment_methods!transactions_payment_method_id_fkey(name), cards:cards!transactions_card_id_fkey(name)')
      .eq('space_id', spaceId)
      .order('occurred_at', { ascending: false }),
  ]);

  return {
    accounts: (accountsRes.data as Account[]) ?? [],
    categories: (categoriesRes.data as Category[]) ?? [],
    cards: (cardsRes.data as Card[]) ?? [],
    paymentMethods: (paymentMethodsRes.data as PaymentMethod[]) ?? [],
    transactions: (transactionsRes.data as Transaction[]) ?? [],
  };
}

export function exportToExcel(data: ExportData): void {
  const wb = XLSX.utils.book_new();

  // Contas
  const accountsRows = data.accounts.map(a => ({
    'ID': a.id,
    'Instituicao': a.institution ?? a.name,
    'Titular': a.holder_name ?? '',
    'Agencia': a.agency ?? '',
    'Numero': a.account_number ?? '',
    'Tipo': a.type,
    'Saldo Inicial': centsToCurrency(a.initial_balance_cents),
    'Data Referencia': formatDateISO(a.reference_date),
    'Status': a.status,
  }));
  const wsAccounts = XLSX.utils.json_to_sheet(accountsRows.length > 0 ? accountsRows : [{
    'ID': '', 'Instituicao': '', 'Titular': '', 'Agencia': '', 'Numero': '',
    'Tipo': '', 'Saldo Inicial': '', 'Data Referencia': '', 'Status': '',
  }]);
  XLSX.utils.book_append_sheet(wb, wsAccounts, 'Contas');

  // Categorias
  const categoriesRows = data.categories.map(c => ({
    'ID': c.id,
    'Nome': c.name,
    'Tipo': c.kind,
    'Status': c.status,
  }));
  const wsCategories = XLSX.utils.json_to_sheet(categoriesRows.length > 0 ? categoriesRows : [{
    'ID': '', 'Nome': '', 'Tipo': '', 'Status': '',
  }]);
  XLSX.utils.book_append_sheet(wb, wsCategories, 'Categorias');

  // Formas de Pagamento
  const pmRows = data.paymentMethods.map(pm => ({
    'ID': pm.id,
    'Nome': pm.name,
    'Tipo': pm.kind,
    'Padrao': pm.is_default ? 'Sim' : 'Nao',
    'Status': pm.status,
  }));
  const wsPM = XLSX.utils.json_to_sheet(pmRows.length > 0 ? pmRows : [{
    'ID': '', 'Nome': '', 'Tipo': '', 'Padrao': '', 'Status': '',
  }]);
  XLSX.utils.book_append_sheet(wb, wsPM, 'Formas de Pagamento');

  // Cartoes
  const cardsRows = data.cards.map(c => ({
    'ID': c.id,
    'Nome': c.name,
    'Bandeira': c.brand ?? '',
    'Titular': c.holder_name ?? '',
    'Ultimos Digitos': c.last_digits ?? '',
    'Limite': centsToCurrency(c.limit_cents),
    'Dia Fechamento': c.closing_day,
    'Dia Vencimento': c.due_day,
    'Status': c.status,
  }));
  const wsCards = XLSX.utils.json_to_sheet(cardsRows.length > 0 ? cardsRows : [{
    'ID': '', 'Nome': '', 'Bandeira': '', 'Titular': '', 'Ultimos Digitos': '',
    'Limite': '', 'Dia Fechamento': '', 'Dia Vencimento': '', 'Status': '',
  }]);
  XLSX.utils.book_append_sheet(wb, wsCards, 'Cartoes');

  // Lancamentos
  const txRows = data.transactions.map(t => ({
    'ID': t.id,
    'Tipo': t.type,
    'Descricao': t.description,
    'Valor': centsToCurrency(t.amount_cents),
    'Categoria': t.categories?.name ?? '',
    'Conta': t.accounts ? accountDisplayLabel(t.accounts as Account) : '',
    'Forma de Pagamento': t.payment_methods?.name ?? '',
    'Cartao': t.cards?.name ?? '',
    'Estabelecimento': t.establishment ?? '',
    'CPF_CNPJ': t.cpf_cnpj ?? '',
    'Data Realizacao': formatDateISO(t.occurred_at),
    'Vencimento': formatDateISO(t.due_date),
    'Status': t.status,
    'Observacoes': t.notes ?? '',
  }));
  const wsTx = XLSX.utils.json_to_sheet(txRows.length > 0 ? txRows : [{
    'ID': '', 'Tipo': '', 'Descricao': '', 'Valor': '', 'Categoria': '', 'Conta': '',
    'Forma de Pagamento': '', 'Cartao': '', 'Estabelecimento': '', 'CPF_CNPJ': '',
    'Data Realizacao': '', 'Vencimento': '', 'Status': '', 'Observacoes': '',
  }]);
  XLSX.utils.book_append_sheet(wb, wsTx, 'Lancamentos');

  XLSX.writeFile(wb, `dualcash_export_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function downloadTemplate(): void {
  const wb = XLSX.utils.book_new();

  const accountsCols = [{ ID: '', Instituicao: '', Titular: '', Agencia: '', Numero: '', Tipo: '', 'Saldo Inicial': '', 'Data Referencia': '', Status: '' }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountsCols), 'Contas');

  const categoriesCols = [{ ID: '', Nome: '', Tipo: '', Status: '' }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categoriesCols), 'Categorias');

  const pmCols = [{ ID: '', Nome: '', Tipo: '', Padrao: '', Status: '' }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pmCols), 'Formas de Pagamento');

  const cardsCols = [{ ID: '', Nome: '', Bandeira: '', Titular: '', 'Ultimos Digitos': '', Limite: '', 'Dia Fechamento': '', 'Dia Vencimento': '', Status: '' }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cardsCols), 'Cartoes');

  const txCols = [{ ID: '', Tipo: '', Descricao: '', Valor: '', Categoria: '', Conta: '', 'Forma de Pagamento': '', Cartao: '', Estabelecimento: '', CPF_CNPJ: '', 'Data Realizacao': '', Vencimento: '', Status: '', Observacoes: '' }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txCols), 'Lancamentos');

  XLSX.writeFile(wb, 'dualcash_modelo.xlsx');
}

export interface ImportSummary {
  accounts: number;
  categories: number;
  paymentMethods: number;
  cards: number;
  transactions: number;
  errors: string[];
}

export async function importFromExcel(
  file: File,
  spaceId: string,
  userId: string,
  existingData: ExportData
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    accounts: 0, categories: 0, paymentMethods: 0, cards: 0, transactions: 0, errors: [],
  };

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  // Helper: get sheet as JSON rows
  function getRows(sheetName: string): Record<string, unknown>[] {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }

  function getVal(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
    }
    return '';
  }

  // --- Contas ---
  const accountRows = getRows('Contas');
  const accountNameToId = new Map<string, string>();
  existingData.accounts.forEach(a => accountNameToId.set(accountDisplayLabel(a), a.id));

  for (const row of accountRows) {
    const institution = getVal(row, 'Instituicao', 'Instituição');
    const holder = getVal(row, 'Titular');
    if (!institution) { summary.errors.push('Conta sem instituição (linha ignorada)'); continue; }
    const label = holder ? `${institution} - ${holder}` : institution;
    const existingId = accountNameToId.get(label);
    if (existingId) continue; // skip duplicates

    const payload = {
      space_id: spaceId,
      name: label,
      holder_name: holder || null,
      institution,
      agency: getVal(row, 'Agencia', 'Agência') || null,
      account_number: getVal(row, 'Numero', 'Número') || null,
      type: (getVal(row, 'Tipo') || 'checking') as Account['type'],
      initial_balance_cents: currencyToCents(getVal(row, 'Saldo Inicial') || '0'),
      reference_date: getVal(row, 'Data Referencia', 'Data Referência') || new Date().toISOString().split('T')[0],
      owner_id: userId,
    };
    const { data, error } = await supabase.from('accounts').insert(payload).select('id').single();
    if (error) { summary.errors.push(`Erro ao importar conta ${label}: ${error.message}`); }
    else { accountNameToId.set(label, data.id); summary.accounts++; }
  }

  // --- Categorias ---
  const categoryRows = getRows('Categorias');
  const categoryNameToId = new Map<string, string>();
  existingData.categories.forEach(c => categoryNameToId.set(`${c.kind}:${c.name}`, c.id));

  for (const row of categoryRows) {
    const name = getVal(row, 'Nome');
    const kind = (getVal(row, 'Tipo') || 'expense') as Category['kind'];
    if (!name) { summary.errors.push('Categoria sem nome (linha ignorada)'); continue; }
    const key = `${kind}:${name}`;
    if (categoryNameToId.has(key)) continue;

    const { data, error } = await supabase.from('categories')
      .insert({ space_id: spaceId, name, kind }).select('id').single();
    if (error) { summary.errors.push(`Erro ao importar categoria ${name}: ${error.message}`); }
    else { categoryNameToId.set(key, data.id); summary.categories++; }
  }

  // --- Formas de Pagamento ---
  const pmRows = getRows('Formas de Pagamento');
  const pmNameToId = new Map<string, string>();
  existingData.paymentMethods.forEach(pm => pmNameToId.set(`${pm.kind}:${pm.name}`, pm.id));

  for (const row of pmRows) {
    const name = getVal(row, 'Nome');
    const kind = (getVal(row, 'Tipo') || 'expense') as PaymentMethod['kind'];
    if (!name) { summary.errors.push('Forma de pagamento sem nome (linha ignorada)'); continue; }
    const key = `${kind}:${name}`;
    if (pmNameToId.has(key)) continue;

    const isDefault = getVal(row, 'Padrao', 'Padrão').toLowerCase() === 'sim';
    const { data, error } = await supabase.from('payment_methods')
      .insert({ space_id: spaceId, name, kind, is_default: isDefault }).select('id').single();
    if (error) { summary.errors.push(`Erro ao importar forma de pagamento ${name}: ${error.message}`); }
    else { pmNameToId.set(key, data.id); summary.paymentMethods++; }
  }

  // --- Cartoes ---
  const cardRows = getRows('Cartoes');
  const cardNameToId = new Map<string, string>();
  existingData.cards.forEach(c => cardNameToId.set(c.name, c.id));

  for (const row of cardRows) {
    const name = getVal(row, 'Nome');
    if (!name) { summary.errors.push('Cartão sem nome (linha ignorada)'); continue; }
    if (cardNameToId.has(name)) continue;

    const { data, error } = await supabase.from('cards').insert({
      space_id: spaceId,
      name,
      brand: getVal(row, 'Bandeira') || null,
      holder_name: getVal(row, 'Titular') || null,
      last_digits: getVal(row, 'Ultimos Digitos', 'Últimos Digitos') || null,
      limit_cents: currencyToCents(getVal(row, 'Limite') || '0'),
      closing_day: parseInt(getVal(row, 'Dia Fechamento') || '1'),
      due_day: parseInt(getVal(row, 'Dia Vencimento') || '10'),
      owner_id: userId,
    }).select('id').single();
    if (error) { summary.errors.push(`Erro ao importar cartão ${name}: ${error.message}`); }
    else { cardNameToId.set(name, data.id); summary.cards++; }
  }

  // --- Lancamentos ---
  const txRows = getRows('Lancamentos');
  const txIdSet = new Set(existingData.transactions.map(t => t.id));

  for (const row of txRows) {
    const type = (getVal(row, 'Tipo') || 'expense') as Transaction['type'];
    const description = getVal(row, 'Descricao', 'Descrição');
    const valueStr = getVal(row, 'Valor');
    if (!description) { summary.errors.push('Lançamento sem descrição (linha ignorada)'); continue; }
    if (!valueStr) { summary.errors.push(`Lançamento "${description}" sem valor (linha ignorada)`); continue; }

    const txId = getVal(row, 'ID');
    if (txId && txIdSet.has(txId)) continue; // skip duplicates

    const categoryName = getVal(row, 'Categoria');
    const accountLabel = getVal(row, 'Conta');
    const pmName = getVal(row, 'Forma de Pagamento');
    const cardName = getVal(row, 'Cartao', 'Cartão');

    // Resolve category
    let categoryId: string | null = null;
    if (categoryName) {
      const kind = type === 'income' ? 'income' : 'expense';
      categoryId = categoryNameToId.get(`${kind}:${categoryName}`) ?? null;
    }

    // Resolve account
    let accountId: string | null = null;
    if (accountLabel) {
      accountId = accountNameToId.get(accountLabel) ?? null;
    }

    // Resolve payment method
    let paymentMethodId: string | null = null;
    if (pmName) {
      const kind = type === 'income' ? 'income' : 'expense';
      paymentMethodId = pmNameToId.get(`${kind}:${pmName}`) ?? pmNameToId.get(`expense:${pmName}`) ?? null;
    }

    // Resolve card
    let cardId: string | null = null;
    if (cardName) {
      cardId = cardNameToId.get(cardName) ?? null;
    }

    const status = (getVal(row, 'Status') || 'pending') as Transaction['status'];

    const payload = {
      space_id: spaceId,
      type,
      description,
      amount_cents: currencyToCents(valueStr),
      category_id: categoryId,
      account_id: accountId,
      payment_method_id: paymentMethodId,
      card_id: cardId,
      establishment: getVal(row, 'Estabelecimento') || null,
      cpf_cnpj: getVal(row, 'CPF_CNPJ') || null,
      occurred_at: getVal(row, 'Data Realizacao', 'Data Realização') || new Date().toISOString().split('T')[0],
      due_date: getVal(row, 'Vencimento') || null,
      status,
      notes: getVal(row, 'Observacoes', 'Observações') || null,
      split_type: 'individual' as const,
      created_by: userId,
    };

    const { error } = await supabase.from('transactions').insert(payload);
    if (error) {
      summary.errors.push(`Erro ao importar lançamento "${description}": ${error.message}`);
    } else {
      summary.transactions++;
    }
  }

  logger.info('Importação concluída', summary);
  return summary;
}
