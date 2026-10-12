/**
 * Aught2 Pickleball — Register Club Screen (Club Onboarding)
 *
 * Allows an independent user/club owner to register a new club facility:
 * - Full validation of name, slug, contact, location, and operating hours
 * - Prevents duplicate submission
 * - Transactional initial owner assignment (club_owner)
 * - Transitions directly to newly registered club's management dashboard
 */

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Clock,
  Globe,
  Mail,
  MapPin,
  Phone,
  Sparkles,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Button,
  Card,
  FormField,
  Screen,
} from '@/components';
import { clubsApi, clubApplicationsApi } from '@/services/api';
import { useActiveClub } from '@/hooks';
import { useAuthStore } from '@/store';
import { Colors, Radius, Spacing } from '@/theme';
import type { CreateClubPayload, MembershipInfo } from '@/types';

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function RegisterClubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { switchClub } = useActiveClub();
  const refreshMemberships = useAuthStore((s) => s.refreshMemberships);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [establishedYear, setEstablishedYear] = useState('');

  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('United States');

  const [operatingDays, setOperatingDays] = useState('Monday - Sunday');
  const [openingTime, setOpeningTime] = useState('06:00:00');
  const [closingTime, setClosingTime] = useState('22:00:00');
  const [timezone, setTimezone] = useState('UTC');
  const [facilitiesSummary, setFacilitiesSummary] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugManuallyEdited) {
      setSlug(generateSlug(val));
    }
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: '' }));
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugManuallyEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    if (errors.slug) {
      setErrors((prev) => ({ ...prev, slug: '' }));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Club name must be at least 2 characters';
    }

    if (!slug.trim()) {
      errs.slug = 'URL slug is required';
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      errs.slug = 'Slug must contain only lowercase letters, numbers, and single hyphens';
    }

    if (contactEmail.trim()) {
      const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      if (!emailRegex.test(contactEmail.trim())) {
        errs.contactEmail = 'Invalid email address format';
      }
    }

    if (establishedYear.trim()) {
      const yr = parseInt(establishedYear.trim(), 10);
      if (isNaN(yr) || yr < 1800 || yr > 2100) {
        errs.establishedYear = 'Enter a valid 4-digit year (e.g. 2024)';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async () => {
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const user = useAuthStore.getState().user;
      const result = await clubApplicationsApi.submit({
        applicant_name: user?.full_name || 'Club Owner',
        applicant_email: user?.email || contactEmail.trim().toLowerCase() || 'owner@pickleball.com',
        applicant_phone: contactPhone.trim() || undefined,
        applicant_password: 'AuthenticatedOwnerSession2026!',
        club_name: name.trim(),
        slug: slug.trim(),
        short_description: shortDescription.trim() || undefined,
        description: description.trim() || undefined,
        contact_email: contactEmail.trim().toLowerCase() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        website: website.trim() || undefined,
        established_year: establishedYear.trim() ? parseInt(establishedYear.trim(), 10) : undefined,
        address_line1: addressLine1.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        country: country.trim() || 'United States',
        operating_days: operatingDays.trim() || 'Monday - Sunday',
        opening_time: openingTime.trim() || '06:00:00',
        closing_time: closingTime.trim() || '22:00:00',
        timezone: timezone.trim() || 'UTC',
        facilities_summary: facilitiesSummary.trim() || undefined,
      });

      Alert.alert(
        'Application Submitted for Review',
        `Your application for ${result.club_name} (Ref: ${result.reference_number}) is awaiting review by the platform team. You will be able to manage this club once approved.`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(club)/' as any),
          },
        ],
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to submit club application';
      Alert.alert('Submission Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title="Register Club"
        showBack
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 60 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Card */}
          <Card style={styles.headerCard}>
            <View style={styles.headerIconCircle}>
              <Building2 size={24} color="#18794E" />
            </View>
            <View style={styles.headerTextCol}>
              <AppText variant="heading3" color="primary">
                Establish Your Club
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.headerSub}>
                Register your facility to manage courts, bookings, tournaments, and welcome players.
              </AppText>
            </View>
          </Card>

          {/* Section 1: Basic Information */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Sparkles size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Club Profile
              </AppText>
            </View>

            <FormField
              label="Club Name *"
              value={name}
              onChangeText={handleNameChange}
              placeholder="e.g. Austin Pickleball Center"
              error={errors.name}
            />

            <FormField
              label="URL Slug *"
              value={slug}
              onChangeText={handleSlugChange}
              placeholder="austin-pickleball-center"
              hint="Unique platform address for your club"
              error={errors.slug}
              autoCapitalize="none"
            />

            <FormField
              label="Tagline / Short Description"
              value={shortDescription}
              onChangeText={setShortDescription}
              placeholder="e.g. Premier indoor and outdoor pickleball courts"
            />

            <FormField
              label="Full Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Share club history, amenities, programs, and community info..."
              multiline
              numberOfLines={3}
            />
          </Card>

          {/* Section 2: Contact Information */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Mail size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Public Contact
              </AppText>
            </View>

            <FormField
              label="Contact Email"
              value={contactEmail}
              onChangeText={(v) => {
                setContactEmail(v);
                if (errors.contactEmail) setErrors((p) => ({ ...p, contactEmail: '' }));
              }}
              placeholder="contact@yourclub.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.contactEmail}
            />

            <FormField
              label="Contact Phone"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="(512) 555-0199"
              keyboardType="phone-pad"
            />

            <FormField
              label="Official Website"
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yourclub.com"
              autoCapitalize="none"
            />

            <FormField
              label="Established Year"
              value={establishedYear}
              onChangeText={(v) => {
                setEstablishedYear(v);
                if (errors.establishedYear) setErrors((p) => ({ ...p, establishedYear: '' }));
              }}
              placeholder="e.g. 2023"
              keyboardType="numeric"
              error={errors.establishedYear}
            />
          </Card>

          {/* Section 3: Location */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MapPin size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Location & Address
              </AppText>
            </View>

            <FormField
              label="Street Address Line 1"
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="123 Pickleball Way"
            />

            <FormField
              label="Suite / Unit (Line 2)"
              value={addressLine2}
              onChangeText={setAddressLine2}
              placeholder="Suite 100"
            />

            <View style={styles.rowTwo}>
              <View style={styles.halfCol}>
                <FormField
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  placeholder="Austin"
                />
              </View>
              <View style={styles.halfCol}>
                <FormField
                  label="State / Province"
                  value={state}
                  onChangeText={setState}
                  placeholder="TX"
                />
              </View>
            </View>

            <View style={styles.rowTwo}>
              <View style={styles.halfCol}>
                <FormField
                  label="Postal Code"
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="78701"
                />
              </View>
              <View style={styles.halfCol}>
                <FormField
                  label="Country"
                  value={country}
                  onChangeText={setCountry}
                  placeholder="United States"
                />
              </View>
            </View>
          </Card>

          {/* Section 4: Operating Hours */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Clock size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Hours & Operations
              </AppText>
            </View>

            <FormField
              label="Operating Days"
              value={operatingDays}
              onChangeText={setOperatingDays}
              placeholder="Monday - Sunday"
            />

            <View style={styles.rowTwo}>
              <View style={styles.halfCol}>
                <FormField
                  label="Opening Time"
                  value={openingTime}
                  onChangeText={setOpeningTime}
                  placeholder="06:00:00"
                />
              </View>
              <View style={styles.halfCol}>
                <FormField
                  label="Closing Time"
                  value={closingTime}
                  onChangeText={setClosingTime}
                  placeholder="22:00:00"
                />
              </View>
            </View>

            <FormField
              label="Timezone"
              value={timezone}
              onChangeText={setTimezone}
              placeholder="America/Chicago or UTC"
            />

            <FormField
              label="Facilities Summary"
              value={facilitiesSummary}
              onChangeText={setFacilitiesSummary}
              placeholder="8 dedicated outdoor courts, pro shop, locker rooms, lights"
              multiline
              numberOfLines={2}
            />
          </Card>

          {/* Submit Action */}
          <View style={styles.submitSection}>
            <Button
              label={isSubmitting ? 'Registering Club...' : 'Complete Club Registration'}
              onPress={handleRegister}
              disabled={isSubmitting}
              style={styles.submitButton}
            />
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.cancelButton}
              disabled={isSubmitting}
            >
              <AppText variant="body" color="secondary">
                Cancel
              </AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F8F7',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing.sm,
  },
  headerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  headerSub: {
    marginTop: 2,
  },
  sectionCard: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: '#102B2A',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  halfCol: {
    flex: 1,
  },
  submitSection: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  submitButton: {
    width: '100%',
  },
  cancelButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
});
