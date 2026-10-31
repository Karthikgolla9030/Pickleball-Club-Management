/**
 * Aught2 Pickleball — Club Help & Support Screen
 *
 * Dedicated support page for club owners, managers, and staff:
 * - Dynamic category-based FAQs and Help Articles (Courts, Members, Staff Roles, Memberships, Payments, Tournaments, Leagues, Security)
 * - Search across all club operational guides
 * - Expandable FAQ accordion & Article Reader Modal
 * - Integrated Support Ticket tracking & submission via RequesterSupportSection (tenant-isolated to active club)
 * - Quick links to Club Terms of Service, Privacy Policy, and Club/Facility Agreement
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
  Building2,
  ChevronDown,
  ChevronRight,
  FileCheck,
  FileText,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Search,
  ShieldCheck,
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
import { useAuthStore } from '@/store';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export default function ClubHelpSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeMembership = useAuthStore((s) => s.activeMembership);

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
      router.replace('/(club)/' as any);
    }
  };

  // Load categories and FAQs / Articles for club audience
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const [catsRes, faqsRes, artsRes] = await Promise.all([
          helpApi.getCategories('club'),
          helpApi.getFaqs({ audience: 'club' }),
          helpApi.getArticles({ audience: 'club' }),
        ]);

        if (isMounted) {
          setCategories(catsRes || []);
          setFaqs(faqsRes.items || []);
          setArticles(artsRes.items || []);
        }
      } catch (err) {
        console.warn('Failed to load club help content:', err);
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
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color="#0F2922" strokeWidth={2.3} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <AppText style={styles.headerTitle}>Club Help & Support</AppText>
          {activeMembership?.club_name && (
            <AppText style={styles.headerClubName} numberOfLines={1}>
              {activeMembership.club_name}
            </AppText>
          )}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Segmented Control: Knowledge Base vs Support Tickets */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'faqs' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('faqs')}
          activeOpacity={0.8}
        >
          <BookOpen
            size={15}
            color={activeTab === 'faqs' ? '#114D3F' : '#64748B'}
            strokeWidth={2}
          />
          <AppText style={[styles.segmentText, activeTab === 'faqs' && styles.segmentTextActive]}>
            Knowledge Base
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
          <RequesterSupportSection
            mode="club"
            defaultClubId={activeMembership?.club_id || null}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Quick Ticket Submission CTA Banner */}
          <View style={styles.ctaBanner}>
            <View style={styles.ctaIconWrap}>
              <LifeBuoy size={24} color={Colors.brand.primary} />
            </View>
            <View style={styles.ctaTextWrap}>
              <AppText style={styles.ctaTitle}>Club Operations Support</AppText>
              <AppText style={styles.ctaSubtitle}>
                Get direct technical assistance for court bookings, staff access, payments, and tournaments.
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => setActiveTab('tickets')}
              activeOpacity={0.8}
            >
              <AppText style={styles.ctaButtonText}>Open Ticket</AppText>
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <Search size={18} color={Colors.text.secondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search club guides, rules, billing, staff..."
              placeholderTextColor={Colors.text.secondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={Colors.text.secondary} />
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
                  All Club Topics
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
              <ActivityIndicator size="small" color={Colors.brand.primary} />
              <AppText style={styles.loadingText}>Loading club help resources...</AppText>
            </View>
          ) : (
            <>
              {/* Frequently Asked Questions */}
              <View style={styles.sectionHeader}>
                <HelpCircle size={18} color={Colors.brand.primary} />
                <AppText style={styles.sectionTitle}>Club Operations FAQs</AppText>
                <Badge variant="default" label={String(filteredFaqs.length)} />
              </View>

              {filteredFaqs.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <AppText style={styles.emptyCardText}>
                    No club FAQs found matching your criteria.
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
                            <ChevronDown size={20} color={Colors.brand.primary} />
                          ) : (
                            <ChevronRight size={20} color={Colors.text.secondary} />
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

              {/* Help Articles & Operations Guides */}
              <View style={[styles.sectionHeader, { marginTop: Spacing[6] }]}>
                <BookOpen size={18} color={Colors.brand.primary} />
                <AppText style={styles.sectionTitle}>Operations Guides</AppText>
                <Badge variant="default" label={String(filteredArticles.length)} />
              </View>

              {filteredArticles.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <AppText style={styles.emptyCardText}>
                    No operations guides found matching your search.
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
                        <ChevronRight size={18} color={Colors.text.secondary} />
                      </View>
                      <AppText style={styles.articleSnippet} numberOfLines={2}>
                        {article.content.replace(/#|\*|_|`/g, '').slice(0, 140)}...
                      </AppText>
                      <View style={styles.articleMeta}>
                        {article.category_name && (
                          <Badge variant="success" label={article.category_name} />
                        )}
                        <AppText style={styles.readArticleLink}>Read guide</AppText>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Legal & Facility Agreements */}
              <View style={styles.legalSection}>
                <AppText style={styles.legalHeading}>Club Legal & Facility Agreements</AppText>
                <View style={styles.legalList}>
                  <TouchableOpacity
                    style={styles.legalCard}
                    onPress={() => router.push('/legal/club_terms' as any)}
                    activeOpacity={0.7}
                  >
                    <FileText size={20} color={Colors.brand.primary} />
                    <View style={styles.legalCardText}>
                      <AppText style={styles.legalCardTitle}>Club Terms of Service</AppText>
                      <AppText style={styles.legalCardSub}>Club operator platform terms and conditions</AppText>
                    </View>
                    <ChevronRight size={16} color={Colors.text.secondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.legalCard}
                    onPress={() => router.push('/legal/privacy_policy' as any)}
                    activeOpacity={0.7}
                  >
                    <ShieldCheck size={20} color={Colors.brand.primary} />
                    <View style={styles.legalCardText}>
                      <AppText style={styles.legalCardTitle}>Privacy Policy</AppText>
                      <AppText style={styles.legalCardSub}>Data protection and member confidentiality</AppText>
                    </View>
                    <ChevronRight size={16} color={Colors.text.secondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.legalCard}
                    onPress={() => router.push('/legal/club_agreement' as any)}
                    activeOpacity={0.7}
                  >
                    <FileCheck size={20} color={Colors.brand.primary} />
                    <View style={styles.legalCardText}>
                      <AppText style={styles.legalCardTitle}>Club / Facility Agreement</AppText>
                      <AppText style={styles.legalCardSub}>Facility onboarding & operational agreement</AppText>
                    </View>
                    <ChevronRight size={16} color={Colors.text.secondary} />
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
            <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedArticle(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={22} color={Colors.text.primary} />
              </TouchableOpacity>
              <AppText style={styles.modalHeaderTitle} numberOfLines={1}>
                {selectedArticle.title}
              </AppText>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 40 }]}
            >
              {selectedArticle.category_name && (
                <Badge variant="success" label={selectedArticle.category_name} />
              )}
              <AppText style={styles.modalArticleTitle}>{selectedArticle.title}</AppText>
              <AppText style={styles.modalArticleBody}>{selectedArticle.content}</AppText>
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
    backgroundColor: '#F7F9F8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[2],
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: '#0F2922',
  },
  headerClubName: {
    fontSize: Typography.size.xs,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.semibold,
  },
  headerSpacer: {
    width: 38,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: Spacing[4],
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
    paddingHorizontal: Spacing[4],
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing[4],
  },
  ctaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    gap: Spacing[3],
  },
  ctaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextWrap: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: '#065F46',
  },
  ctaSubtitle: {
    fontSize: Typography.size.xs,
    color: '#047857',
    marginTop: 2,
  },
  ctaButton: {
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
    borderRadius: Radius.md,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[3],
    height: 44,
    marginBottom: Spacing[4],
  },
  searchIcon: {
    marginRight: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
  },
  categoriesSection: {
    marginBottom: Spacing[4],
  },
  categoryPills: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  categoryPill: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryPillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  categoryPillText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
  loadingBox: {
    paddingVertical: Spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  loadingText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  sectionTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#E2E8F0',
  },
  emptyCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing[4],
  },
  emptyCardText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  faqsList: {
    gap: Spacing[2],
  },
  faqItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing[3],
  },
  faqQuestion: {
    flex: 1,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    marginRight: Spacing[2],
  },
  faqBody: {
    paddingHorizontal: Spacing[3],
    paddingBottom: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  faqAnswer: {
    fontSize: Typography.size.sm,
    color: '#475569',
    lineHeight: 20,
    marginTop: Spacing[2],
  },
  faqFooter: {
    marginTop: Spacing[2],
    flexDirection: 'row',
  },
  faqCatBadge: {
    alignSelf: 'flex-start',
  },
  articlesList: {
    gap: Spacing[3],
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  articleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  articleTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    flex: 1,
    marginRight: Spacing[2],
  },
  articleSnippet: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  articleMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  articleBadge: {
    alignSelf: 'flex-start',
  },
  readArticleLink: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.brand.primary,
  },
  legalSection: {
    marginTop: Spacing[6],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  legalHeading: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    textTransform: 'uppercase',
    color: Colors.text.secondary,
    letterSpacing: 0.8,
    marginBottom: Spacing[2],
  },
  legalList: {
    gap: Spacing[2],
  },
  legalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing[3],
  },
  legalCardText: {
    flex: 1,
  },
  legalCardTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  legalCardSub: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
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
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: Spacing[4],
  },
  modalBadge: {
    alignSelf: 'flex-start',
    marginBottom: Spacing[2],
  },
  modalArticleTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: Spacing[3],
  },
  modalArticleBody: {
    fontSize: Typography.size.base,
    color: '#334155',
    lineHeight: 24,
  },
});
