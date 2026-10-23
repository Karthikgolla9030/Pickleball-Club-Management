/**
 * Pickleball Multi-Club Platform — Platform Admin Support Tickets
 *
 * Dedicated support-ticket queue and conversation management for authorized platform owners:
 * - Real support ticket workflow with reference number, priority, category, status, requester, and club
 * - Filter by status (All, Open, In Progress, Waiting for Requester, Resolved, Closed) with live counts
 * - Filter by category and priority
 * - Debounced search across ticket references, subjects, descriptions, and requester identities
 * - Interactive ticket inspection drawer/modal with full chronological conversation thread
 * - Administrative reply posting that atomically transitions status and writes to the Platform Audit Log
 * - Status and priority transitions with audit logging
 * - Clean light/neutral design adhering to PlatformShell conventions
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
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  LifeBuoy,
  Mail,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Shield,
  Tag,
  User,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformShell,
} from '@/components';
import {
  platformApplicationsApi,
  PlatformSupportTicketDetailResponse,
  PlatformSupportTicketItem,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'waiting_for_requester' | 'resolved' | 'closed';

export default function PlatformSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      const msg = err.response?.data?.detail || err.message || 'Failed to fetch ticket conversation.';
      alert(msg);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim() || isSubmittingReply) return;

    setIsSubmittingReply(true);
    setReplyError(null);
    try {
      const updated = await platformApplicationsApi.replySupportTicket(selectedTicket.id, replyMessage.trim());
      setSelectedTicket(updated);
      setReplyMessage('');
      setActionSuccessMessage('Reply posted successfully and ticket set to Waiting for Requester.');
      // Refresh list in background
      fetchTickets(true, page);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to send reply.';
      setReplyError(msg);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket || isUpdatingTicket || selectedTicket.status === newStatus) return;

    setIsUpdatingTicket(true);
    setActionSuccessMessage(null);
    try {
      const updated = await platformApplicationsApi.updateSupportTicket(selectedTicket.id, {
        status: newStatus,
        reason: `Admin updated status to ${newStatus}`,
      });
      setSelectedTicket(updated);
      setActionSuccessMessage(`Ticket status updated to ${updated.status_label}.`);
      fetchTickets(true, page);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to update ticket status.';
      alert(msg);
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  const handleUpdatePriority = async (newPriority: string) => {
    if (!selectedTicket || isUpdatingTicket || selectedTicket.priority === newPriority) return;

    setIsUpdatingTicket(true);
    setActionSuccessMessage(null);
    try {
      const updated = await platformApplicationsApi.updateSupportTicket(selectedTicket.id, {
        priority: newPriority,
        reason: `Admin updated priority to ${newPriority}`,
      });
      setSelectedTicket(updated);
      setActionSuccessMessage(`Ticket priority updated to ${updated.priority_label}.`);
      fetchTickets(true, page);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to update ticket priority.';
      alert(msg);
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'info' | 'error' | 'default' => {
    switch (status) {
      case 'open':
        return 'info';
      case 'in_progress':
        return 'warning';
      case 'waiting_for_requester':
        return 'warning';
      case 'resolved':
        return 'success';
      case 'closed':
        return 'default';
      default:
        return 'default';
    }
  };

  const getPriorityBadgeVariant = (priority: string): 'error' | 'warning' | 'info' | 'default' => {
    switch (priority) {
      case 'urgent':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
      default:
        return 'default';
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const statusTabItems: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All Tickets' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'waiting_for_requester', label: 'Awaiting User' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <PlatformShell
      activeTab="support"
      title="Platform Support"
      subtitle="Track, triage, and reply to user inquiries, club facility issues, and platform support requests."
      onRefresh={() => fetchTickets(true, 1)}
      isRefreshing={isRefreshing}
    >
      <View style={styles.container}>
        {/* Metric Cards Banner */}
        <View style={styles.metricsRow}>
          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <LifeBuoy size={18} color="#18794E" />
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                TOTAL TICKETS
              </AppText>
            </View>
            <AppText variant="heading2" style={styles.metricValue}>
              {total}
            </AppText>
          </Card>

          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Clock size={18} color="#0284C7" />
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                OPEN / ACTIVE
              </AppText>
            </View>
            <AppText variant="heading2" style={[styles.metricValue, { color: '#0284C7' }]}>
              {(statusCounts['open'] || 0) + (statusCounts['in_progress'] || 0)}
            </AppText>
          </Card>

          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <MessageSquare size={18} color="#D97706" />
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                AWAITING USER
              </AppText>
            </View>
            <AppText variant="heading2" style={[styles.metricValue, { color: '#D97706' }]}>
              {statusCounts['waiting_for_requester'] || 0}
            </AppText>
          </Card>

          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <CheckCircle2 size={18} color="#18794E" />
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                RESOLVED
              </AppText>
            </View>
            <AppText variant="heading2" style={[styles.metricValue, { color: '#18794E' }]}>
              {statusCounts['resolved'] || 0}
            </AppText>
          </Card>
        </View>

        {/* Status Filter Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
            {statusTabItems.map((tab) => {
              const isActive = statusFilter === tab.key;
              const count =
                tab.key === 'all'
                  ? total
                  : statusCounts[tab.key] || 0;

              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => {
                    setStatusFilter(tab.key);
                    setPage(1);
                  }}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </AppText>
                  <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                    <AppText style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                      {count}
                    </AppText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Search & Secondary Filter Bar */}
        <Card style={styles.filterCard}>
          <View style={styles.filterBarRow}>
            {/* Search Input */}
            <View style={styles.searchInputWrapper}>
              <Search size={16} color="#64748B" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by ticket #, subject, requester, or keywords..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <X size={14} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Selector */}
            <View style={styles.secondaryFilterGroup}>
              <AppText variant="caption" color="secondary" style={styles.filterGroupLabel}>
                Category:
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inlinePillsScroll}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'general', label: 'General' },
                  { key: 'billing', label: 'Billing' },
                  { key: 'account', label: 'Account' },
                  { key: 'technical', label: 'Technical' },
                  { key: 'club_operations', label: 'Club Ops' },
                  { key: 'tournament', label: 'Tournament' },
                ].map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.inlinePill,
                      categoryFilter === cat.key && styles.inlinePillActive,
                    ]}
                    onPress={() => {
                      setCategoryFilter(cat.key);
                      setPage(1);
                    }}
                  >
                    <AppText
                      style={[
                        styles.inlinePillText,
                        categoryFilter === cat.key && styles.inlinePillTextActive,
                      ]}
                    >
                      {cat.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Priority Selector */}
            <View style={styles.secondaryFilterGroup}>
              <AppText variant="caption" color="secondary" style={styles.filterGroupLabel}>
                Priority:
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inlinePillsScroll}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'urgent', label: 'Urgent' },
                  { key: 'high', label: 'High' },
                  { key: 'medium', label: 'Medium' },
                  { key: 'low', label: 'Low' },
                ].map((pri) => (
                  <TouchableOpacity
                    key={pri.key}
                    style={[
                      styles.inlinePill,
                      priorityFilter === pri.key && styles.inlinePillActive,
                    ]}
                    onPress={() => {
                      setPriorityFilter(pri.key);
                      setPage(1);
                    }}
                  >
                    <AppText
                      style={[
                        styles.inlinePillText,
                        priorityFilter === pri.key && styles.inlinePillTextActive,
                      ]}
                    >
                      {pri.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Card>

        {/* Content Area */}
        {isLoading && !isRefreshing ? (
          <LoadingState message="Loading support tickets queue..." />
        ) : error ? (
          <ErrorState
            title="Failed to Load Tickets"
            message={error}
            onRetry={() => fetchTickets(false, 1)}
          />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="🎫"
            title="No Support Tickets Found"
            description={
              debouncedSearch || statusFilter !== 'all' || categoryFilter !== 'all' || priorityFilter !== 'all'
                ? 'No tickets match the selected criteria or search term. Try adjusting your filters.'
                : 'There are currently no support tickets submitted on the platform.'
            }
            actionLabel={
              debouncedSearch || statusFilter !== 'all' || categoryFilter !== 'all' || priorityFilter !== 'all'
                ? 'Clear Filters'
                : undefined
            }
            onAction={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setCategoryFilter('all');
              setPriorityFilter('all');
            }}
          />
        ) : (
          <View style={styles.listContainer}>
            {/* Ticket Cards List */}
            <FlatList
              data={tickets}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Card style={styles.ticketCard}>
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

                    <AppText style={styles.ticketDateText}>{formatDate(item.updated_at)}</AppText>
                  </View>

                  <AppText variant="heading3" style={styles.ticketSubject}>
                    {item.subject}
                  </AppText>

                  <AppText
                    numberOfLines={2}
                    variant="bodySmall"
                    color="secondary"
                    style={styles.ticketDescriptionSnippet}
                  >
                    {item.description}
                  </AppText>

                  <View style={styles.ticketCardFooter}>
                    <View style={styles.ticketMetaGroup}>
                      <View style={styles.metaItem}>
                        <User size={13} color="#64748B" />
                        <AppText style={styles.metaText}>
                          {item.requester_name || 'User'} ({item.requester_email})
                        </AppText>
                      </View>

                      {item.club_name && (
                        <View style={styles.metaItem}>
                          <Building2 size={13} color="#64748B" />
                          <AppText style={styles.metaText}>{item.club_name}</AppText>
                        </View>
                      )}

                      <View style={styles.metaItem}>
                        <MessageSquare size={13} color="#64748B" />
                        <AppText style={styles.metaText}>
                          {item.messages_count} {item.messages_count === 1 ? 'message' : 'messages'}
                        </AppText>
                      </View>
                    </View>

                    <Button
                      label="Inspect & Reply"
                      variant="primary"
                      size="sm"
                      leftIcon={<Eye size={14} color="#FFFFFF" />}
                      onPress={() => handleOpenTicket(item.id)}
                    />
                  </View>
                </Card>
              )}
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <View style={styles.paginationRow}>
                <AppText variant="caption" color="secondary">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} tickets
                </AppText>

                <View style={styles.paginationButtons}>
                  <TouchableOpacity
                    style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                    disabled={page <= 1}
                    onPress={() => fetchTickets(false, page - 1)}
                  >
                    <ChevronLeft size={16} color={page <= 1 ? '#CBD5E1' : '#0F172A'} />
                    <AppText style={[styles.pageBtnText, page <= 1 && styles.pageBtnTextDisabled]}>
                      Previous
                    </AppText>
                  </TouchableOpacity>

                  <View style={styles.pageIndicator}>
                    <AppText style={styles.pageIndicatorText}>
                      Page {page} of {totalPages}
                    </AppText>
                  </View>

                  <TouchableOpacity
                    style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                    disabled={page >= totalPages}
                    onPress={() => fetchTickets(false, page + 1)}
                  >
                    <AppText style={[styles.pageBtnText, page >= totalPages && styles.pageBtnTextDisabled]}>
                      Next
                    </AppText>
                    <ChevronRight size={16} color={page >= totalPages ? '#CBD5E1' : '#0F172A'} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Ticket Inspection & Conversation Modal */}
        <Modal
          visible={!!selectedTicket}
          animationType="fade"
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

                  {/* Notification/Success alert in modal */}
                  {actionSuccessMessage && (
                    <View style={styles.modalAlertSuccess}>
                      <CheckCircle2 size={16} color="#18794E" />
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

                    {/* Quick Status / Priority Transition Toolbar */}
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
                        <MessageCircle size={16} color="#18794E" />
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
                          <Button
                            label={isSubmittingReply ? 'Posting Reply...' : 'Send Admin Reply'}
                            variant="primary"
                            leftIcon={<Send size={16} color="#FFFFFF" />}
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
      </View>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: 150,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  metricLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontWeight: '800',
    color: '#0F172A',
  },
  tabsContainer: {
    marginBottom: 12,
  },
  tabsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: '#18794E',
    borderColor: '#18794E',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  filterCard: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    marginBottom: 16,
  },
  filterBarRow: {
    gap: 10,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  secondaryFilterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterGroupLabel: {
    fontWeight: '600',
    minWidth: 60,
  },
  inlinePillsScroll: {
    flexDirection: 'row',
  },
  inlinePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  inlinePillActive: {
    backgroundColor: '#18794E',
  },
  inlinePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  inlinePillTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    gap: 12,
  },
  listContent: {
    gap: 10,
  },
  ticketCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    gap: 10,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  ticketRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  refBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  refText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  categoryPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  ticketDateText: {
    fontSize: 12,
    color: '#64748B',
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  ticketDescriptionSnippet: {
    color: '#475569',
    lineHeight: 18,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  ticketMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
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
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  paginationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pageBtnDisabled: {
    opacity: 0.5,
  },
  pageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  pageBtnTextDisabled: {
    color: '#94A3B8',
  },
  pageIndicator: {
    paddingHorizontal: 8,
  },
  pageIndicatorText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 850,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAF9',
  },
  modalHeaderInfo: {
    flex: 1,
    gap: 6,
    marginRight: 16,
  },
  modalRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modalSubject: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalAlertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
  },
  modalAlertText: {
    fontSize: 13,
    color: '#18794E',
    fontWeight: '600',
  },
  modalScroll: {
    padding: 20,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    padding: 16,
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  modalMetaCol: {
    minWidth: 160,
    flex: 1,
    gap: 2,
  },
  modalMetaHeader: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalMetaSub: {
    fontSize: 12,
    color: '#64748B',
  },
  toolbarCard: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  toolbarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolbarLabel: {
    fontWeight: '700',
    color: '#475569',
    minWidth: 120,
  },
  toolbarPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toolbarPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toolbarPillActive: {
    backgroundColor: '#18794E',
    borderColor: '#18794E',
  },
  toolbarPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  toolbarPillTextActive: {
    color: '#FFFFFF',
  },
  threadSection: {
    marginBottom: 20,
    gap: 12,
  },
  threadSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  threadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  messagesTimeline: {
    gap: 12,
  },
  messageBubble: {
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 8,
  },
  messageBubbleRequester: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  messageBubbleAdmin: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  messageBubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleTag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  roleTagRequester: {
    backgroundColor: '#E0F2FE',
  },
  roleTagAdmin: {
    backgroundColor: '#18794E',
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  roleTagTextRequester: {
    color: '#0369A1',
  },
  roleTagTextAdmin: {
    color: '#FFFFFF',
  },
  senderNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  messageTimestamp: {
    fontSize: 11,
    color: '#64748B',
  },
  messageBodyText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 20,
  },
  replyComposerCard: {
    padding: 16,
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    marginBottom: 20,
  },
  replyComposerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  replyComposerSubtitle: {
    lineHeight: 16,
  },
  modalAlertError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: Radius.sm,
    borderColor: '#FECACA',
    borderWidth: 1,
  },
  modalAlertErrorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  replyTextInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  replyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.md,
    marginBottom: 20,
  },
  closedNoticeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
});
