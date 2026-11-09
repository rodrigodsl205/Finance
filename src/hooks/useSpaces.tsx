import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { FinancialSpace, SpaceMember } from '@/types';

interface SpacesContextValue {
  spaces: FinancialSpace[];
  members: Record<string, SpaceMember[]>;
  activeSpace: FinancialSpace | null;
  activeSpaceId: string | null;
  activeMembers: SpaceMember[];
  loading: boolean;
  changeActiveSpace: (spaceId: string) => void;
  refresh: () => Promise<void>;
}

const SpacesContext = createContext<SpacesContextValue | undefined>(undefined);

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [members, setMembers] = useState<Record<string, SpaceMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data: memberRows, error: memberError } = await supabase
      .from('space_members')
      .select('space_id')
      .eq('user_id', user.id);

    if (memberError || !memberRows?.length) {
      setLoading(false);
      return;
    }

    const spaceIds = memberRows.map((m) => m.space_id);

    const { data: spaceRows, error: spaceError } = await supabase
      .from('financial_spaces')
      .select('*')
      .in('id', spaceIds)
      .order('created_at', { ascending: true });

    if (spaceError) {
      console.error('Erro ao buscar espaços:', spaceError.message);
      setLoading(false);
      return;
    }

    setSpaces(spaceRows as FinancialSpace[]);

    const { data: allMembers, error: membersError } = await supabase
      .from('space_members')
      .select(`
        *,
        profiles:profiles!space_members_user_id_fkey(display_name, avatar_url)
      `)
      .in('space_id', spaceIds);

    if (!membersError && allMembers) {
      const grouped: Record<string, SpaceMember[]> = {};
      for (const m of allMembers as unknown as SpaceMember[]) {
        if (!grouped[m.space_id]) grouped[m.space_id] = [];
        grouped[m.space_id].push(m);
      }
      setMembers(grouped);
    }

    setActiveSpaceId((prev) => {
      if (prev && spaceIds.includes(prev)) return prev;
      if (spaceRows.length > 0) {
        const firstId = (spaceRows[0] as FinancialSpace).id;
        return firstId;
      }
      return null;
    });

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  useEffect(() => {
    if (!user || spaces.length === 0) return;

    const channel = supabase
      .channel('spaces-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'financial_spaces', filter: `id=in.(${spaces.map(s => s.id).join(',')})` },
        () => { fetchSpaces(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'space_members', filter: `space_id=in.(${spaces.map(s => s.id).join(',')})` },
        () => { fetchSpaces(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, spaces, fetchSpaces]);

  const changeActiveSpace = useCallback((spaceId: string) => {
    setActiveSpaceId(spaceId);
  }, []);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? null;
  const activeMembers = activeSpaceId ? members[activeSpaceId] ?? [] : [];

  return (
    <SpacesContext.Provider
      value={{ spaces, members, activeSpace, activeSpaceId, activeMembers, loading, changeActiveSpace, refresh: fetchSpaces }}
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
