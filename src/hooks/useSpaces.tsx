import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import type { FinancialSpace, SpaceMember } from '@/types';

interface SpacesContextValue {
  spaces: FinancialSpace[];
  members: Record<string, SpaceMember[]>;
  activeSpace: FinancialSpace | null;
  activeSpaceId: string | null;
  activeMembers: SpaceMember[];
  loading: boolean;
  error: string | null;
  changeActiveSpace: (spaceId: string) => void;
  refresh: () => Promise<void>;
}

const SpacesContext = createContext<SpacesContextValue | undefined>(undefined);

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [members, setMembers] = useState<Record<string, SpaceMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const autoCreateAttempted = useRef(false);
  const spaceIdsRef = useRef<string[]>([]);

  const fetchMembers = useCallback(async (spaceIds: string[]) => {
    if (spaceIds.length === 0) return;
    const { data: allMembers, error: membersError } = await supabase
      .from('space_members')
      .select(`
        *,
        profiles:profiles!space_members_user_id_fkey(display_name, avatar_url)
      `)
      .in('space_id', spaceIds);

    if (membersError) {
      logger.error('Erro ao buscar membros', membersError.message);
      return;
    }
    if (allMembers) {
      const grouped: Record<string, SpaceMember[]> = {};
      for (const m of allMembers as unknown as SpaceMember[]) {
        if (!grouped[m.space_id]) grouped[m.space_id] = [];
        grouped[m.space_id].push(m);
      }
      setMembers(grouped);
    }
  }, []);

  const createDefaultSpace = useCallback(async (userId: string): Promise<FinancialSpace | null> => {
    const { data: newSpace, error: spaceErr } = await supabase
      .from('financial_spaces')
      .insert({ name: 'Meu Espaço', kind: 'personal', owner_id: userId })
      .select('*')
      .single();

    if (spaceErr || !newSpace) {
      logger.error('Erro ao criar espaço padrão', spaceErr?.message ?? 'no data');
      return null;
    }

    const { error: memberErr } = await supabase
      .from('space_members')
      .insert({ space_id: newSpace.id, user_id: userId, role: 'owner' });

    if (memberErr) {
      logger.error('Erro ao vincular membro ao espaço', memberErr.message);
    }

    return newSpace as FinancialSpace;
  }, []);

  const fetchSpaces = useCallback(async () => {
    if (!user) { setLoading(false); setSpaces([]); return; }

    setLoading(true);
    setError(null);

    // 1. Fetch all spaces where the user is a member
    const { data: memberRows, error: memberError } = await supabase
      .from('space_members')
      .select('space_id')
      .eq('user_id', user.id);

    const memberSpaceIds: Set<string> = new Set();
    if (memberError) {
      logger.error('Erro ao buscar membership', memberError.message);
    } else if (memberRows?.length) {
      for (const m of memberRows as { space_id: string }[]) {
        memberSpaceIds.add(m.space_id);
      }
    }

    // 2. Fetch all spaces owned by the user (merge, not fallback)
    const { data: ownedSpaces, error: ownedError } = await supabase
      .from('financial_spaces')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });

    const ownedSpaceIds: Set<string> = new Set();
    if (ownedError) {
      logger.error('Erro ao buscar espaços criados', ownedError.message);
    } else if (ownedSpaces) {
      for (const s of ownedSpaces as FinancialSpace[]) {
        ownedSpaceIds.add(s.id);
      }
    }

    // 3. Merge: all space IDs the user can access (member OR owner)
    const allSpaceIds = new Set<string>([...memberSpaceIds, ...ownedSpaceIds]);

    // 4. Ensure membership rows exist for owned spaces (fixes orphaned spaces)
    for (const sid of ownedSpaceIds) {
      if (!memberSpaceIds.has(sid)) {
        await supabase
          .from('space_members')
          .upsert({ space_id: sid, user_id: user.id, role: 'owner' }, { onConflict: 'space_id,user_id' });
      }
    }

    // 5. Fetch the actual space records for all merged IDs
    let collectedSpaces: FinancialSpace[] = [];
    if (allSpaceIds.size > 0) {
      const { data: spaceRows, error: spaceError } = await supabase
        .from('financial_spaces')
        .select('*')
        .in('id', Array.from(allSpaceIds))
        .order('created_at', { ascending: true });

      if (spaceError) {
        logger.error('Erro ao buscar espaços', spaceError.message);
      } else if (spaceRows) {
        collectedSpaces = spaceRows as FinancialSpace[];
      }
    }

    // 6. Auto-create fallback: if still empty, create a default personal space
    if (collectedSpaces.length === 0 && !autoCreateAttempted.current) {
      autoCreateAttempted.current = true;
      logger.info('Nenhum espaço encontrado. Criando espaço padrão automaticamente.');
      const newSpace = await createDefaultSpace(user.id);
      if (newSpace) {
        collectedSpaces = [newSpace];
      } else {
        setError('Não foi possível criar um espaço automaticamente. Tente recarregar a página.');
      }
    }

    const finalSpaceIds = collectedSpaces.map(s => s.id);
    spaceIdsRef.current = finalSpaceIds;

    setSpaces(collectedSpaces);

    // 7. Fetch members for all spaces
    await fetchMembers(finalSpaceIds);

    // 8. Auto-select first space if none is selected or the selected one no longer exists
    setActiveSpaceId((prev) => {
      if (prev && collectedSpaces.some(s => s.id === prev)) return prev;
      if (collectedSpaces.length > 0) return collectedSpaces[0].id;
      return null;
    });

    setLoading(false);
  }, [user, fetchMembers, createDefaultSpace]);

  useEffect(() => {
    autoCreateAttempted.current = false;
    fetchSpaces();
  }, [fetchSpaces]);

  // Realtime: subscribe once, use ref to track which spaces to watch
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('spaces-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'financial_spaces' },
        () => { fetchSpaces(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'space_members', filter: `user_id=eq.${user.id}` },
        () => { fetchSpaces(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchSpaces]);

  const changeActiveSpace = useCallback((spaceId: string) => {
    setActiveSpaceId(spaceId);
  }, []);

  const refresh = useCallback(async () => {
    autoCreateAttempted.current = false;
    await fetchSpaces();
  }, [fetchSpaces]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? null;
  const activeMembers = activeSpaceId ? members[activeSpaceId] ?? [] : [];

  return (
    <SpacesContext.Provider
      value={{ spaces, members, activeSpace, activeSpaceId, activeMembers, loading, error, changeActiveSpace, refresh }}
    >
      {children}
    </SpacesContext.Provider>
  );
}

export function useSpaces() {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error('useSpaces deve ser usado dentro de SpacesProvider');
  return ctx;
}
