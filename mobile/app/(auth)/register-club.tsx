/**
 * Aught2 Pickleball — Public Club Registration Screen (Pre-Login)
 *
 * Allows a prospective club facility owner to apply to register their facility:
 * - Completely accessible BEFORE logging in
 * - No staff role selection or privileged controls exposed
 * - Validates club & applicant details on frontend and backend
 * - Submits application with status 'pending'
 * - Navigates to confirmation & status screen upon submission
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
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  User,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Button,
  Card,
  FormField,
  Screen,
} from '@/components';
import { clubApplicationsApi, type SubmitClubApplicationPayload } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function PublicRegisterClubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Applicant account info
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantPassword, setApplicantPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Club facility info
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [establishedYear, setEstablishedYear] = useState('');

  // Location info
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('United States');

  // Operating info
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
    const nextErrors: Record<string, string> = {};

    // Applicant validations
    if (!applicantName.trim()) {
      nextErrors.applicantName = 'Applicant full name is required';
    }
    if (!applicantEmail.trim()) {
      nextErrors.applicantEmail = 'Applicant email is required';
    } else if (!applicantEmail.includes('@') || !applicantEmail.includes('.')) {
      nextErrors.applicantEmail = 'Enter a valid email address';
    }
    if (!applicantPassword) {
      nextErrors.applicantPassword = 'Password is required to create your account';
    } else if (applicantPassword.length < 8) {
      nextErrors.applicantPassword = 'Password must be at least 8 characters';
    }

    // Club validations
    if (!name.trim()) {
      nextErrors.name = 'Club name is required';
    } else if (name.trim().length < 2) {
      nextErrors.name = 'Club name must be at least 2 characters';
    }

    if (!slug.trim()) {
      nextErrors.slug = 'URL slug is required';
    } else if (slug.length < 2) {
      nextErrors.slug = 'Slug must be at least 2 characters';
    }

    if (establishedYear.trim()) {
      const year = parseInt(establishedYear.trim(), 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1850 || year > currentYear + 1) {
        nextErrors.establishedYear = `Enter a valid year between 1850 and ${currentYear + 1}`;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert('Validation Error', 'Please correct the highlighted fields before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: SubmitClubApplicationPayload = {
        applicant_name: applicantName.trim(),
        applicant_email: applicantEmail.trim().toLowerCase(),
        applicant_phone: applicantPhone.trim() || undefined,
        applicant_password: applicantPassword,

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
      };

      const result = await clubApplicationsApi.submit(payload);

      // Navigate to confirmation & status screen with application details
      router.replace({
        pathname: '/(auth)/club-application-status',
        params: {
          reference_number: result.reference_number,
          email: result.applicant_email,
          newly_submitted: '1',
        },
      } as any);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to submit club application.';
      Alert.alert('Submission Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title="Register a Club"
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
                Club Facility Application
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.headerSub}>
                Submit your club details for review by the Aught2 Pickleball team. Once approved, you will be able to manage courts, bookings, tournaments, and members.
              </AppText>
            </View>
          </Card>

          {/* Section 1: Applicant Account */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <User size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Applicant Details
              </AppText>
            </View>
            <AppText variant="caption" color="secondary" style={styles.sectionNotice}>
              These credentials will become your login once your facility is approved.
            </AppText>

            <FormField
              label="Full Name *"
              value={applicantName}
              onChangeText={(val) => {
                setApplicantName(val);
                if (errors.applicantName) setErrors((prev) => ({ ...prev, applicantName: '' }));
              }}
              placeholder="e.g. Jane Doe"
              error={errors.applicantName}
            />

            <FormField
              label="Email Address *"
              value={applicantEmail}
              onChangeText={(val) => {
                setApplicantEmail(val);
                if (errors.applicantEmail) setErrors((prev) => ({ ...prev, applicantEmail: '' }));
              }}
              placeholder="jane@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.applicantEmail}
            />

            <FormField
              label="Phone Number"
              value={applicantPhone}
              onChangeText={setApplicantPhone}
              placeholder="(555) 000-0000"
              keyboardType="phone-pad"
            />

            <View style={styles.passwordContainer}>
              <FormField
                label="Create Password *"
                value={applicantPassword}
                onChangeText={(val) => {
                  setApplicantPassword(val);
                  if (errors.applicantPassword) setErrors((prev) => ({ ...prev, applicantPassword: '' }));
                }}
                placeholder="At least 8 characters"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                hint="Used to access your club dashboard after approval"
                error={errors.applicantPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                activeOpacity={0.7}
              >
                {showPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
              </TouchableOpacity>
            </View>
          </Card>

          {/* Section 2: Club Profile */}
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
              hint="Unique web address identifier for your facility"
              error={errors.slug}
              autoCapitalize="none"
            />

            <FormField
              label="Tagline / Short Summary"
              value={shortDescription}
              onChangeText={setShortDescription}
              placeholder="Premier indoor pickleball facility in Austin"
            />

            <FormField
              label="Full Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Tell players about your facility, courts, amenities, and community..."
              multiline
              numberOfLines={4}
            />

            <FormField
              label="Established Year"
              value={establishedYear}
              onChangeText={setEstablishedYear}
              placeholder="e.g. 2023"
              keyboardType="numeric"
              error={errors.establishedYear}
            />
          </Card>

          {/* Section 3: Contact & Website */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Mail size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Club Contact
              </AppText>
            </View>

            <FormField
              label="Facility Email"
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="info@austinpickleball.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <FormField
              label="Facility Phone"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="(512) 555-0100"
              keyboardType="phone-pad"
            />

            <FormField
              label="Official Website"
              value={website}
              onChangeText={setWebsite}
              placeholder="https://austinpickleball.com"
              autoCapitalize="none"
            />
          </Card>

          {/* Section 4: Location */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MapPin size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Location
              </AppText>
            </View>

            <FormField
              label="Address Line 1"
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="1200 S Congress Ave"
            />

            <FormField
              label="Address Line 2"
              value={addressLine2}
              onChangeText={setAddressLine2}
              placeholder="Suite 100"
            />

            <View style={styles.row}>
              <View style={styles.rowCol}>
                <FormField
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  placeholder="Austin"
                />
              </View>
              <View style={styles.rowCol}>
                <FormField
                  label="State"
                  value={state}
                  onChangeText={setState}
                  placeholder="TX"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowCol}>
                <FormField
                  label="Postal Code"
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="78704"
                />
              </View>
              <View style={styles.rowCol}>
                <FormField
                  label="Country"
                  value={country}
                  onChangeText={setCountry}
                  placeholder="United States"
                />
              </View>
            </View>
          </Card>

          {/* Section 5: Operations */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Clock size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Operating Hours
              </AppText>
            </View>

            <FormField
              label="Operating Days"
              value={operatingDays}
              onChangeText={setOperatingDays}
              placeholder="Monday - Sunday"
            />

            <View style={styles.row}>
              <View style={styles.rowCol}>
                <FormField
                  label="Opening Time"
                  value={openingTime}
                  onChangeText={setOpeningTime}
                  placeholder="06:00:00"
                />
              </View>
              <View style={styles.rowCol}>
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
              placeholder="UTC"
            />

            <FormField
              label="Facilities Summary"
              value={facilitiesSummary}
              onChangeText={setFacilitiesSummary}
              placeholder="e.g. 8 indoor cushioned courts, pro shop, locker rooms, lounge"
            />
          </Card>

          {/* Submit Action */}
          <View style={styles.submitContainer}>
            <Button
              testID="submit-application-button"
              label={isSubmitting ? 'Submitting Application...' : 'Submit Club Application'}
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
            <AppText variant="caption" color="secondary" center style={styles.legalNotice}>
              By submitting, you agree that your facility information will be reviewed by the Aught2 Pickleball platform team before activation.
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    gap: Spacing[4],
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing[4],
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: Radius.lg,
    gap: Spacing[3],
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerTextCol: {
    flex: 1,
    gap: 4,
  },
  headerSub: {
    lineHeight: 18,
    color: '#334155',
  },
  sectionCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingBottom: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 16,
  },
  sectionNotice: {
    color: '#64748B',
    fontSize: 12,
    marginTop: -4,
  },
  passwordContainer: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 36,
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  rowCol: {
    flex: 1,
  },
  submitContainer: {
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  legalNotice: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: Spacing[4],
  },
});
