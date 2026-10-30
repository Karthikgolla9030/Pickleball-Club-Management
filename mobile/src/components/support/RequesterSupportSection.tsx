/**
 * Aught2 Pickleball — Requester Support Component
 *
 * Provides authenticated users (players, club managers, directors, coaches)
 * with:
 * - Direct support ticket submission
 * - "My Support Tickets" tracking
 * - Real-time conversational replies to platform administrators
 * - Clear indicators when a reply has been sent and when awaiting user input
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Send,
  Tag,
  User,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/StateViews';
import {
  clubsApi,
  PlatformSupportTicketDetailResponse,
  PlatformSupportTicketItem,
  supportApi,
} from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';

interface RequesterSupportSectionProps {
  defaultClubId?: string | null;
  mode?: 'player' | 'club';
}

export function RequesterSupportSection({ defaultClubId, mode = 'player' }: RequesterSupportSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<'tickets' | 'submit'>('tickets');

  // Tickets List State
  const [tickets, setTickets] = useState<PlatformSupportTicketItem[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isRefreshingTickets, setIsRefreshingTickets] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Clubs List for Player Related-Club Selector
  const [clubsList, setClubsList] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(defaultClubId || null);

  // Form State
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(mode === 'club' ? 'facility' : 'booking');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Detail / Conversation Modal State
  const [selectedTicket, setSelectedTicket] = useState<PlatformSupportTicketDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Load public clubs for player related club picker
  useEffect(() => {
    if (mode === 'player') {
      clubsApi
        .discoverPublicClubs({ page_size: 30 })
        .then((res) => {
          if (res?.items) {
            setClubsList(res.items.map((c: any) => ({ id: c.id, name: c.name })));
          }
        })
        .catch(() => {});
    }
  }, [mode]);

  const fetchMyTickets = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshingTickets(true);
      } else {
        setIsLoadingTickets(true);
      }
      setTicketError(null);

      try {
        const res = await supportApi.listMyTickets({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          club_id: mode === 'club' ? defaultClubId || undefined : undefined,
          page: 1,
          pageSize: 50,
        });
        setTickets(res.items || []);
        setStatusCounts(res.status_counts || {});
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message || 'Failed to load your support tickets.';
        setTicketError(msg);
      } finally {
        setIsLoadingTickets(false);
        setIsRefreshingTickets(false);
      }
    },
    [statusFilter, mode, defaultClubId]
  );

  useEffect(() => {
    fetchMyTickets(false);
  }, [fetchMyTickets]);

  const handleSubmitTicket = async () => {
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();

    if (trimmedSubject.length < 3) {
      setFormError('Please enter a ticket subject (at least 3 characters).');
      return;
    }
    if (trimmedDescription.length < 5) {
      setFormError('Please enter a detailed description (at least 5 characters).');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    const targetClubId = mode === 'club' ? (defaultClubId || null) : (selectedClubId || null);

    try {
      const created = await supportApi.createTicket({
        subject: trimmedSubject,
        description: trimmedDescription,
        category,
        priority,
        club_id: targetClubId,
        source_portal: mode === 'club' ? 'club' : 'player',
      });

      setSubject('');
      setDescription('');
      setCategory(mode === 'club' ? 'facility' : 'booking');
      setPriority('medium');
      if (mode === 'player') setSelectedClubId(null);
      setFormSuccess(`Ticket #${created.reference_number} submitted successfully! Support has been notified.`);

      // Switch to tickets list and reload
      await fetchMyTickets(true);
      setActiveSubTab('tickets');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit support ticket.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTicket = async (ticketId: string) => {
    setIsLoadingDetail(true);
    setReplyError(null);
    setReplyMessage('');
    try {
      const detail = await supportApi.getMyTicket(ticketId);
      setSelectedTicket(detail);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load ticket conversation.';
      alert(msg);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSendRequesterReply = async () => {
    if (!selectedTicket || !replyMessage.trim() || isSendingReply) return;

    setIsSendingReply(true);
    setReplyError(null);

    try {
      const updated = await supportApi.replyToTicket(selectedTicket.id, replyMessage.trim());
      setSelectedTicket(updated);
      setReplyMessage('');
      // Refresh list to update status badge
      fetchMyTickets(true);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to send reply.';
      setReplyError(msg);
    } finally {
      setIsSendingReply(false);
    }
  };

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

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const categories = [
    { key: 'booking', label: 'Court Booking' },
    { key: 'membership', label: 'Membership & Plans' },
    { key: 'billing', label: 'Billing & Payments' },
    { key: 'tournament', label: 'Tournaments & Leagues' },
    { key: 'account', label: 'Account & Login' },
    { key: 'facility', label: 'Club Facility & Ops' },
    { key: 'technical', label: 'Technical Bug / App' },
    { key: 'general', label: 'General Inquiry' },
    { key: 'other', label: 'Other' },
  ];

  const priorities = [
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'High' },
    { key: 'urgent', label: 'Urgent' },
  ];

  return (
    <View style={styles.container}>
      {/* Tab Switcher: My Tickets vs Submit a Ticket */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeSubTab === 'tickets' && styles.tabItemActive]}
          onPress={() => setActiveSubTab('tickets')}
          activeOpacity={0.7}
        >
          <MessageSquare
            size={16}
            color={activeSubTab === 'tickets' ? '#114D3F' : '#64748B'}
            strokeWidth={2}
          />
          <AppText style={[styles.tabItemText, activeSubTab === 'tickets' && styles.tabItemTextActive]}>
            My Support Tickets ({tickets.length})
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeSubTab === 'submit' && styles.tabItemActive]}
          onPress={() => {
            setActiveSubTab('submit');
            setFormError(null);
            setFormSuccess(null);
          }}
          activeOpacity={0.7}
        >
          <PlusCircle
            size={16}
            color={activeSubTab === 'submit' ? '#114D3F' : '#64748B'}
            strokeWidth={2}
          />
          <AppText style={[styles.tabItemText, activeSubTab === 'submit' && styles.tabItemTextActive]}>
            Submit a Ticket
          </AppText>
        </TouchableOpacity>
      </View>

      {/* SUB-VIEW 1: SUBMIT A TICKET */}
      {activeSubTab === 'submit' && (
        <Card style={styles.formCard}>
          <View style={styles.formHeader}>
            <LifeBuoy size={20} color="#114D3F" />
            <AppText style={styles.formTitle}>Submit a Support Ticket</AppText>
          </View>
          <AppText variant="caption" color="secondary" style={styles.formSubtitle}>
            Our platform administration team reviews tickets during standard operations.
          </AppText>

          {formError && (
            <View style={styles.alertError}>
              <AlertCircle size={16} color="#DC2626" />
              <AppText style={styles.alertErrorText}>{formError}</AppText>
            </View>
          )}

          {formSuccess && (
            <View style={styles.alertSuccess}>
              <CheckCircle2 size={16} color="#18794E" />
              <AppText style={styles.alertSuccessText}>{formSuccess}</AppText>
            </View>
          )}

          {/* Subject Field */}
          <View style={styles.fieldGroup}>
            <AppText style={styles.fieldLabel}>Subject *</AppText>
            <TextInput
              style={styles.textInput}
              placeholder="Brief summary of your inquiry or issue..."
              placeholderTextColor="#94A3B8"
              value={subject}
              onChangeText={setSubject}
              editable={!isSubmitting}
            />
          </View>

          {/* Category Field */}
          <View style={styles.fieldGroup}>
            <AppText style={styles.fieldLabel}>Category</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.chip, category === cat.key && styles.chipActive]}
                  onPress={() => setCategory(cat.key)}
                >
                  <AppText style={[styles.chipText, category === cat.key && styles.chipTextActive]}>
                    {cat.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Priority Field */}
          <View style={styles.fieldGroup}>
            <AppText style={styles.fieldLabel}>Priority</AppText>
            <View style={styles.chipsRow}>
              {priorities.map((pri) => (
                <TouchableOpacity
                  key={pri.key}
                  style={[styles.chip, priority === pri.key && styles.chipActive]}
                  onPress={() => setPriority(pri.key)}
                >
                  <AppText style={[styles.chipText, priority === pri.key && styles.chipTextActive]}>
                    {pri.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Related Club Field */}
          {mode === 'club' ? (
            <View style={styles.fieldGroup}>
              <AppText style={styles.fieldLabel}>Club Facility Scope</AppText>
              <View style={styles.clubContextBadge}>
                <Building2 size={14} color={Colors.brand.primary} />
                <AppText style={styles.clubContextBadgeText}>
                  {defaultClubId ? 'Linked to your active club facility' : 'Club Operations'}
                </AppText>
              </View>
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <AppText style={styles.fieldLabel}>Related Club (Optional)</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                <TouchableOpacity
                  style={[styles.chip, selectedClubId === null && styles.chipActive]}
                  onPress={() => setSelectedClubId(null)}
                >
                  <AppText style={[styles.chipText, selectedClubId === null && styles.chipTextActive]}>
                    None / General
                  </AppText>
                </TouchableOpacity>
                {clubsList.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, selectedClubId === c.id && styles.chipActive]}
                    onPress={() => setSelectedClubId(c.id)}
                  >
                    <AppText style={[styles.chipText, selectedClubId === c.id && styles.chipTextActive]}>
                      {c.name}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Description Field */}
          <View style={styles.fieldGroup}>
            <AppText style={styles.fieldLabel}>Description *</AppText>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Describe your issue or question in detail. Include dates, court numbers, or error messages if applicable..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              editable={!isSubmitting}
            />
          </View>

          <Button
            label={isSubmitting ? 'Submitting Ticket...' : 'Submit Support Ticket'}
            variant="primary"
            leftIcon={<Send size={16} color="#FFFFFF" />}
            loading={isSubmitting}
            disabled={isSubmitting}
            onPress={handleSubmitTicket}
          />
        </Card>
      )}

      {/* SUB-VIEW 2: MY TICKETS LIST */}
      {activeSubTab === 'tickets' && (
        <View style={styles.ticketsContainer}>
          {/* Status Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusFilterBar}>
            {[
              { key: 'all', label: 'All' },
              { key: 'open', label: 'Open' },
              { key: 'in_progress', label: 'In Progress' },
              { key: 'waiting_for_requester', label: 'Action Required' },
              { key: 'resolved', label: 'Resolved' },
              { key: 'closed', label: 'Closed' },
            ].map((tab) => {
              const count = tab.key === 'all' ? tickets.length : statusCounts[tab.key] || 0;
              const isActive = statusFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.statusPill, isActive && styles.statusPillActive]}
                  onPress={() => setStatusFilter(tab.key)}
                >
                  <AppText style={[styles.statusPillText, isActive && styles.statusPillTextActive]}>
                    {tab.label} {count > 0 ? `(${count})` : ''}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {isLoadingTickets && !isRefreshingTickets ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={Colors.brand.primary} />
              <AppText variant="caption" color="secondary" style={{ marginTop: 8 }}>
                Loading your tickets...
              </AppText>
            </View>
          ) : ticketError ? (
            <View style={styles.alertError}>
              <AlertCircle size={16} color="#DC2626" />
              <AppText style={styles.alertErrorText}>{ticketError}</AppText>
            </View>
          ) : tickets.length === 0 ? (
            <Card style={styles.emptyCard}>
              <LifeBuoy size={36} color="#94A3B8" />
              <AppText style={styles.emptyTitle}>No Support Tickets</AppText>
              <AppText variant="caption" color="secondary" style={styles.emptySubtitle}>
                {statusFilter !== 'all'
                  ? 'No tickets match the selected status filter.'
                  : 'You have not submitted any support tickets yet. Need help? Tap "Submit a Ticket" above.'}
              </AppText>
            </Card>
          ) : (
            <View style={styles.ticketCardsList}>
              {tickets.map((t) => {
                const isWaitingOnMe = t.status === 'waiting_for_requester';

                return (
                  <TouchableOpacity
                    key={t.id}
                    activeOpacity={0.8}
                    onPress={() => handleOpenTicket(t.id)}
                  >
                    <Card style={[styles.ticketCard, isWaitingOnMe && styles.ticketCardActionRequired]}>
                      {/* Action Required Banner if admin replied */}
                      {isWaitingOnMe && (
                        <View style={styles.actionRequiredBanner}>
                          <AlertCircle size={13} color="#B45309" />
                          <AppText style={styles.actionRequiredText}>
                            Support replied — Awaiting your response
                          </AppText>
                        </View>
                      )}

                      <View style={styles.ticketCardHeader}>
                        <View style={styles.ticketRefRow}>
                          <View style={styles.refTag}>
                            <AppText style={styles.refTagText}>{t.reference_number}</AppText>
                          </View>
                          <Badge
                            label={t.status_label}
                            variant={getStatusBadgeVariant(t.status)}
                            size="sm"
                          />
                        </View>
                        <AppText style={styles.ticketDate}>{formatDate(t.updated_at)}</AppText>
                      </View>

                      <AppText style={styles.ticketSubjectText}>{t.subject}</AppText>
                      <AppText numberOfLines={2} style={styles.ticketSnippet}>
                        {t.description}
                      </AppText>

                      <View style={styles.ticketCardFooter}>
                        <View style={styles.footerCategoryPill}>
                          <AppText style={styles.footerCategoryText}>{t.category_label}</AppText>
                        </View>

                        <View style={styles.footerRight}>
                          <MessageSquare size={13} color="#64748B" />
                          <AppText style={styles.messagesCountText}>
                            {t.messages_count} {t.messages_count === 1 ? 'reply' : 'replies'}
                          </AppText>
                          <ChevronRight size={14} color="#94A3B8" />
                        </View>
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* TICKET CONVERSATION MODAL */}
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
                    <View style={styles.ticketRefRow}>
                      <View style={styles.refTag}>
                        <AppText style={styles.refTagText}>{selectedTicket.reference_number}</AppText>
                      </View>
                      <Badge
                        label={selectedTicket.status_label}
                        variant={getStatusBadgeVariant(selectedTicket.status)}
                        size="sm"
                      />
                    </View>
                    <AppText style={styles.modalTitleText}>{selectedTicket.subject}</AppText>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedTicket(null)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Messages Thread ScrollView */}
                <ScrollView style={styles.modalMessagesScroll} showsVerticalScrollIndicator={false}>
                  {selectedTicket.club_name && (
                    <View style={styles.modalClubNotice}>
                      <Building2 size={13} color="#114D3F" />
                      <AppText style={styles.modalClubNoticeText}>
                        Associated Facility: {selectedTicket.club_name}
                      </AppText>
                    </View>
                  )}

                  <View style={styles.threadContainer}>
                    {selectedTicket.messages?.map((msg, idx) => {
                      const isAdmin = msg.sender_role === 'platform_admin';
                      const isStaff = msg.sender_role === 'club_staff';
                      const senderLabel = isAdmin ? 'Platform Support' : isStaff ? (msg.sender_name || 'Club Staff') : 'You';
                      return (
                        <View
                          key={msg.id || idx}
                          style={[
                            styles.chatBubble,
                            isAdmin ? styles.chatBubbleAdmin : styles.chatBubbleUser,
                          ]}
                        >
                          <View style={styles.chatBubbleHeader}>
                            <View
                              style={[
                                styles.senderBadge,
                                isAdmin ? styles.senderBadgeAdmin : isStaff ? styles.senderBadgeStaff : styles.senderBadgeUser,
                              ]}
                            >
                              <AppText
                                style={[
                                  styles.senderBadgeText,
                                  isAdmin ? styles.senderBadgeTextAdmin : isStaff ? styles.senderBadgeTextStaff : styles.senderBadgeTextUser,
                                ]}
                              >
                                {senderLabel}
                              </AppText>
                            </View>
                            <AppText style={styles.chatTimestamp}>{formatDate(msg.created_at)}</AppText>
                          </View>
                          <AppText style={styles.chatMessageText}>{msg.message}</AppText>
                        </View>
                      );
                    })}
                  </View>

                  {/* Resolved Ticket Notice if ticket is resolved but can be reopened */}
                  {selectedTicket.status === 'resolved' && (
                    <View style={styles.resolvedNoticeCard}>
                      <CheckCircle2 size={16} color="#15803D" />
                      <AppText style={styles.resolvedNoticeText}>
                        This ticket has been marked as resolved by support. If you have further questions or the issue is not fully addressed, send a reply below to automatically reopen this ticket.
                      </AppText>
                    </View>
                  )}

                  {/* Reply Composer if not closed */}
                  {selectedTicket.status !== 'closed' ? (
                    <View style={styles.replyBox}>
                      <AppText style={styles.replyBoxTitle}>
                        {selectedTicket.status === 'resolved' ? 'Reopen with Reply' : 'Send a Reply'}
                      </AppText>
                      {replyError && (
                        <View style={styles.alertError}>
                          <AlertCircle size={14} color="#DC2626" />
                          <AppText style={styles.alertErrorText}>{replyError}</AppText>
                        </View>
                      )}
                      <TextInput
                        style={styles.replyTextInput}
                        placeholder={
                          selectedTicket.status === 'resolved'
                            ? 'Explain what still needs attention to reopen this ticket...'
                            : 'Write your reply or clarification...'
                        }
                        placeholderTextColor="#94A3B8"
                        multiline
                        numberOfLines={3}
                        value={replyMessage}
                        onChangeText={setReplyMessage}
                        editable={!isSendingReply}
                      />
                      <View style={styles.replyBtnRow}>
                        <Button
                          label={
                            isSendingReply
                              ? 'Sending...'
                              : selectedTicket.status === 'resolved'
                              ? 'Reply & Reopen Ticket'
                              : 'Send Reply'
                          }
                          variant="primary"
                          size="sm"
                          leftIcon={<Send size={14} color="#FFFFFF" />}
                          loading={isSendingReply}
                          disabled={!replyMessage.trim() || isSendingReply}
                          onPress={handleSendRequesterReply}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.closedCard}>
                      <CheckCircle2 size={16} color="#64748B" />
                      <AppText style={styles.closedCardText}>
                        This support inquiry is closed. If you require further assistance, please submit a new ticket.
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
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#EAEFEA',
    borderRadius: Radius.lg,
    padding: 4,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  formCard: {
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 16,
    gap: 14,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
  },
  formSubtitle: {
    lineHeight: 18,
    marginTop: -4,
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: Radius.sm,
    borderColor: '#FECACA',
    borderWidth: 1,
  },
  alertErrorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: Radius.sm,
    borderColor: '#C8E6C9',
    borderWidth: 1,
  },
  alertSuccessText: {
    fontSize: 12,
    color: '#18794E',
    fontWeight: '600',
    flex: 1,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  textInput: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  ticketsContainer: {
    gap: 12,
  },
  statusFilterBar: {
    flexDirection: 'row',
  },
  statusPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  statusPillTextActive: {
    color: '#FFFFFF',
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
    marginTop: 4,
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  ticketCardsList: {
    gap: 10,
  },
  ticketCard: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 14,
    gap: 8,
  },
  ticketCardActionRequired: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    backgroundColor: '#FFFBEB',
  },
  actionRequiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  actionRequiredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refTag: {
    backgroundColor: '#0F2922',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  refTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ticketDate: {
    fontSize: 11,
    color: '#64748B',
  },
  ticketSubjectText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  ticketSnippet: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginTop: 2,
  },
  footerCategoryPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  footerCategoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messagesCountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAF9',
  },
  modalHeaderInfo: {
    flex: 1,
    gap: 6,
    marginRight: 12,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalMessagesScroll: {
    padding: 16,
  },
  modalClubNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 14,
  },
  modalClubNoticeText: {
    fontSize: 12,
    color: Colors.brand.primary,
    fontWeight: '600',
  },
  threadContainer: {
    gap: 12,
    marginBottom: 20,
  },
  chatBubble: {
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 6,
  },
  chatBubbleUser: {
    backgroundColor: '#F8FAF9',
    borderColor: '#E2E8F0',
    alignSelf: 'flex-end',
    width: '90%',
  },
  chatBubbleAdmin: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    alignSelf: 'flex-start',
    width: '90%',
  },
  chatBubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  senderBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  senderBadgeUser: {
    backgroundColor: '#E2E8F0',
  },
  senderBadgeAdmin: {
    backgroundColor: '#18794E',
  },
  senderBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  senderBadgeTextUser: {
    color: '#334155',
  },
  senderBadgeTextAdmin: {
    color: '#FFFFFF',
  },
  chatTimestamp: {
    fontSize: 10,
    color: '#64748B',
  },
  chatMessageText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  replyBox: {
    padding: 14,
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    marginBottom: 40,
  },
  replyBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2922',
  },
  replyTextInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  replyBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    marginBottom: 40,
  },
  closedCardText: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
  },
  clubContextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  clubContextBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  senderBadgeStaff: {
    backgroundColor: '#0284C7',
  },
  senderBadgeTextStaff: {
    color: '#FFFFFF',
  },
  resolvedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  resolvedNoticeText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 16,
    flex: 1,
    fontWeight: '500',
  },
});

