/**
 * Aught2 Pickleball — Player Help & Support Screen
 *
 * Provides:
 * - Dynamic category-based FAQs and Help Articles (Bookings, Payments, Memberships, Tournaments, Lessons, Account)
 * - Search across all support content
 * - Expandable FAQ accordion & Article Reader Modal
 * - Integrated Support Ticket tracking & submission via RequesterSupportSection
 * - Quick links to Player Terms of Service & Privacy Policy matching Profile setting cards
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Search,
  Shield,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { RequesterSupportSection } from '@/components/support/RequesterSupportSection';
import {
  FAQItem,
  HelpArticleItem,
  HelpCategoryItem,
  helpApi,
} from '@/services/api';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export default function PlayerHelpSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'faqs' | 'tickets'>('faqs');
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<HelpCategoryItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [articles, setArticles] = useState<HelpArticleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  // Article viewer modal
  const [selectedArticle, setSelectedArticle] = useState<HelpArticleItem | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(player)/profile' as any);
    }
  };

  // Load categories and initial FAQs / Articles
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const [catsRes, faqsRes, artsRes] = await Promise.all([
          helpApi.getCategories('player'),
          helpApi.getFaqs({ audience: 'player' }),
          helpApi.getArticles({ audience: 'player' }),
        ]);

        if (isMounted) {
          setCategories(catsRes || []);
          setFaqs(faqsRes.items || []);
          setArticles(artsRes.items || []);
        }
      } catch (err) {
        console.warn('Failed to load help content:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filtered FAQs based on category & search
  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesCategory = !selectedCategoryId || faq.category_id === selectedCategoryId;
      const matchesQuery =
        !searchQuery.trim() ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [faqs, selectedCategoryId, searchQuery]);

  // Filtered Articles based on category & search
  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const matchesCategory = !selectedCategoryId || art.category_id === selectedCategoryId;
      const matchesQuery =
        !searchQuery.trim() ||
        art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [articles, selectedCategoryId, searchQuery]);

  const toggleFaq = (id: string) => {
    setExpandedFaqId((prev) => (prev === id ? null : id));
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back to Profile"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color="#0F2922" strokeWidth={2.2} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>Help & Support</AppText>
        <View style={styles.headerSpacer} />
      </View>

      {/* Segmented Control: FAQs & Guides vs Support Tickets */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'faqs' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('faqs')}
          activeOpacity={0.8}
        >
          <HelpCircle
            size={15}
            color={activeTab === 'faqs' ? '#114D3F' : '#64748B'}
            strokeWidth={2}
          />
          <AppText style={[styles.segmentText, activeTab === 'faqs' && styles.segmentTextActive]}>
            FAQs & Guides
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'tickets' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('tickets')}
          activeOpacity={0.8}
        >
          <MessageSquare
            size={15}
            color={activeTab === 'tickets' ? '#114D3F' : '#64748B'}
            strokeWidth={2}
          />
          <AppText style={[styles.segmentText, activeTab === 'tickets' && styles.segmentTextActive]}>
            Support Tickets
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      {activeTab === 'tickets' ? (
        <View style={styles.ticketsContainer}>
          <RequesterSupportSection mode="player" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Direct Assistance Compact Info Section */}
          <View style={styles.assistanceCard}>
            <View style={styles.assistanceIconWrap}>
              <LifeBuoy size={18} color="#114D3F" strokeWidth={2.2} />
            </View>
            <View style={styles.assistanceTextWrap}>
              <AppText style={styles.assistanceTitle}>Need Direct Assistance?</AppText>
              <AppText style={styles.assistanceSubtitle}>
                Our support team is here to help with your account, bookings, and payments.
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.assistanceBtn}
              onPress={() => setActiveTab('tickets')}
              activeOpacity={0.8}
            >
              <AppText style={styles.assistanceBtnText}>Get Help</AppText>
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <Search size={16} color="#64748B" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search questions, articles, topics..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Categories Pill Selector */}
          <View style={styles.categoriesSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPills}
            >
              <TouchableOpacity
                style={[styles.categoryPill, selectedCategoryId === null && styles.categoryPillActive]}
                onPress={() => setSelectedCategoryId(null)}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.categoryPillText,
                    selectedCategoryId === null && styles.categoryPillTextActive,
                  ]}
                >
                  All Topics
                </AppText>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryPill,
                    selectedCategoryId === cat.id && styles.categoryPillActive,
                  ]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  activeOpacity={0.7}
                >
                  <AppText
                    style={[
                      styles.categoryPillText,
                      selectedCategoryId === cat.id && styles.categoryPillTextActive,
                    ]}
                  >
                    {cat.name}
                  </AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#114D3F" />
              <AppText style={styles.loadingText}>Loading support content...</AppText>
            </View>
          ) : (
            <>
              {/* Frequently Asked Questions */}
              <View style={styles.sectionHeader}>
                <HelpCircle size={16} color="#114D3F" strokeWidth={2.2} />
                <AppText style={styles.sectionTitle}>Frequently Asked Questions</AppText>
                <Badge variant="default" label={String(filteredFaqs.length)} />
              </View>

              {filteredFaqs.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <AppText style={styles.emptyCardText}>
                    No FAQs found matching your criteria. Try adjusting your search.
                  </AppText>
                </Card>
              ) : (
                <View style={styles.faqsList}>
                  {filteredFaqs.map((faq) => {
                    const isExpanded = expandedFaqId === faq.id;
                    return (
                      <View key={faq.id} style={styles.faqItem}>
                        <TouchableOpacity
                          style={styles.faqHeader}
                          onPress={() => toggleFaq(faq.id)}
                          activeOpacity={0.7}
                        >
                          <AppText style={styles.faqQuestion}>{faq.question}</AppText>
                          {isExpanded ? (
                            <ChevronDown size={18} color="#114D3F" strokeWidth={2.2} />
                          ) : (
                            <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
                          )}
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.faqBody}>
                            <AppText style={styles.faqAnswer}>{faq.answer}</AppText>
                            {faq.category_name && (
                              <View style={styles.faqFooter}>
                                <Badge variant="success" label={faq.category_name} />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Help Articles & Guides */}
              <View style={[styles.sectionHeader, { marginTop: 22 }]}>
                <BookOpen size={16} color="#114D3F" strokeWidth={2.2} />
                <AppText style={styles.sectionTitle}>Help Articles & Guides</AppText>
                <Badge variant="default" label={String(filteredArticles.length)} />
              </View>

              {filteredArticles.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <AppText style={styles.emptyCardText}>
                    No articles found matching your criteria.
                  </AppText>
                </Card>
              ) : (
                <View style={styles.articlesList}>
                  {filteredArticles.map((article) => (
                    <TouchableOpacity
                      key={article.id}
                      style={styles.articleCard}
                      onPress={() => setSelectedArticle(article)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.articleCardHeader}>
                        <AppText style={styles.articleTitle}>{article.title}</AppText>
                        <ChevronRight size={16} color="#94A3B8" />
                      </View>
                      <AppText style={styles.articleSnippet} numberOfLines={2}>
                        {article.content.replace(/#|\*|_|`/g, '').slice(0, 140)}...
                      </AppText>
                      <View style={styles.articleMeta}>
                        {article.category_name && (
                          <Badge variant="success" label={article.category_name} />
                        )}
                        <AppText style={styles.readArticleLink}>Read guide →</AppText>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Legal & Policy Quick Links (Styled exactly like Profile rows) */}
              <View style={styles.legalSection}>
                <AppText style={styles.legalHeading}>Legal & Policies</AppText>
                <View style={styles.legalList}>
                  <TouchableOpacity
                    style={styles.legalSettingCard}
                    onPress={() => router.push('/legal/player_terms' as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.legalIconCircle}>
                      <FileText size={20} color="#114D3F" strokeWidth={2} />
                    </View>
                    <View style={styles.legalTextColumn}>
                      <AppText style={styles.legalSettingTitle}>Terms of Service</AppText>
                      <AppText style={styles.legalSettingSub}>
                        Player terms, rules & policies
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.legalSettingCard}
                    onPress={() => router.push('/legal/privacy_policy' as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.legalIconCircle}>
                      <Shield size={20} color="#114D3F" strokeWidth={2} />
                    </View>
                    <View style={styles.legalTextColumn}>
                      <AppText style={styles.legalSettingTitle}>Privacy Policy</AppText>
                      <AppText style={styles.legalSettingSub}>
                        Data protection & user rights
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Article Reader Modal */}
      <Modal
        visible={!!selectedArticle}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedArticle(null)}
      >
        {selectedArticle && (
          <View style={styles.modalContainer}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedArticle(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#0F2922" />
              </TouchableOpacity>
              <AppText style={styles.modalHeaderTitle} numberOfLines={1}>
                {selectedArticle.title}
              </AppText>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 40 }]}
              showsVerticalScrollIndicator={false}
            >
              {selectedArticle.category_name && (
                <View style={styles.modalBadge}>
                  <Badge variant="success" label={selectedArticle.category_name} />
                </View>
              )}
              <AppText style={styles.modalArticleTitle}>{selectedArticle.title}</AppText>
              <AppText style={styles.modalArticleBody}>
                {selectedArticle.content.replace(/#|\*|_|`/g, '')}
              </AppText>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2922',
  },
  headerSpacer: {
    width: 36,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#114D3F',
    fontWeight: '700',
  },
  ticketsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  assistanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  assistanceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistanceTextWrap: {
    flex: 1,
  },
  assistanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  assistanceSubtitle: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 1,
    lineHeight: 15,
  },
  assistanceBtn: {
    backgroundColor: '#114D3F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assistanceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDEA',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F2922',
  },
  categoriesSection: {
    marginBottom: 14,
  },
  categoryPills: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillActive: {
    backgroundColor: '#114D3F',
    borderColor: '#114D3F',
  },
  categoryPillText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
    flex: 1,
  },
  emptyCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    marginBottom: 14,
  },
  emptyCardText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  faqsList: {
    gap: 8,
  },
  faqItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F2922',
    marginRight: 8,
    lineHeight: 19,
  },
  faqBody: {
    paddingHorizontal: 13,
    paddingBottom: 13,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  faqAnswer: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    marginTop: 8,
  },
  faqFooter: {
    marginTop: 8,
    flexDirection: 'row',
  },
  articlesList: {
    gap: 10,
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  articleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  articleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2922',
    flex: 1,
    marginRight: 8,
  },
  articleSnippet: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 8,
  },
  articleMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readArticleLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#114D3F',
  },
  legalSection: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8EDEA',
  },
  legalHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  legalList: {
    gap: 8,
  },
  legalSettingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  legalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  legalTextColumn: {
    flex: 1,
  },
  legalSettingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2922',
  },
  legalSettingSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: 16,
  },
  modalBadge: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  modalArticleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F2922',
    marginBottom: 12,
  },
  modalArticleBody: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
});
