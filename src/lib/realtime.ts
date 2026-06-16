import { useEffect } from 'react';
import { supabase } from './supabase';
import type { Message, Thread } from './database.types';

/**
 * Subscribe to new messages on a specific thread. Receives every INSERT and
 * UPDATE row that matches the filter. Useful for "they replied" appends
 * and read-receipt updates.
 *
 * Returns nothing; the cleanup is automatic on unmount.
 */
export function useThreadRealtime(
  threadId: string | null,
  onChange: (msg: Message) => void,
) {
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => onChange(payload.new as Message),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => onChange(payload.new as Message),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, onChange]);
}

/**
 * Subscribe to UPDATE events on a single thread row. Used so an owner
 * marking a thread reunited shows up on the finder's page without refresh,
 * and so a finder reopening / archiving on the owner side reflects live.
 */
export function useThreadStatusRealtime(
  threadId: string | null,
  onChange: (thread: Thread) => void,
) {
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`thread-status:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'threads',
          filter: `id=eq.${threadId}`,
        },
        (payload) => onChange(payload.new as Thread),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, onChange]);
}

/**
 * Subscribe to every new finder message landing on any of this household's
 * threads. Used by AppLayout to keep the unread badge live.
 */
export function useHouseholdInboxRealtime(
  householdId: string | null,
  onIncoming: () => void,
) {
  useEffect(() => {
    if (!householdId) return;
    // Filter on household_id via the threads table, but postgres_changes
    // can't join, so we subscribe to all message inserts and re-fetch on the
    // app layer (which already filters by household). The badge owner does
    // the household check.
    const channel = supabase
      .channel(`household-inbox:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => onIncoming(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [householdId, onIncoming]);
}
