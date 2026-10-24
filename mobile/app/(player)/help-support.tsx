/**
 * Aught2 Pickleball — Player Help & Support Screen
 *
 * Standalone screen reachable from:
 *   - The side-menu "Help & Support" item  (direct, no Profile first)
 *   - The Profile screen "Help & Support" card (router.push)
 *
 * Back navigation returns to whichever screen opened it.
 */
import React, { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  HelpCircle,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
} from 'lucide-react-native';

import { AppText, RequesterSupportSection } from '@/components';

// FAQ data — single source of truth, same content previously in the Profile modal
const FAQS = [
  {
    id: '1',
    question: 'How do I book a court?',
    answer:
      "Tap the center '+' button or visit Courts in the navigation bar to select a date, time slot, and court.",
  },
  {
    id: '2',
    question: 'How do I join tournaments and events?',
    answer:
      'Go to the Events tab to discover upcoming club tournaments, clinics, and open play sessions.',
  },
  {
    id: '3',
    question: 'How do I manage my membership?',
    answer:
      'Open My Memberships from the side menu to view your active plans, renewal dates, and payment history.',
  },
  {
    id: '4',
    question: 'How do I cancel a court booking?',
    answer:
      'Go to My Bookings, tap the booking you want to cancel, and select Cancel Booking. Cancellation policies vary by club.',
  },
  {
    id: '5',
    question: 'I cannot log in. What should I do?',
    answer:
      'Use the Forgot Password link on the login screen. If the issue persists, contact platform support or your club reception.',
  },
];

const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null;
const supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE?.trim() || null;

export default function PlayerHelpSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mainTab, setMainTab] = useState<'tickets' | 'faqs'>('tickets');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(player)/' as any);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
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
        <AppText style={styles.headerTitle}>Help & Support</AppText>
        {/* Spacer to balance the back button */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <HelpCircle size={28} color="#176B57" strokeWidth={2} />
          </View>
          <View style={styles.heroText}>
            <AppText style={styles.heroTitle}>Pickleball Support</AppText>
            <AppText style={styles.heroSubtitle}>
              Need help with bookings, memberships, or platform assistance? Track your inquiries below.
            </AppText>
          </View>
        </View>

        {/* Main Tab Toggle: Support Tickets vs FAQs & Contact */}
        <View style={styles.mainNavTabs}>
          <TouchableOpacity
            style={[styles.mainNavTab, mainTab === 'tickets' && styles.mainNavTabActive]}
            onPress={() => setMainTab('tickets')}
            activeOpacity={0.8}
          >
            <MessageSquare size={16} color={mainTab === 'tickets' ? '#176B57' : '#64748B'} />
            <AppText style={[styles.mainNavTabText, mainTab === 'tickets' && styles.mainNavTabTextActive]}>
              Support Tickets
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainNavTab, mainTab === 'faqs' && styles.mainNavTabActive]}
            onPress={() => setMainTab('faqs')}
            activeOpacity={0.8}
          >
            <HelpCircle size={16} color={mainTab === 'faqs' ? '#176B57' : '#64748B'} />
            <AppText style={[styles.mainNavTabText, mainTab === 'faqs' && styles.mainNavTabTextActive]}>
              FAQs & Contact Desk
            </AppText>
          </TouchableOpacity>
        </View>

        {mainTab === 'tickets' ? (
          <RequesterSupportSection mode="player" />
        ) : (
          <>
            {/* FAQs */}
            <AppText style={styles.sectionLabel}>Frequently Asked Questions</AppText>
            {FAQS.map((faq) => (
              <View key={faq.id} style={styles.faqCard}>
                <AppText style={styles.faqQuestion}>{faq.question}</AppText>
                <AppText style={styles.faqAnswer}>{faq.answer}</AppText>
              </View>
            ))}

            {/* Contact */}
            <AppText style={styles.sectionLabel}>Contact Support</AppText>

        {supportEmail ? (
          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
            activeOpacity={0.75}
            accessibilityLabel={`Email support at ${supportEmail}`}
            accessibilityRole="button"
          >
            <View style={styles.contactIcon}>
              <Mail size={18} color="#176B57" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Email</AppText>
              <AppText style={styles.contactValue}>{supportEmail}</AppText>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.contactRow}>
            <View style={styles.contactIcon}>
              <Mail size={18} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Email Support</AppText>
              <AppText style={styles.contactValue}>Contact support via your club reception</AppText>
            </View>
          </View>
        )}

        {supportPhone ? (
          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL(`tel:${supportPhone.replace(/[^+\d]/g, '')}`)}
            activeOpacity={0.75}
            accessibilityLabel={`Call support at ${supportPhone}`}
            accessibilityRole="button"
          >
            <View style={styles.contactIcon}>
              <Phone size={18} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Phone</AppText>
              <AppText style={styles.contactValue}>{supportPhone}</AppText>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.contactRow}>
            <View style={styles.contactIcon}>
              <Phone size={18} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Club Desk</AppText>
              <AppText style={styles.contactValue}>Inquire at your facility reception desk</AppText>
            </View>
          </View>
        )}

            <View style={styles.contactRow}>
              <View style={styles.contactIcon}>
                <MessageCircle size={18} color="#114D3F" strokeWidth={2} />
              </View>
              <View style={styles.contactText}>
                <AppText style={styles.contactLabel}>Club Assistance</AppText>
                <AppText style={styles.contactValue}>Staff available during facility operating hours</AppText>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF9' },

  mainNavTabs: {
    flexDirection: 'row',
    backgroundColor: '#E8EDEA',
    borderRadius: 14,
    padding: 4,
    gap: 6,
    marginBottom: 20,
  },
  mainNavTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  mainNavTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  mainNavTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  mainNavTabTextActive: {
    color: '#176B57',
    fontWeight: '700',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F8FAF9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2ECE7',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2ECE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#102B2A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 38 }, // mirrors backBtn width

  /* Scroll */
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 20, gap: 0 },

  /* Hero */
  heroCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 16,
    marginBottom: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#647570',
    lineHeight: 18,
  },

  /* Section label */
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#647570',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },

  /* FAQ cards */
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDEA',
  },
  faqQuestion: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 5,
  },
  faqAnswer: {
    fontSize: 12.5,
    color: '#647570',
    lineHeight: 18,
  },

  /* Contact rows */
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    gap: 14,
  },
  contactIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactText: { flex: 1 },
  contactLabel: {
    fontSize: 11.5,
    color: '#647570',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F2922',
  },
});
