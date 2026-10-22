/**
 * Aught2 Pickleball — Club Help & Support Screen
 *
 * Standalone screen reachable from:
 *   - The side-menu "Help & Support" item for owner, manager, and tournament director
 *   - The Profile screen "Help & Support" row
 *
 * Back navigation returns to whichever screen opened it.
 */
import React from 'react';
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
  Phone,
} from 'lucide-react-native';

import { AppText } from '@/components';

const FAQS = [
  {
    id: '1',
    question: 'How do I add or manage courts?',
    answer:
      'Go to Courts in the side menu to add, edit, or deactivate courts. Set available hours and pricing per court.',
  },
  {
    id: '2',
    question: 'How do I manage club memberships?',
    answer:
      'Open Memberships from the side menu to view plans, approve or reject member requests, and configure subscription tiers.',
  },
  {
    id: '3',
    question: 'How do I create a tournament?',
    answer:
      'Navigate to Tournaments and tap the + button. Set format, dates, draw size, registration deadline, and prize structure.',
  },
  {
    id: '4',
    question: 'How do I manage staff permissions?',
    answer:
      'Go to Members and filter by staff role. Assign manager or tournament director roles from the member detail screen.',
  },
  {
    id: '5',
    question: 'How do I export booking or payment reports?',
    answer:
      'Contact platform support to request custom data exports. In-app report export is on the product roadmap.',
  },
];

const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null;
const supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE?.trim() || null;

export default function ClubHelpSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(club)/' as any);
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
            <AppText style={styles.heroTitle}>Club Operations Support</AppText>
            <AppText style={styles.heroSubtitle}>
              Need help with courts, memberships, tournaments, or club settings? We are here to help.
            </AppText>
          </View>
        </View>

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
              <Mail size={18} color="#176B57" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Email Support</AppText>
              <AppText style={styles.contactValue}>Contact platform support via your administration portal</AppText>
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
              <Phone size={18} color="#176B57" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Phone</AppText>
              <AppText style={styles.contactValue}>{supportPhone}</AppText>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.contactRow}>
            <View style={styles.contactIcon}>
              <Phone size={18} color="#176B57" strokeWidth={2} />
            </View>
            <View style={styles.contactText}>
              <AppText style={styles.contactLabel}>Platform Support</AppText>
              <AppText style={styles.contactValue}>Support hours: Mon–Fri, 9 AM – 6 PM</AppText>
            </View>
          </View>
        )}

        <View style={styles.contactRow}>
          <View style={styles.contactIcon}>
            <MessageCircle size={18} color="#176B57" strokeWidth={2} />
          </View>
          <View style={styles.contactText}>
            <AppText style={styles.contactLabel}>Club Operations</AppText>
            <AppText style={styles.contactValue}>Facility management support</AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F8F5' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#F3F8F5',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDEA',
  },
  backBtn: { padding: 6 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F2922',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 34 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 20 },

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

  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#647570',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },

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
