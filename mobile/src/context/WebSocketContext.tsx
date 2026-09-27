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
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';

import { API_ENDPOINTS, SECURE_STORE_KEYS } from '@/constants';
import { useAuthStore } from '@/store';
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

  // Initialize client once
  if (!clientRef.current) {
    clientRef.current = new WebSocketClient(
      API_ENDPOINTS.WS,
      async () => SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN)
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
        if (clubId) {
          queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments'] });
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
