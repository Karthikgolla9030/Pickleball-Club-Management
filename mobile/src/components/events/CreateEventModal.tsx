/**
 * Aught2 Pickleball — Create / Edit Event Modal
 *
 * Full-featured modal sheet allowing club staff to create new events or
 * update existing event details, picture, schedule, capacity, and fee.
 *
 * Polished Information Architecture:
 * - Event Picture (Optional): Clean card with simplified header, resolved fallback preview,
 *   and concise source indicator ('Custom event picture', 'Club default', 'Platform default').
 * - Automatic Location: Retrieves the active club's saved address from Club Details automatically.
 *   Removes the redundant manual location text input.
 * - Date & Time: Refined input font size for comfortable, non-touching readability.
 * - Clean Category & Visibility: Compact, responsive button choices with clear active highlights.
 * - Comfortable Scroll Padding: Form scrolls completely above the sticky footer actions.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, MapPin, RotateCcw } from 'lucide-react-native';

import {
  AppText,
  Button,
  Card,
  DateTimePickerInput,
  Input,
  ModalSheet,
} from '@/components';
import {
  useClubDetails,
  useCreateClubEvent,
  usePlatformBanners,
  useUpdateClubEvent,
} from '@/hooks';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Radius, Spacing } from '@/theme';
import { resolveEventPictureDetails } from '@/utils/imageResolution';
import {
  EVENT_TYPE_LABELS,
  EVENT_VISIBILITY_LABELS,
  type ClubBranding,
  type ClubEvent,
  type CreateEventPayload,
  type EventType,
  type EventVisibility,
  type UpdateEventPayload,
} from '@/types';

export interface CreateEventModalProps {
  visible: boolean;
  clubId: string;
  clubBranding?: ClubBranding | null;
  eventToEdit?: ClubEvent | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateEventModal({
  visible,
  clubId,
  clubBranding,
  eventToEdit,
  onClose,
  onSuccess,
}: CreateEventModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [eventType, setEventType] = useState<EventType>('social');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [capacity, setCapacity] = useState('');
  const [fee, setFee] = useState('');

  const { club } = useClubDetails(clubId);
  const { banners: platformBanners } = usePlatformBanners();

  // Resolved active club address from Club Details Profile
  const clubAddress = useMemo(() => {
    if (!club) return '';
    const parts = [club.address_line1, club.city, club.state, club.country].filter(Boolean);
    return parts.join(', ') || club.name || '';
  }, [club]);

  const hasAddress = Boolean(
    club?.address_line1 || club?.city || (eventToEdit?.location && eventToEdit.location.trim())
  );
  const displayLocation = eventToEdit?.location || clubAddress || club?.name || 'Club Facility';

  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }, []);

  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(11, 0, 0, 0);
    return d.toISOString();
  }, []);

  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);

  const createEventMutation = useCreateClubEvent(clubId);
  const updateEventMutation = useUpdateClubEvent(clubId);

  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
      setCoverImageUrl(eventToEdit.cover_image_url || null);
      setEventType(eventToEdit.event_type || 'social');
      setVisibility(eventToEdit.visibility || 'public');
      setCapacity(eventToEdit.capacity ? String(eventToEdit.capacity) : '');
      setFee(eventToEdit.registration_fee ? String(eventToEdit.registration_fee) : '');
      setStartAt(eventToEdit.start_at || defaultStart);
      setEndAt(eventToEdit.end_at || defaultEnd);
    } else {
      setTitle('');
      setDescription('');
      setCoverImageUrl(null);
      setEventType('social');
      setVisibility('public');
      setCapacity('');
      setFee('');
      setStartAt(defaultStart);
      setEndAt(defaultEnd);
    }
  }, [eventToEdit, visible, defaultStart, defaultEnd]);

  // Image resolution priority: custom -> club default -> platform default -> built-in
  const resolvedCoverDetails = useMemo(() => {
    return resolveEventPictureDetails(
      coverImageUrl ? { cover_image_url: coverImageUrl } : eventToEdit,
      clubBranding,
      platformBanners
    );
  }, [coverImageUrl, eventToEdit, clubBranding, platformBanners]);

  const isCustomCover = Boolean(coverImageUrl);
  const coverSourceLabel = isCustomCover
    ? 'Custom event picture'
    : resolvedCoverDetails.level === 'club_default'
    ? 'Club default'
    : 'Platform default';

  const handlePickCover = async () => {
    if (!clubId) return;
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow gallery access to upload an event picture.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `event_cover_${Date.now()}.${ext}`;

        setIsUploadingCover(true);
        try {
          const uploadRes = await clubAssetsApi.uploadClubMedia(
            clubId,
            { uri: asset.uri, name: fileName, type: mime },
            'event_cover',
            'event',
          );
          setCoverImageUrl(uploadRes.public_url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload failed.';
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploadingCover(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to pick image.');
    }
  };

  const handleResetCover = () => {
    setCoverImageUrl(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Event title is required.');
      return;
    }

    if (!startAt || !endAt) {
      Alert.alert('Validation Error', 'Event start and end dates are required.');
      return;
    }

    if (new Date(startAt) >= new Date(endAt)) {
      Alert.alert('Validation Error', 'Event end time must be after the start time.');
      return;
    }

    // Associate the resolved club location automatically
    const resolvedEventLocation = eventToEdit
      ? eventToEdit.location || clubAddress || null
      : clubAddress || null;

    try {
      if (eventToEdit) {
        const payload: UpdateEventPayload = {
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverImageUrl || null,
          event_type: eventType,
          visibility,
          start_at: startAt,
          end_at: endAt,
          location: resolvedEventLocation,
          capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : null,
          registration_fee: fee.trim() ? parseFloat(fee.trim()) : 0,
        };

        await updateEventMutation.mutateAsync({ eventId: eventToEdit.id, payload });
        Alert.alert('Success', 'Event updated successfully.');
      } else {
        const payload: CreateEventPayload = {
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverImageUrl || null,
          event_type: eventType,
          visibility,
          start_at: startAt,
          end_at: endAt,
          location: resolvedEventLocation,
          capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : null,
          registration_fee: fee.trim() ? parseFloat(fee.trim()) : 0,
          registration_required: true,
        };

        await createEventMutation.mutateAsync(payload);
        Alert.alert('Success', 'Event created in Draft status.');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      Alert.alert('Error', msg);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={eventToEdit ? 'Edit Event' : 'Create New Event'}
      subtitle={
        eventToEdit
          ? 'Update event details, custom picture, and schedule.'
          : 'Set up a new social, clinic, or community event.'
      }
      actions={[
        {
          label: 'Cancel',
          variant: 'secondary',
          onPress: onClose,
        },
        {
          label: eventToEdit
            ? updateEventMutation.isPending
              ? 'Saving...'
              : 'Save Changes'
            : createEventMutation.isPending
            ? 'Creating...'
            : 'Create Draft Event',
          variant: 'primary',
          onPress: handleSave,
          loading: createEventMutation.isPending || updateEventMutation.isPending,
        },
      ]}
    >
      <View style={styles.formContainer}>
        {/* Event Title */}
        <Input
          label="Event Title *"
          placeholder="e.g. Summer Pickleball Social"
          value={title}
          onChangeText={setTitle}
        />

        {/* Description */}
        <Input
          label="Description"
          placeholder="Event details, schedule, format..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Event Picture (Optional) */}
        <Card style={styles.formAssetCard}>
          <View style={styles.formAssetHeader}>
            <View style={styles.formAssetHeaderTitleRow}>
              <ImageIcon size={16} color={Colors.brand.primary} />
              <AppText variant="caption" color="secondary" style={styles.formAssetHeaderLabel}>
                Event Picture (Optional)
              </AppText>
            </View>
          </View>

          <AppText variant="caption" color="tertiary" style={styles.formAssetDescription}>
            Uses your club's default event banner unless you upload a custom picture.
          </AppText>

          {/* Resolved Banner Preview */}
          <View style={styles.formAssetPreviewContainer}>
            {resolvedCoverDetails.source ? (
              <Image
                source={resolvedCoverDetails.source}
                style={styles.formAssetPreviewImage}
                resizeMode="cover"
              />
            ) : null}

            {/* Source status indicator */}
            <AppText variant="caption" style={styles.coverSourceStatusText}>
              Source: <AppText variant="caption" bold style={{ color: Colors.brand.primary }}>{coverSourceLabel}</AppText>
            </AppText>

            {/* Actions */}
            <View style={styles.formAssetActionsRow}>
              <Button
                label={isCustomCover ? 'Change Picture' : 'Upload Custom Picture'}
                variant="secondary"
                size="sm"
                onPress={handlePickCover}
                loading={isUploadingCover}
                leftIcon={<Camera size={14} color={Colors.text.primary} />}
              />
              {isCustomCover && (
                <Button
                  label="Use Club Default"
                  variant="ghost"
                  size="sm"
                  onPress={handleResetCover}
                  leftIcon={<RotateCcw size={14} color={Colors.text.secondary} />}
                />
              )}
            </View>
          </View>
        </Card>

        {/* Event Category */}
        <View style={styles.selectionSection}>
          <AppText style={styles.pickerLabel}>Event Category</AppText>
          <View style={styles.chipRow}>
            {(['social', 'clinic', 'community', 'special', 'other'] as EventType[]).map((t) => {
              const isSelected = eventType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, isSelected && styles.typeChipActive]}
                  onPress={() => setEventType(t)}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                    {EVENT_TYPE_LABELS[t]}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Visibility & Eligibility */}
        <View style={styles.selectionSection}>
          <AppText style={styles.pickerLabel}>Visibility & Eligibility</AppText>
          <View style={styles.chipRow}>
            {(['public', 'members_only', 'private'] as EventVisibility[]).map((v) => {
              const isSelected = visibility === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.typeChip, isSelected && styles.typeChipActive]}
                  onPress={() => setVisibility(v)}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                    {EVENT_VISIBILITY_LABELS[v]}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Automatically Inherited Club Location */}
        <View style={styles.locationContainer}>
          <View style={styles.locationHeaderRow}>
            <MapPin size={15} color={hasAddress ? '#08785E' : Colors.text.tertiary} />
            <AppText variant="caption" color="secondary" style={styles.locationHeaderLabel}>
              EVENT LOCATION
            </AppText>
          </View>
          <AppText
            variant="bodySmall"
            bold={hasAddress}
            color={hasAddress ? 'primary' : 'secondary'}
            numberOfLines={2}
            style={styles.locationAddressText}
          >
            {displayLocation}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.locationHelpText}>
            {hasAddress
              ? 'Automatically associated with your club’s address in Club Details.'
              : 'No address configured yet. You can set your club address in Club Details → Profile.'}
          </AppText>
        </View>

        {/* Schedule: Start Date & Time */}
        <DateTimePickerInput
          label="Event Start Date & Time *"
          value={startAt}
          onChange={setStartAt}
        />

        {/* Schedule: End Date & Time */}
        <DateTimePickerInput
          label="Event End Date & Time *"
          value={endAt}
          onChange={setEndAt}
        />

        {/* Capacity */}
        <Input
          label="Max Capacity"
          placeholder="e.g. 50 (leave empty for unlimited)"
          value={capacity}
          onChangeText={(val) => setCapacity(val.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
        />

        {/* Registration Fee */}
        <Input
          label="Registration Fee ($ USD)"
          placeholder="0.00 (free)"
          value={fee}
          onChangeText={(val) => setFee(val.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: Spacing[4],
    paddingBottom: Spacing[10], // Ensures last inputs scroll cleanly above bottom action bar
    paddingTop: Spacing[2],
  },
  formAssetCard: {
    padding: Spacing[3.5],
    backgroundColor: '#FAFCFB',
    borderColor: '#E2EAE6',
    borderRadius: Radius.lg,
  },
  formAssetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  formAssetHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  formAssetHeaderLabel: {
    letterSpacing: 0.3,
    fontWeight: '700',
    fontSize: 12,
    color: Colors.text.primary,
  },
  formAssetDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.text.secondary,
    marginBottom: Spacing[2.5],
  },
  formAssetPreviewContainer: {
    gap: Spacing[2],
  },
  formAssetPreviewImage: {
    width: '100%',
    height: 140,
    borderRadius: Radius.md,
    backgroundColor: '#E5F5EC',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  coverSourceStatusText: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  formAssetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
    marginTop: 2,
  },
  selectionSection: {
    gap: Spacing[2],
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  typeChip: {
    paddingHorizontal: Spacing[3.5],
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipActive: {
    borderColor: '#08785E',
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  typeChipText: {
    fontSize: 12.5,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: '#08785E',
    fontWeight: '700',
  },
  locationContainer: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E5EBE8',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.text.secondary,
  },
  locationAddressText: {
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 2,
  },
  locationHelpText: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
});
