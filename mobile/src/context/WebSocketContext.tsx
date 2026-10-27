/**
 * Aught2 Pickleball — WebSocket Context & Query Synchronization Provider
 *
 * Integrates WebSocketClient with TanStack React Query:
 * - Auto connects on user login, disconnects on logout
 * - Listens for incoming server events and invalidates relevant caches
 * - Enables real-time synchronization between Player side and Club side
 */
/* eslint-disable no-console */
import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { API_ENDPOINTS } from '@/constants';
import { useAuthStore } from '@/store';
import { getValidAccessToken } from '@/services/api';
import { WebSocketClient, type WebSocketEvent } from '@/services/websocket/WebSocketClient';

interface WebSocketContextValue {
  isConnected: boolean;
  lastEvent: WebSocketEvent | null;
  subscribe: (eventType: string, listener: (event: WebSocketEvent) => void) => () => void;
  send: (action: string, payload?: Record<string, unknown>) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, activeMembership } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);

  // Initialize client once with proactive token validation and refresh
  if (!clientRef.current) {
    clientRef.current = new WebSocketClient(
      API_ENDPOINTS.WS,
      getValidAccessToken
    );
  }

  const wsClient = clientRef.current;

  // React to auth changes
  useEffect(() => {
    if (!isAuthenticated || !user) {
      wsClient.disconnect();
      setIsConnected(false);
      return;
    }

    console.log('[WebSocketContext] User authenticated, connecting WebSocket...');
    wsClient.connect();

    // Subscribe to all incoming events to manage TanStack Query cache invalidations
    const unsubscribeAll = wsClient.on('*', (event: WebSocketEvent) => {
      console.log('[WebSocketContext] Received event:', event.type, event.data);
      setLastEvent(event);

      const eventType = event.type;
      const clubId = event.club_id || activeMembership?.club_id;

      // ─── Court Bookings & Availability ─────────────────────────────────────
      if (
        eventType.startsWith('booking.') ||
        eventType === 'court.availability.changed'
      ) {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
        }
      }

      // ─── Tournaments & Matches ─────────────────────────────────────────────
      else if (eventType.startsWith('tournament.') || eventType.startsWith('match.')) {
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'tournaments'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
        queryClient.invalidateQueries({ queryKey: ['matches'] });
        queryClient.invalidateQueries({ queryKey: ['standings'] });
        queryClient.invalidateQueries({ queryKey: ['bracket'] });
        queryClient.invalidateQueries({ queryKey: ['scramble'] });
        queryClient.invalidateQueries({ queryKey: ['clubs'] });
        const targetTournamentId = (event.data as any)?.tournament_id || (event.data as any)?.id;
        if (targetTournamentId) {
          const tId = String(targetTournamentId);
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'my-registration'] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'player-registrations'] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'teams'] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'registrations'] });
          queryClient.invalidateQueries({ queryKey: ['tournament-registrations', tId] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'pools'] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'standings'] });
          queryClient.invalidateQueries({ queryKey: ['tournaments', tId, 'matches'] });
        }
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments'] });
          if (targetTournamentId) {
            queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments', String(targetTournamentId)] });
          }
        }
      }

      // ─── Events ────────────────────────────────────────────────────────────
      else if (eventType.startsWith('event.')) {
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'events'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
        }
      }

      // ─── Lessons & Coaching ────────────────────────────────────────────────
      else if (eventType.startsWith('lesson.')) {
        queryClient.invalidateQueries({ queryKey: ['lessons'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'lessons'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
        }
      }

      // ─── Player Profiles ───────────────────────────────────────────────────
      else if (eventType === 'player.profile.updated') {
        queryClient.invalidateQueries({ queryKey: ['player', 'profile'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'members'] });
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'player-memberships'] });
        }
      }

      // ─── Memberships & Subscriptions ───────────────────────────────────────
      else if (eventType === 'player.membership.updated') {
        queryClient.invalidateQueries({ queryKey: ['player', 'memberships'] });
        queryClient.invalidateQueries({ queryKey: ['player', 'membership'] });
        queryClient.invalidateQueries({ queryKey: ['my-membership'] });
        queryClient.invalidateQueries({ queryKey: ['memberships'] });
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'subscriptions'] });
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'members'] });
        }
      }

      // ─── Notifications ─────────────────────────────────────────────────────
      else if (eventType === 'notification.created') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      }
    });

    // Check connection state
    const unsubscribeConnect = wsClient.onConnect(() => {
      setIsConnected(true);
      // Reconnected! Invalidate essential queries to resynchronize any missed updates
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
    });

    return () => {
      unsubscribeAll();
      unsubscribeConnect();
    };
  }, [isAuthenticated, user, activeMembership?.club_id, queryClient, wsClient]);

  // Handle AppState (native) and Web Page Lifecycle (bfcache pagehide/pageshow, freeze/resume, visibilitychange)
  useEffect(() => {
    // 1. Native & General AppState listener
    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        if (isAuthenticated && user) {
          wsClient.resume();
          queryClient.invalidateQueries();
        }
      } else if (nextAppState === 'background') {
        wsClient.pause();
      }
    });

    // 2. Web specific Page Lifecycle (Back-Forward Cache support)
    const cleanupWebListeners: Array<() => void> = [];

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handlePageHide = (event: any) => {
        // When navigating away or entering Back-Forward Cache (bfcache),
        // cleanly pause the WebSocket to prevent browser "Page entered Back-Forward Cache" failure.
        wsClient.pause();
      };

      const handlePageShow = (event: any) => {
        // If restored from Back-Forward Cache (event.persisted is true) or fresh navigation
        if (event?.persisted && isAuthenticated && user) {
          console.log('[WebSocketContext] Restored from Back-Forward Cache. Resuming WebSocket and resynchronizing queries...');
          wsClient.resume();
          queryClient.invalidateQueries();
        }
      };

      const handleFreeze = () => {
        wsClient.pause();
      };

      const handleResume = () => {
        if (isAuthenticated && user) {
          wsClient.resume();
          queryClient.invalidateQueries();
        }
      };

      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isAuthenticated && user) {
          wsClient.resume();
        }
      };

      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);
      if (typeof document !== 'undefined') {
        document.addEventListener('freeze', handleFreeze);
        document.addEventListener('resume', handleResume);
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      cleanupWebListeners.push(() => {
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('pageshow', handlePageShow);
        if (typeof document !== 'undefined') {
          document.removeEventListener('freeze', handleFreeze);
          document.removeEventListener('resume', handleResume);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      });
    }

    return () => {
      appStateSubscription.remove();
      cleanupWebListeners.forEach((cleanup) => cleanup());
    };
  }, [isAuthenticated, user, queryClient, wsClient]);

  const value = useMemo(
    () => ({
      isConnected,
      lastEvent,
      subscribe: (eventType: string, listener: (event: WebSocketEvent) => void) =>
        wsClient.on(eventType, listener),
      send: (action: string, payload: Record<string, unknown> = {}) =>
        wsClient.send(action, payload),
    }),
    [isConnected, lastEvent, wsClient]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
