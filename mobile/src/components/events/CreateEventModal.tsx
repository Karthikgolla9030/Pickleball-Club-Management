/**
 * Aught2 Pickleball — Create / Edit Event Modal
 *
 * Full-featured modal sheet allowing club staff to create new events or
 * update existing event details, picture, schedule, location, capacity, and fee.
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
import { Camera, Image as ImageIcon, RotateCcw } from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  DateTimePickerInput,
  Input,
  ModalSheet,
} from '@/components';
import { useCreateClubEvent, useUpdateClubEvent } from '@/hooks';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Spacing } from '@/theme';
import { resolveMediaUrl } from '@/utils';
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
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [fee, setFee] = useState('');

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
      setLocation(eventToEdit.location || '');
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
      setLocation('');
      setCapacity('');
      setFee('');
      setStartAt(defaultStart);
      setEndAt(defaultEnd);
    }
  }, [eventToEdit, visible, defaultStart, defaultEnd]);

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
          location: location.trim() || null,
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
          location: location.trim() || null,
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
      <View style={{ gap: Spacing[4], paddingBottom: Spacing[6], paddingTop: Spacing[2] }}>
        <Input
          label="Event Title *"
          placeholder="e.g. Summer Pickleball Social"
          value={title}
          onChangeText={setTitle}
        />

        <Input
          label="Description"
          placeholder="Event details, schedule, format..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Optional Event Picture Card */}
        <Card style={styles.formAssetCard}>
          <View style={styles.formAssetHeader}>
            <View style={styles.formAssetHeaderTitleRow}>
              <ImageIcon size={16} color={Colors.brand.primary} />
              <AppText variant="caption" color="secondary" style={styles.formAssetHeaderLabel}>
                EVENT PICTURE (OPTIONAL)
              </AppText>
            </View>
            <Badge
              label={coverImageUrl ? 'Custom Picture' : 'Inheriting Club Default'}
              variant={coverImageUrl ? 'success' : 'default'}
            />
          </View>

          <AppText variant="caption" color="tertiary" style={styles.formAssetDescription}>
            {coverImageUrl
              ? 'This custom picture will be displayed on this event’s cards and details.'
              : 'When no custom picture is set, the event uses your club’s default event banner from Branding & Assets.'}
          </AppText>

          {coverImageUrl ? (
            <View style={styles.formAssetPreviewContainer}>
              <Image
                source={{ uri: resolveMediaUrl(coverImageUrl) }}
                style={styles.formAssetPreviewImage}
                resizeMode="cover"
              />
              <View style={styles.formAssetActionsRow}>
                <Button
                  label="Change Picture"
                  variant="secondary"
                  size="sm"
                  onPress={handlePickCover}
                  loading={isUploadingCover}
                  leftIcon={<Camera size={14} color={Colors.text.primary} />}
                />
                <Button
                  label="Use Club Default"
                  variant="ghost"
                  size="sm"
                  onPress={handleResetCover}
                  leftIcon={<RotateCcw size={14} color={Colors.text.secondary} />}
                />
              </View>
            </View>
          ) : (
            <View style={styles.formAssetEmptyBox}>
              {clubBranding?.default_event_banner_url ? (
                <View style={styles.formAssetInheritedBox}>
                  <Image
                    source={{ uri: resolveMediaUrl(clubBranding.default_event_banner_url) }}
                    style={styles.formAssetInheritedThumb}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" color="primary" style={{ fontWeight: '600' }}>
                      Current Club Banner
                    </AppText>
                    <AppText variant="caption" color="tertiary">
                      Configured in Club Profile
                    </AppText>
                  </View>
                </View>
              ) : null}

              <Button
                label="Upload Custom Picture"
                variant="secondary"
                size="sm"
                onPress={handlePickCover}
                loading={isUploadingCover}
                leftIcon={<Camera size={14} color={Colors.text.primary} />}
              />
            </View>
          )}
        </Card>

        {/* Event Type */}
        <AppText style={styles.pickerLabel}>Event Category</AppText>
        <View style={styles.chipRow}>
          {(['social', 'clinic', 'community', 'special', 'other'] as EventType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, eventType === t && styles.typeChipActive]}
              onPress={() => setEventType(t)}
            >
              <AppText style={[styles.typeChipText, eventType === t && styles.typeChipTextActive]}>
                {EVENT_TYPE_LABELS[t]}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Visibility */}
        <AppText style={styles.pickerLabel}>Visibility & Eligibility</AppText>
        <View style={styles.chipRow}>
          {(['public', 'members_only', 'private'] as EventVisibility[]).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.typeChip, visibility === v && styles.typeChipActive]}
              onPress={() => setVisibility(v)}
            >
              <AppText style={[styles.typeChipText, visibility === v && styles.typeChipTextActive]}>
                {EVENT_VISIBILITY_LABELS[v]}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="Location"
          placeholder="e.g. Courts 1–4, Tirupati, AP"
          value={location}
          onChangeText={setLocation}
        />

        <DateTimePickerInput
          label="Event Start Date & Time *"
          value={startAt}
          onChange={setStartAt}
        />

        <DateTimePickerInput
          label="Event End Date & Time *"
          value={endAt}
          onChange={setEndAt}
        />

        <Input
          label="Max Capacity (Leave blank for unlimited)"
          placeholder="e.g. 50"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="numeric"
        />

        <Input
          label="Registration Fee ($ USD, 0 for free)"
          placeholder="0.00"
          value={fee}
          onChangeText={setFee}
          keyboardType="numeric"
        />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  formAssetCard: {
    padding: Spacing[4],
    backgroundColor: '#FAFCFB',
    borderColor: '#E2EAE6',
  },
  formAssetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  formAssetHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  formAssetHeaderLabel: {
    letterSpacing: 0.5,
    fontWeight: '700',
    fontSize: 11,
  },
  formAssetDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing[3],
  },
  formAssetPreviewContainer: {
    gap: Spacing[2],
  },
  formAssetPreviewImage: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#E5F5EC',
  },
  formAssetActionsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  formAssetEmptyBox: {
    gap: Spacing[2],
  },
  formAssetInheritedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 8,
    padding: Spacing[2],
  },
  formAssetInheritedThumb: {
    width: 50,
    height: 34,
    borderRadius: 4,
    backgroundColor: '#E5F5EC',
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
    marginBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    backgroundColor: '#FFFFFF',
  },
  typeChipActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  typeChipText: {
    fontSize: 12,
    color: '#657776',
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
