/**
 * Pickleball Multi-Club Platform — Platform Admin Support Tickets
 *
 * Compact mobile-first design matching visual reference screenshot:
 * - Top header with official Pickleball product logo, "Platform Admin" label, notification bell & avatar
 * - Page heading "Support Tickets" and subtitle "Monitor and manage all support requests"
 * - Compact 4-column summary metrics tile (Total, Open, Awaiting, Resolved) in a single card
 * - Neatly aligned horizontal status filter pills with counts (All Tickets, Open, In Progress, Awaiting User, Resolved, Closed)
 * - Concise search bar with placeholder "Search by ticket #, subject, requester, or keywords..."
 * - Collapsible "Filters" accordion toggle and "Clear All" action
 * - Compact ticket card rows with reference number, priority, status, subject, requester, and "Inspect & Reply" action
 * - Pixel-matched empty state card with mint circular ticket icon
 * - Full chronological conversation thread, status/priority transition toolbar, and administrative reply posting
 * - Fixed bottom navigation with "More" active and proper clearance
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
  Search,
  Send,
  SlidersHorizontal,
  Ticket,
  User,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Card,
  ErrorState,
  LoadingState,
  PlatformButton,
  PlatformShell,
} from '@/components';
import {
  platformApplicationsApi,
  PlatformSupportTicketDetailResponse,
  PlatformSupportTicketItem,
} from '@/services/api/clubApplications';
import { Radius, Spacing } from '@/theme';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'waiting_for_requester' | 'resolved' | 'closed';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'open':
      return 'warning';
    case 'in_progress':
      return 'info';
    case 'waiting_for_requester':
      return 'default';
    case 'resolved':
      return 'success';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
}

function getPriorityBadgeVariant(priority: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (priority) {
    case 'urgent':
      return 'error';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'default';
    default:
      return 'default';
  }
}

export default function PlatformSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [tickets, setTickets] = useState<PlatformSupportTicketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [priorityCounts, setPriorityCounts] = useState<Record<string, number>>({});

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ticket inspection and reply modal
  const [selectedTicket, setSelectedTicket] = useState<PlatformSupportTicketDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Status & Priority change in modal
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchTickets = useCallback(
    async (isRefresh = false, targetPage = page) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await platformApplicationsApi.listSupportTickets({
          page: targetPage,
          pageSize,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          search: debouncedSearch || undefined,
        });

        setTickets(res.items || []);
        setTotal(res.total || 0);
        setStatusCounts(res.status_counts || {});
        setPriorityCounts(res.priority_counts || {});
        setPage(res.page || targetPage);
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message || 'Failed to load support tickets.';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, statusFilter, categoryFilter, priorityFilter, debouncedSearch]
  );

  useEffect(() => {
    fetchTickets(false, 1);
  }, [statusFilter, categoryFilter, priorityFilter, debouncedSearch]);

  const handleOpenTicket = async (ticketId: string) => {
    setIsLoadingDetail(true);
    setReplyError(null);
    setReplyMessage('');
    setActionSuccessMessage(null);
    try {
      const detail = await platformApplicationsApi.getSupportTicket(ticketId);
      setSelectedTicket(detail);
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Could not load ticket details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    setIsSubmittingReply(true);
    setReplyError(null);
    try {
      const updated = await platformApplicationsApi.replySupportTicket(
        selectedTicket.id,
        replyMessage.trim()
      );
      setSelectedTicket(updated);
      setReplyMessage('');
      setActionSuccessMessage('Reply sent successfully.');
      fetchTickets(true);
    } catch (err: any) {
      setReplyError(err.response?.data?.detail || err.message || 'Failed to submit administrative reply.');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket) return;
    setIsUpdatingTicket(true);
    setActionSuccessMessage(null);
    try {
      const updated = await platformApplicationsApi.updateSupportTicket(selectedTicket.id, {
        status: newStatus as any,
      });
      setSelectedTicket(updated);
      setActionSuccessMessage(`Ticket status updated to ${updated.status_label}.`);
      fetchTickets(true);
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Failed to update ticket status.');
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  const handleUpdatePriority = async (newPriority: string) => {
    if (!selectedTicket) return;
    setIsUpdatingTicket(true);
    setActionSuccessMessage(null);
    try {
      const updated = await platformApplicationsApi.updateSupportTicket(selectedTicket.id, {
        priority: newPriority as any,
      });
      setSelectedTicket(updated);
      setActionSuccessMessage(`Priority updated to ${updated.priority_label}.`);
      fetchTickets(true);
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Failed to update ticket priority.');
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPriorityFilter('all');
    setPage(1);
  };

  // Metrics numbers
  const openCount = (statusCounts['open'] || 0) + (statusCounts['in_progress'] || 0);
  const awaitingCount = statusCounts['waiting_for_requester'] || 0;
  const resolvedCount = statusCounts['resolved'] || 0;

  const statusTabItems: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All Tickets' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'waiting_for_requester', label: 'Awaiting User' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
  ];

  const totalPages = Math.ceil(total / pageSize);

  return (
    <PlatformShell
      activeTab="support"
      onRefresh={() => fetchTickets(true, 1)}
      isRefreshing={isRefreshing}
      scrollable={false}
    >
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchTickets(true, 1)}
            tintColor="#15803D"
          />
        }
        ListHeaderComponent={
          <View>
            {/* 1. Page Heading */}
            <View style={styles.headerSection}>
              <AppText style={styles.screenTitle}>Support Tickets</AppText>
              <AppText style={styles.screenSubtitle}>
                Monitor and manage all support requests
              </AppText>
            </View>

            {/* 2. Compact 4-Column Ticket Metrics Card */}
            <View style={styles.metricsContainer}>
              <View style={styles.metricsCard}>
                {/* Column 1: Total */}
                <View style={styles.metricCol}>
                  <View style={[styles.metricIconCircle, { backgroundColor: '#E6F4EA' }]}>
                    <LifeBuoy size={14} color="#15803D" />
                  </View>
                  <View style={styles.metricTextGroup}>
                    <AppText style={styles.metricLabel}>Total</AppText>
                    <AppText style={styles.metricValue}>{total}</AppText>
                  </View>
                </View>

                <View style={styles.metricDivider} />

                {/* Column 2: Open */}
                <View style={styles.metricCol}>
                  <View style={[styles.metricIconCircle, { backgroundColor: '#E0F2FE' }]}>
                    <Clock size={14} color="#0284C7" />
                  </View>
                  <View style={styles.metricTextGroup}>
                    <AppText style={styles.metricLabel}>Open</AppText>
                    <AppText style={styles.metricValue}>{openCount}</AppText>
                  </View>
                </View>

                <View style={styles.metricDivider} />

                {/* Column 3: Awaiting */}
                <View style={styles.metricCol}>
                  <View style={[styles.metricIconCircle, { backgroundColor: '#FEF3C7' }]}>
                    <MessageSquare size={14} color="#D97706" />
                  </View>
                  <View style={styles.metricTextGroup}>
                    <AppText style={styles.metricLabel}>Awaiting</AppText>
                    <AppText style={styles.metricValue}>{awaitingCount}</AppText>
                  </View>
                </View>

                <View style={styles.metricDivider} />

                {/* Column 4: Resolved */}
                <View style={styles.metricCol}>
                  <View style={[styles.metricIconCircle, { backgroundColor: '#E6F4EA' }]}>
                    <CheckCircle2 size={14} color="#15803D" />
                  </View>
                  <View style={styles.metricTextGroup}>
                    <AppText style={styles.metricLabel}>Resolved</AppText>
                    <AppText style={styles.metricValue}>{resolvedCount}</AppText>
                  </View>
                </View>
              </View>
            </View>

            {/* 3. Status Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsRow}
            >
              {statusTabItems.map((tab) => {
                const isActive = statusFilter === tab.key;
                const count =
                  tab.key === 'all'
                    ? total
                    : statusCounts[tab.key] || 0;

                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.pill, isActive && styles.pillActive]}
                    onPress={() => {
                      setStatusFilter(tab.key);
                      setPage(1);
                    }}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.pillText, isActive && styles.pillTextActive]}>
                      {tab.label}
                    </AppText>
                    <View
                      style={[
                        styles.pillBadge,
                        isActive ? styles.pillBadgeActive : styles.pillBadgeInactive,
                      ]}
                    >
                      <AppText
                        style={[
                          styles.pillBadgeText,
                          isActive ? styles.pillBadgeTextActive : styles.pillBadgeTextInactive,
                        ]}
                      >
                        {count}
                      </AppText>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 4. Search Bar */}
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Search size={16} color="#94A3B8" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by ticket #, subject, requester, or keywords..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={15} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 5. Filter Accordion Toggle & Clear All */}
            <View style={styles.filterControlsRow}>
              <TouchableOpacity
                style={styles.filterToggleBtn}
                onPress={() => setIsFilterExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                <SlidersHorizontal size={15} color="#0F172A" />
                <AppText style={styles.filterToggleText}>Filters</AppText>
                {isFilterExpanded ? (
                  <ChevronUp size={15} color="#0F172A" />
                ) : (
                  <ChevronDown size={15} color="#0F172A" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearAllBtn}
                onPress={handleClearAllFilters}
                activeOpacity={0.7}
              >
                <AppText style={styles.clearAllBtnText}>Clear All</AppText>
              </TouchableOpacity>
            </View>

            {/* Collapsible Category & Priority Filters Panel */}
            {isFilterExpanded && (
              <View style={styles.expandedFilterPanel}>
                {/* Category Chips */}
                <View style={styles.filterSubGroup}>
                  <AppText style={styles.filterSubGroupLabel}>Category:</AppText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'general', label: 'General' },
                      { key: 'billing', label: 'Billing' },
                      { key: 'account', label: 'Account' },
                      { key: 'technical', label: 'Technical' },
                      { key: 'club_operations', label: 'Club Ops' },
                      { key: 'tournament', label: 'Tournament' },
                    ].map((cat) => {
                      const isCatActive = categoryFilter === cat.key;
                      return (
                        <TouchableOpacity
                          key={cat.key}
                          style={[styles.chip, isCatActive && styles.chipActive]}
                          onPress={() => {
                            setCategoryFilter(cat.key);
                            setPage(1);
                          }}
                          activeOpacity={0.7}
                        >
                          <AppText style={[styles.chipText, isCatActive && styles.chipTextActive]}>
                            {cat.label}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Priority Chips */}
                <View style={styles.filterSubGroup}>
                  <AppText style={styles.filterSubGroupLabel}>Priority:</AppText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'urgent', label: 'Urgent' },
                      { key: 'high', label: 'High' },
                      { key: 'medium', label: 'Medium' },
                      { key: 'low', label: 'Low' },
                    ].map((pri) => {
                      const isPriActive = priorityFilter === pri.key;
                      return (
                        <TouchableOpacity
                          key={pri.key}
                          style={[styles.chip, isPriActive && styles.chipActive]}
                          onPress={() => {
                            setPriorityFilter(pri.key);
                            setPage(1);
                          }}
                          activeOpacity={0.7}
                        >
                          <AppText style={[styles.chipText, isPriActive && styles.chipTextActive]}>
                            {pri.label}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading && !isRefreshing ? (
            <LoadingState message="Loading support tickets queue..." />
          ) : error ? (
            <ErrorState
              title="Failed to Load Tickets"
              message={error}
              onRetry={() => fetchTickets(false, 1)}
            />
          ) : (
            /* Pixel-accurate Empty State matching visual reference */
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ticket size={28} color="#15803D" />
              </View>
              <AppText style={styles.emptyTitle}>No Support Tickets Found</AppText>
              <AppText style={styles.emptySubtitle}>
                There are no support tickets matching your filters.
              </AppText>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.ticketCard}
            onPress={() => handleOpenTicket(item.id)}
            activeOpacity={0.85}
          >
            {/* Header row: Reference # and badges */}
            <View style={styles.ticketCardHeader}>
              <View style={styles.ticketRefRow}>
                <View style={styles.refBadge}>
                  <AppText style={styles.refText}>{item.reference_number}</AppText>
                </View>
                <Badge
                  label={item.status_label}
                  variant={getStatusBadgeVariant(item.status)}
                  size="sm"
                />
                <Badge
                  label={item.priority_label}
                  variant={getPriorityBadgeVariant(item.priority)}
                  size="sm"
                />
                <View style={styles.categoryPill}>
                  <AppText style={styles.categoryPillText}>{item.category_label}</AppText>
                </View>
              </View>
            </View>

            {/* Subject */}
            <AppText style={styles.ticketSubject} numberOfLines={1}>
              {item.subject}
            </AppText>

            {/* Snippet */}
            <AppText numberOfLines={2} style={styles.ticketDescriptionSnippet}>
              {item.description}
            </AppText>

            {/* Subtle Divider */}
            <View style={styles.cardDivider} />

            {/* Footer row: Requester info, date & inspect button */}
            <View style={styles.ticketCardFooter}>
              <View style={styles.ticketMetaGroup}>
                <View style={styles.metaItem}>
                  <User size={12} color="#64748B" />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {item.requester_name || item.requester_email}
                  </AppText>
                </View>
                <View style={styles.metaItem}>
                  <Calendar size={12} color="#64748B" />
                  <AppText style={styles.metaText}>{formatDate(item.updated_at)}</AppText>
                </View>
                <View style={styles.metaItem}>
                  <MessageSquare size={12} color="#64748B" />
                  <AppText style={styles.metaText}>{item.messages_count}</AppText>
                </View>
              </View>

              <PlatformButton
                size="sm"
                label="Inspect & Reply"
                leftIcon={<Eye size={13} color="#FFFFFF" />}
                onPress={() => handleOpenTicket(item.id)}
              />
            </View>
          </TouchableOpacity>
        )}
      />

      {/* ─── Ticket Inspection and Reply Modal ───────────────────────────────── */}
      <Modal
        visible={!!selectedTicket}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedTicket(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            {selectedTicket && (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderInfo}>
                    <View style={styles.modalRefRow}>
                      <View style={styles.refBadge}>
                        <AppText style={styles.refText}>{selectedTicket.reference_number}</AppText>
                      </View>
                      <Badge
                        label={selectedTicket.status_label}
                        variant={getStatusBadgeVariant(selectedTicket.status)}
                        size="sm"
                      />
                      <Badge
                        label={selectedTicket.priority_label}
                        variant={getPriorityBadgeVariant(selectedTicket.priority)}
                        size="sm"
                      />
                      <View style={styles.categoryPill}>
                        <AppText style={styles.categoryPillText}>{selectedTicket.category_label}</AppText>
                      </View>
                    </View>
                    <AppText variant="heading2" style={styles.modalSubject}>
                      {selectedTicket.subject}
                    </AppText>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedTicket(null)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Alert Notification in Modal */}
                {actionSuccessMessage && (
                  <View style={styles.modalAlertSuccess}>
                    <CheckCircle2 size={16} color="#15803D" />
                    <AppText style={styles.modalAlertText}>{actionSuccessMessage}</AppText>
                  </View>
                )}

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {/* Meta Bar */}
                  <View style={styles.modalMetaGrid}>
                    <View style={styles.modalMetaCol}>
                      <AppText variant="caption" color="secondary" style={styles.modalMetaHeader}>
                        REQUESTER
                      </AppText>
                      <AppText style={styles.modalMetaValue}>
                        {selectedTicket.requester_name || 'User'}
                      </AppText>
                      <AppText style={styles.modalMetaSub}>{selectedTicket.requester_email}</AppText>
                    </View>

                    <View style={styles.modalMetaCol}>
                      <AppText variant="caption" color="secondary" style={styles.modalMetaHeader}>
                        RELATED FACILITY
                      </AppText>
                      <AppText style={styles.modalMetaValue}>
                        {selectedTicket.club_name || 'None (General Platform)'}
                      </AppText>
                    </View>

                    <View style={styles.modalMetaCol}>
                      <AppText variant="caption" color="secondary" style={styles.modalMetaHeader}>
                        CREATED
                      </AppText>
                      <AppText style={styles.modalMetaValue}>
                        {formatDate(selectedTicket.created_at)}
                      </AppText>
                    </View>

                    <View style={styles.modalMetaCol}>
                      <AppText variant="caption" color="secondary" style={styles.modalMetaHeader}>
                        LAST UPDATED
                      </AppText>
                      <AppText style={styles.modalMetaValue}>
                        {formatDate(selectedTicket.updated_at)}
                      </AppText>
                    </View>
                  </View>

                  {/* Status & Priority Transition Toolbar */}
                  <View style={styles.toolbarCard}>
                    <View style={styles.toolbarSection}>
                      <AppText variant="caption" style={styles.toolbarLabel}>
                        TRANSITION STATUS:
                      </AppText>
                      <View style={styles.toolbarPills}>
                        {[
                          { key: 'open', label: 'Open' },
                          { key: 'in_progress', label: 'In Progress' },
                          { key: 'waiting_for_requester', label: 'Waiting for User' },
                          { key: 'resolved', label: 'Resolved' },
                          { key: 'closed', label: 'Closed' },
                        ].map((st) => (
                          <TouchableOpacity
                            key={st.key}
                            disabled={isUpdatingTicket}
                            style={[
                              styles.toolbarPill,
                              selectedTicket.status === st.key && styles.toolbarPillActive,
                            ]}
                            onPress={() => handleUpdateStatus(st.key)}
                          >
                            <AppText
                              style={[
                                styles.toolbarPillText,
                                selectedTicket.status === st.key && styles.toolbarPillTextActive,
                              ]}
                            >
                              {st.label}
                            </AppText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={[styles.toolbarSection, { marginTop: 10 }]}>
                      <AppText variant="caption" style={styles.toolbarLabel}>
                        SET PRIORITY:
                      </AppText>
                      <View style={styles.toolbarPills}>
                        {[
                          { key: 'low', label: 'Low' },
                          { key: 'medium', label: 'Medium' },
                          { key: 'high', label: 'High' },
                          { key: 'urgent', label: 'Urgent' },
                        ].map((pr) => (
                          <TouchableOpacity
                            key={pr.key}
                            disabled={isUpdatingTicket}
                            style={[
                              styles.toolbarPill,
                              selectedTicket.priority === pr.key && styles.toolbarPillActive,
                            ]}
                            onPress={() => handleUpdatePriority(pr.key)}
                          >
                            <AppText
                              style={[
                                styles.toolbarPillText,
                                selectedTicket.priority === pr.key && styles.toolbarPillTextActive,
                              ]}
                            >
                              {pr.label}
                            </AppText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Conversation History */}
                  <View style={styles.threadSection}>
                    <View style={styles.threadSectionHeader}>
                      <MessageCircle size={16} color="#15803D" />
                      <AppText style={styles.threadTitle}>
                        Conversation History ({selectedTicket.messages?.length || 0})
                      </AppText>
                    </View>

                    <View style={styles.messagesTimeline}>
                      {selectedTicket.messages?.map((msg, index) => {
                        const isAdmin = msg.sender_role === 'platform_admin';
                        return (
                          <View
                            key={msg.id || index}
                            style={[
                              styles.messageBubble,
                              isAdmin ? styles.messageBubbleAdmin : styles.messageBubbleRequester,
                            ]}
                          >
                            <View style={styles.messageBubbleHeader}>
                              <View style={styles.senderInfo}>
                                <View
                                  style={[
                                    styles.roleTag,
                                    isAdmin ? styles.roleTagAdmin : styles.roleTagRequester,
                                  ]}
                                >
                                  <AppText
                                    style={[
                                      styles.roleTagText,
                                      isAdmin ? styles.roleTagTextAdmin : styles.roleTagTextRequester,
                                    ]}
                                  >
                                    {isAdmin ? 'Platform Admin' : 'Requester'}
                                  </AppText>
                                </View>
                                <AppText style={styles.senderNameText}>
                                  {msg.sender_name || msg.sender_email}
                                </AppText>
                              </View>
                              <AppText style={styles.messageTimestamp}>
                                {formatDate(msg.created_at)}
                              </AppText>
                            </View>

                            <AppText style={styles.messageBodyText}>{msg.message}</AppText>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Admin Reply Composer */}
                  {selectedTicket.status !== 'closed' ? (
                    <View style={styles.replyComposerCard}>
                      <AppText style={styles.replyComposerTitle}>Post Administrative Reply</AppText>
                      <AppText variant="caption" color="secondary" style={styles.replyComposerSubtitle}>
                        Posting a reply will be sent to the requester and transition ticket status to "Waiting for Requester".
                      </AppText>

                      {replyError && (
                        <View style={styles.modalAlertError}>
                          <AlertCircle size={16} color="#DC2626" />
                          <AppText style={styles.modalAlertErrorText}>{replyError}</AppText>
                        </View>
                      )}

                      <TextInput
                        style={styles.replyTextInput}
                        placeholder="Type your official administrative reply..."
                        placeholderTextColor="#94A3B8"
                        multiline
                        numberOfLines={4}
                        value={replyMessage}
                        onChangeText={setReplyMessage}
                        editable={!isSubmittingReply}
                      />

                      <View style={styles.replyActionsRow}>
                        <PlatformButton
                          size="md"
                          label={isSubmittingReply ? 'Posting Reply...' : 'Send Admin Reply'}
                          leftIcon={<Send size={15} color="#FFFFFF" />}
                          loading={isSubmittingReply}
                          disabled={!replyMessage.trim() || isSubmittingReply}
                          onPress={handleSendReply}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.closedNoticeCard}>
                      <CheckCircle2 size={18} color="#64748B" />
                      <AppText style={styles.closedNoticeText}>
                        This support ticket is closed. Re-open or change status to "Open" to post further replies.
                      </AppText>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 36,
  },

  // ─── Header Section ────────────────────────────────────────────────────────
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    marginTop: 4,
  },

  // ─── Compact 4-Column Ticket Metrics Card ──────────────────────────────────
  metricsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  metricsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  metricCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTextGroup: {
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#F1F5F9',
  },

  // ─── Status Filter Pills ───────────────────────────────────────────────────
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  pillActive: {
    backgroundColor: '#15803D',
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBadgeActive: {
    backgroundColor: '#166534',
  },
  pillBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pillBadgeTextActive: {
    color: '#FFFFFF',
  },
  pillBadgeTextInactive: {
    color: '#475569',
  },

  // ─── Search Bar ────────────────────────────────────────────────────────────
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 42,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    height: '100%',
  },

  // ─── Filter Accordion Toggle & Clear All ───────────────────────────────────
  filterControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  clearAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clearAllBtnText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // ─── Collapsible Filter Panel ──────────────────────────────────────────────
  expandedFilterPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    gap: 10,
  },
  filterSubGroup: {
    gap: 6,
  },
  filterSubGroupLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  chipsScroll: {
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  chipActive: {
    backgroundColor: '#15803D',
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },

  // ─── Pixel-accurate Empty State ────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ─── Ticket Cards ──────────────────────────────────────────────────────────
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ticketRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  refBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  refText: {
    fontSize: 11.5,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryPillText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  ticketSubject: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  ticketDescriptionSnippet: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },

  // ─── Modal Styles ──────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAF9',
  },
  modalHeaderInfo: {
    flex: 1,
    marginRight: 12,
  },
  modalRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  modalSubject: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: Radius.full,
    backgroundColor: '#E2E8F0',
  },
  modalAlertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalAlertText: {
    color: '#15803D',
    fontSize: 12.5,
    fontWeight: '600',
  },
  modalScroll: {
    padding: 16,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#F8FAF9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  modalMetaCol: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  modalMetaHeader: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  modalMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalMetaSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  toolbarCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  toolbarSection: {
    gap: 6,
  },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  toolbarPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toolbarPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  toolbarPillActive: {
    backgroundColor: '#15803D',
  },
  toolbarPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  toolbarPillTextActive: {
    color: '#FFFFFF',
  },
  threadSection: {
    marginBottom: 16,
  },
  threadSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  threadTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  messagesTimeline: {
    gap: 10,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  messageBubbleAdmin: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    alignSelf: 'flex-end',
    width: '92%',
  },
  messageBubbleRequester: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    alignSelf: 'flex-start',
    width: '92%',
  },
  messageBubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleTagAdmin: {
    backgroundColor: '#DCFCE7',
  },
  roleTagRequester: {
    backgroundColor: '#E0F2FE',
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleTagTextAdmin: {
    color: '#15803D',
  },
  roleTagTextRequester: {
    color: '#0284C7',
  },
  senderNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  messageTimestamp: {
    fontSize: 11,
    color: '#94A3B8',
  },
  messageBodyText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  replyComposerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  replyComposerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  replyComposerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  modalAlertError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  modalAlertErrorText: {
    fontSize: 12,
    color: '#DC2626',
  },
  replyTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  replyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  closedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  closedNoticeText: {
    fontSize: 12.5,
    color: '#64748B',
    flex: 1,
  },
});
