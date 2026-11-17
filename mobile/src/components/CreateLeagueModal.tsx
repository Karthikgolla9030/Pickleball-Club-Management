/**
 * Aught2 Pickleball — Create / Edit League Modal
 *
 * Polished, clutter-free modal form for Club Side -> Leagues -> Create League:
 * - Uses standardized ModalSheet for a fixed header, contained scroll area,
 *   and sticky bottom actions (no header overlap or scroll clipping).
 * - Label / input / helper text hierarchy with positive margins (zero text overlap).
 * - Balanced format selection: Doubles (2 / team) vs Singles (1 / entry).
 * - League Picture (Optional): Simplified card without truncated inheritance badges,
 *   crisp fallback preview, and clear source status ('Custom league picture', 'Club default', 'Platform default').
 * - Capacity & Dynamic Duration: Clean team/player capacity input with streamlined
 *   "Suggested duration: X weeks" recommendation card and dynamic season breakdown.
 * - Playoff Configuration: Clear "Playoffs Enabled" vs "Playoffs Disabled" options
 *   with compact "Top 2 / Top 4 / Top 8" qualifiers and responsive layout.
 * - Simplified Competition Rules: Structured key-value summary rows (Format, Capacity,
 *   Duration, Playoffs, Standings, Scoring) reflecting actual user configuration.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertCircle,
  Camera,
  Image as ImageIcon,
  RotateCcw,
  Trophy,
  User,
  Users,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { Card } from './Card';
import { DatePickerInput } from './DatePickerInput';
import { Input } from './Input';
import { ModalSheet } from './ModalSheet';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Layout, Radius, Spacing, Typography } from '@/theme';
import type { ClubBranding, CreateLeaguePayload, LeagueSummary } from '@/types';
import { resolveMediaUrl } from '@/utils';
import { isBuiltinDefaultUrl, resolveLeagueBanner } from '@/utils/imageResolution';
import { usePlatformBanners } from '@/hooks';

interface CreateLeagueModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateLeaguePayload) => Promise<void>;
  isCreating: boolean;
  clubId?: string | null;
  clubBranding?: ClubBranding | null;
  leagueToEdit?: LeagueSummary | null;
  onUpdate?: (leagueId: string, payload: Partial<CreateLeaguePayload>) => Promise<void>;
  isUpdating?: boolean;
}

export function CreateLeagueModal({
  visible,
  onClose,
  onSubmit,
  isCreating,
  clubId,
  clubBranding,
  leagueToEdit,
  onUpdate,
  isUpdating,
}: CreateLeagueModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const { banners: platformBanners } = usePlatformBanners();
  const [format, setFormat] = useState<'doubles' | 'singles'>('doubles');
  const [maxTeams, setMaxTeams] = useState('8');
  const [numberOfWeeks, setNumberOfWeeks] = useState('8');
  const [hasPlayoffs, setHasPlayoffs] = useState(true);
  const [playoffTeamCount, setPlayoffTeamCount] = useState('4');
  const [entryFee, setEntryFee] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Dynamic suggested duration based on round-robin scheduling rules:
  // For N entries:
  // - If N even: N - 1 regular season rounds
  // - If N odd: N regular season rounds (with 1 BYE per round)
  // - Plus 1 playoff week if playoffs are enabled
  const teamCountNum = Math.max(2, parseInt(maxTeams, 10) || 8);
  const fullRounds = teamCountNum % 2 === 0 ? teamCountNum - 1 : teamCountNum;
  const playoffWeeks = hasPlayoffs ? 1 : 0;
  const suggestedWeeks = fullRounds + playoffWeeks;

  // Breakdown for configured weeks
  const parsedWeeks = parseInt(numberOfWeeks, 10) || suggestedWeeks;
  const regularWeeks = hasPlayoffs ? Math.max(1, parsedWeeks - 1) : Math.max(1, parsedWeeks);

  useEffect(() => {
    if (visible) {
      if (leagueToEdit) {
        setName(leagueToEdit.name || '');
        setDescription(leagueToEdit.description || '');
        setBannerImageUrl(leagueToEdit.banner_image_url || null);
        setFormat(leagueToEdit.team_size === 1 ? 'singles' : 'doubles');
        setMaxTeams(leagueToEdit.max_teams ? String(leagueToEdit.max_teams) : '8');
        setNumberOfWeeks(leagueToEdit.number_of_weeks ? String(leagueToEdit.number_of_weeks) : '8');
        setHasPlayoffs((leagueToEdit.playoff_team_count ?? 0) > 0);
        setPlayoffTeamCount(
          leagueToEdit.playoff_team_count && leagueToEdit.playoff_team_count > 0
            ? String(leagueToEdit.playoff_team_count)
            : '4'
        );
        setEntryFee(leagueToEdit.registration_fee !== undefined ? String(leagueToEdit.registration_fee) : '0');
        setStartDate(leagueToEdit.start_date ? leagueToEdit.start_date.split('T')[0] : '');
        setFormError(null);
      } else {
        setName('');
        setDescription('');
        setBannerImageUrl(null);
        setFormat('doubles');
        setMaxTeams('8');
        setNumberOfWeeks('8');
        setHasPlayoffs(true);
        setPlayoffTeamCount('4');
        setEntryFee('0');
        setStartDate('');
        setFormError(null);
      }
    }
  }, [visible, leagueToEdit]);

  const handleApplySuggested = () => {
    setNumberOfWeeks(String(suggestedWeeks));
  };

  const handlePickBanner = async () => {
    if (!clubId) {
      Alert.alert('Notice', 'Club ID is not available to upload a banner.');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow gallery access to upload a league banner.');
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
        const fileName = asset.fileName || `league_banner_${Date.now()}.${ext}`;

        setIsUploadingBanner(true);
        try {
          const uploadRes = await clubAssetsApi.uploadClubMedia(
            clubId,
            { uri: asset.uri, name: fileName, type: mime },
            'league_banner',
            'league'
          );
          setBannerImageUrl(uploadRes.public_url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Banner upload failed.';
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploadingBanner(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to open image picker.');
    }
  };

  const handleResetBanner = () => {
    setBannerImageUrl(null);
  };

  // Preview source resolution
  const previewSource = useMemo(() => {
    if (bannerImageUrl) {
      return { uri: resolveMediaUrl(bannerImageUrl) };
    }
    return resolveLeagueBanner(null, clubBranding, platformBanners);
  }, [bannerImageUrl, clubBranding, platformBanners]);

  // Source status label
  const bannerStatusLabel = useMemo(() => {
    if (bannerImageUrl && !isBuiltinDefaultUrl(bannerImageUrl)) {
      return 'Custom league picture';
    }
    if (clubBranding?.default_league_banner_url && !isBuiltinDefaultUrl(clubBranding.default_league_banner_url)) {
      return 'Club default';
    }
    return 'Platform default';
  }, [bannerImageUrl, clubBranding?.default_league_banner_url]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('League name is required.');
      return;
    }
    const weeks = parseInt(numberOfWeeks, 10);
    if (isNaN(weeks) || weeks < (hasPlayoffs ? 2 : 1)) {
      setFormError(
        hasPlayoffs
          ? 'Duration must be at least 2 weeks (minimum 1 regular season + 1 playoff).'
          : 'Duration must be at least 1 week.'
      );
      return;
    }
    const teams = parseInt(maxTeams, 10);
    if (isNaN(teams) || teams < 2) {
      setFormError(`Number of ${format === 'doubles' ? 'teams' : 'players'} must be at least 2.`);
      return;
    }
    const playoffTeams = hasPlayoffs ? parseInt(playoffTeamCount, 10) : 2;
    if (hasPlayoffs && playoffTeams > teams) {
      setFormError(
        `Playoff qualifiers (${playoffTeams}) cannot exceed total ${format === 'doubles' ? 'team' : 'player'} count (${teams}).`
      );
      return;
    }

    const feeNum = parseFloat(entryFee);
    if (isNaN(feeNum) || feeNum < 0) {
      setFormError('Registration fee cannot be negative.');
      return;
    }

    setFormError(null);
    const payload: CreateLeaguePayload = {
      name: name.trim(),
      description: description.trim() || null,
      banner_image_url: bannerImageUrl || null,
      number_of_weeks: weeks,
      team_size: format === 'doubles' ? 2 : 1,
      playoff_team_count: hasPlayoffs ? playoffTeams : 2, // minimum 2 in backend schema
      max_teams: teams,
      registration_fee: feeNum || 0,
      start_date: startDate.trim() ? new Date(startDate.trim()).toISOString() : null,
      scoring_rules: {
        game_format: 'single_game',
        target_score: 11,
        win_by: 2,
      },
    };

    try {
      if (leagueToEdit && onUpdate) {
        await onUpdate(leagueToEdit.id, payload);
      } else {
        await onSubmit(payload);
      }
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        (leagueToEdit ? 'Failed to update league' : 'Failed to create league');
      setFormError(msg);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={leagueToEdit ? 'Edit League' : 'Create League'}
      subtitle="League & Season Setup"
      actions={[
        {
          label: 'Cancel',
          variant: 'secondary',
          onPress: onClose,
          disabled: isCreating || isUpdating,
        },
        {
          label: leagueToEdit
            ? isUpdating
              ? 'Saving...'
              : 'Save Changes'
            : isCreating
            ? 'Creating...'
            : 'Create League',
          variant: 'primary',
          onPress: handleSubmit,
          loading: isCreating || isUpdating,
          disabled: isCreating || isUpdating,
        },
      ]}
    >
      <View style={styles.formContainer}>
        {formError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color="#DC2626" />
            <AppText style={styles.errorBannerText}>{formError}</AppText>
          </View>
        ) : null}

        {/* Competition Format Toggle */}
        <View style={styles.fieldWrapper}>
          <AppText style={styles.fieldLabel}>Competition Format *</AppText>
          <View style={styles.formatToggleRow}>
            <TouchableOpacity
              style={[
                styles.formatOption,
                format === 'doubles' && styles.formatOptionSelected,
              ]}
              onPress={() => setFormat('doubles')}
              activeOpacity={0.8}
            >
              <Users
                size={16}
                color={format === 'doubles' ? '#08785E' : '#64748B'}
              />
              <AppText
                style={[
                  styles.formatOptionText,
                  format === 'doubles' && styles.formatOptionTextSelected,
                ]}
              >
                Doubles (2 / team)
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.formatOption,
                format === 'singles' && styles.formatOptionSelected,
              ]}
              onPress={() => setFormat('singles')}
              activeOpacity={0.8}
            >
              <User
                size={16}
                color={format === 'singles' ? '#08785E' : '#64748B'}
              />
              <AppText
                style={[
                  styles.formatOptionText,
                  format === 'singles' && styles.formatOptionTextSelected,
                ]}
              >
                Singles (1 / entry)
              </AppText>
            </TouchableOpacity>
          </View>
        </View>

        {/* League Name */}
        <View style={styles.fieldWrapper}>
          <Input
            label="League Name *"
            placeholder="e.g., Premier Doubles League"
            value={name}
            onChangeText={(val) => {
              setName(val);
              if (formError) setFormError(null);
            }}
            autoFocus={!leagueToEdit}
          />
        </View>

        {/* Description */}
        <View style={styles.fieldWrapper}>
          <Input
            label="Description"
            placeholder="Details, skill level requirements, venue notes..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* League Picture Card */}
        <Card style={styles.bannerCard}>
          <View style={styles.bannerHeader}>
            <View style={styles.bannerHeaderTitleRow}>
              <ImageIcon size={16} color={Colors.brand.primary} />
              <AppText style={styles.bannerHeaderTitle}>
                League Picture (Optional)
              </AppText>
            </View>
          </View>

          <AppText style={styles.bannerExplanation}>
            Uses your club's default league banner unless you upload a custom picture.
          </AppText>

          {/* Banner Preview */}
          <View style={styles.bannerPreviewContainer}>
            {previewSource ? (
              <Image
                source={previewSource}
                style={styles.bannerPreviewImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.bannerEmptyPlaceholder}>
                <Trophy size={28} color="#94A3B8" />
                <AppText style={styles.bannerEmptyText}>No image configured (optional)</AppText>
              </View>
            )}
            {isUploadingBanner && (
              <View style={styles.bannerUploadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <AppText variant="caption" style={styles.bannerUploadingText}>
                  Uploading picture...
                </AppText>
              </View>
            )}
          </View>

          {/* Source Status */}
          <View style={styles.bannerStatusRow}>
            <View style={styles.bannerStatusDot} />
            <AppText style={styles.bannerStatusText}>{bannerStatusLabel}</AppText>
          </View>

          {/* Banner Actions */}
          <View style={styles.bannerActionsRow}>
            <TouchableOpacity
              style={styles.bannerActionBtn}
              onPress={handlePickBanner}
              disabled={isUploadingBanner}
              activeOpacity={0.8}
            >
              <Camera size={14} color={Colors.text.primary} />
              <AppText variant="bodySmall" style={styles.bannerActionBtnText}>
                {bannerImageUrl ? 'Change Picture' : 'Upload Custom Picture'}
              </AppText>
            </TouchableOpacity>

            {bannerImageUrl && (
              <TouchableOpacity
                style={styles.bannerResetBtn}
                onPress={handleResetBanner}
                disabled={isUploadingBanner}
                activeOpacity={0.8}
              >
                <RotateCcw size={14} color={Colors.text.secondary} />
                <AppText variant="bodySmall" style={styles.bannerResetBtnText}>
                  Reset to Club Default
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        {/* Capacity Input */}
        <View style={styles.fieldWrapper}>
          <Input
            label={format === 'doubles' ? 'Number of Teams (Capacity) *' : 'Number of Players (Capacity) *'}
            placeholder="8"
            keyboardType="numeric"
            value={maxTeams}
            onChangeText={(val) => {
              const cleaned = val.replace(/[^0-9]/g, '');
              setMaxTeams(cleaned);
              if (formError) setFormError(null);
            }}
          />
        </View>

        {/* Streamlined Suggested Duration Card */}
        <View style={styles.suggestedCard}>
          <View style={styles.suggestedTextCol}>
            <AppText style={styles.suggestedHeading}>
              Suggested duration: {suggestedWeeks} weeks
            </AppText>
            <AppText style={styles.suggestedSubtext}>
              Recommended based on the selected {format === 'doubles' ? 'team' : 'player'} count.
            </AppText>
          </View>
          {numberOfWeeks !== String(suggestedWeeks) && (
            <TouchableOpacity
              style={styles.applySuggestedBtn}
              onPress={handleApplySuggested}
              activeOpacity={0.8}
            >
              <AppText style={styles.applySuggestedBtnText}>
                Apply ({suggestedWeeks}w)
              </AppText>
            </TouchableOpacity>
          )}
        </View>

        {/* League Start Date */}
        <View style={styles.fieldWrapper}>
          <DatePickerInput
            label="League Start Date (Optional)"
            value={startDate}
            onChange={setStartDate}
            placeholder="Select start date"
          />
        </View>

        {/* Planned Number of Weeks with Clean Dynamic Breakdown */}
        <View style={styles.fieldWrapper}>
          <Input
            label="Planned Number of Weeks *"
            placeholder="8"
            keyboardType="numeric"
            value={numberOfWeeks}
            onChangeText={(val) => {
              const cleaned = val.replace(/[^0-9]/g, '');
              setNumberOfWeeks(cleaned);
              if (formError) setFormError(null);
            }}
          />
          <AppText style={styles.durationBreakdownText}>
            {hasPlayoffs
              ? `${regularWeeks} regular season week${regularWeeks === 1 ? '' : 's'} + 1 playoff week.`
              : `${regularWeeks} regular season week${regularWeeks === 1 ? '' : 's'} (no playoffs).`}
          </AppText>
        </View>

        {/* Playoff Configuration */}
        <View style={styles.fieldWrapper}>
          <AppText style={styles.fieldLabel}>Playoff Tournament</AppText>
          <View style={styles.playoffsToggleRow}>
            <TouchableOpacity
              style={[
                styles.playoffChoiceCard,
                hasPlayoffs && styles.playoffChoiceCardActive,
              ]}
              onPress={() => setHasPlayoffs(true)}
              activeOpacity={0.8}
            >
              <View style={styles.playoffChoiceHeader}>
                <View style={[styles.playoffRadio, hasPlayoffs && styles.playoffRadioActive]}>
                  {hasPlayoffs && <View style={styles.playoffRadioDot} />}
                </View>
                <AppText style={[styles.playoffChoiceTitle, hasPlayoffs && styles.playoffChoiceTitleActive]}>
                  Playoffs Enabled
                </AppText>
              </View>
              <AppText style={[styles.playoffChoiceDesc, hasPlayoffs && styles.playoffChoiceDescActive]}>
                Top {format === 'doubles' ? 'teams' : 'players'} advance to a championship.
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.playoffChoiceCard,
                !hasPlayoffs && styles.playoffChoiceCardActive,
              ]}
              onPress={() => setHasPlayoffs(false)}
              activeOpacity={0.8}
            >
              <View style={styles.playoffChoiceHeader}>
                <View style={[styles.playoffRadio, !hasPlayoffs && styles.playoffRadioActive]}>
                  {!hasPlayoffs && <View style={styles.playoffRadioDot} />}
                </View>
                <AppText style={[styles.playoffChoiceTitle, !hasPlayoffs && styles.playoffChoiceTitleActive]}>
                  Playoffs Disabled
                </AppText>
              </View>
              <AppText style={[styles.playoffChoiceDesc, !hasPlayoffs && styles.playoffChoiceDescActive]}>
                Regular season only.
              </AppText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Playoff Qualifying Cutoff (Visible only when playoffs enabled) */}
        {hasPlayoffs && (
          <View style={styles.fieldWrapper}>
            <AppText style={styles.fieldLabel}>Playoff Qualifying Cutoff *</AppText>
            <View style={styles.cutoffRow}>
              {(['2', '4', '8'] as const).map((count) => {
                const isSelected = playoffTeamCount === count;
                return (
                  <TouchableOpacity
                    key={count}
                    style={[styles.cutoffButton, isSelected && styles.cutoffButtonSelected]}
                    onPress={() => setPlayoffTeamCount(count)}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.cutoffText, isSelected && styles.cutoffTextSelected]}>
                      Top {count}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Registration Fee */}
        <View style={styles.fieldWrapper}>
          <Input
            label={format === 'doubles' ? 'Registration Fee per Team ($ USD)' : 'Registration Fee per Player ($ USD)'}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={entryFee}
            onChangeText={(val) => {
              const cleaned = val.replace(/[^0-9.]/g, '');
              const parts = cleaned.split('.');
              if (parts.length > 2) {
                setEntryFee(parts[0] + '.' + parts.slice(1).join(''));
              } else {
                setEntryFee(cleaned);
              }
              if (formError) setFormError(null);
            }}
            hint={parseFloat(entryFee) > 0 ? `$${parseFloat(entryFee).toFixed(2)} per entry` : 'Free entry ($0.00)'}
          />
        </View>

        {/* Simplified Competition Rules Summary Card */}
        <View style={styles.rulesCard}>
          <View style={styles.rulesHeader}>
            <Trophy size={15} color="#08785E" />
            <AppText style={styles.rulesTitle}>Competition Rules Summary</AppText>
          </View>

          <View style={styles.rulesList}>
            <View style={styles.ruleRow}>
              <AppText style={styles.ruleLabel}>Format</AppText>
              <AppText style={styles.ruleValue}>
                {format === 'doubles' ? 'Doubles (2 players / team)' : 'Singles (1 player / entry)'}
              </AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleRow}>
              <AppText style={styles.ruleLabel}>Capacity</AppText>
              <AppText style={styles.ruleValue}>
                {maxTeams || '8'} {format === 'doubles' ? 'teams' : 'players'}
              </AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleRow}>
              <AppText style={styles.ruleLabel}>Duration</AppText>
              <AppText style={styles.ruleValue}>
                {hasPlayoffs
                  ? `${regularWeeks} regular + 1 playoff (${parsedWeeks} total)`
                  : `${regularWeeks} regular season weeks`}
              </AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleRow}>
              <AppText style={styles.ruleLabel}>Playoffs</AppText>
              <AppText style={styles.ruleValue}>
                {hasPlayoffs ? `Top ${playoffTeamCount} Single-Elimination` : 'None (Regular season only)'}
              </AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleRow}>
              <AppText style={styles.ruleLabel}>Standings</AppText>
              <AppText style={styles.ruleValue}>Win-loss & point differential</AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleRow}>
              <AppText style={styles.ruleLabel}>Scoring</AppText>
              <AppText style={styles.ruleValue}>First to 11, win by 2</AppText>
            </View>
          </View>
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: Spacing[4],
    paddingBottom: Spacing[4],
  },
  fieldWrapper: {
    gap: Spacing[1.5],
  },
  fieldLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    letterSpacing: 0.1,
  },
  formatToggleRow: {
    flexDirection: 'row',
    gap: Spacing[2.5],
  },
  formatOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2.5],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  formatOptionSelected: {
    borderColor: '#08785E',
    backgroundColor: '#ECFDF5',
  },
  formatOptionText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  formatOptionTextSelected: {
    color: '#08785E',
    fontWeight: '700',
  },
  bannerCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
    padding: Spacing[3.5],
    gap: Spacing[2.5],
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  bannerExplanation: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  bannerPreviewContainer: {
    width: '100%',
    height: 140,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  bannerEmptyPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  bannerEmptyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  bannerPreviewImage: {
    width: '100%',
    height: '100%',
  },
  bannerUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1],
  },
  bannerUploadingText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bannerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  bannerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#08785E',
  },
  bannerStatusText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
  },
  bannerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[0.5],
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.md,
  },
  bannerActionBtnText: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  bannerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.md,
  },
  bannerResetBtnText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  suggestedCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.lg,
    padding: Spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  suggestedTextCol: {
    flex: 1,
    gap: 2,
  },
  suggestedHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  suggestedSubtext: {
    fontSize: 11.5,
    color: '#15803D',
    lineHeight: 16,
  },
  applySuggestedBtn: {
    backgroundColor: '#08785E',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    alignSelf: 'center',
  },
  applySuggestedBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  durationBreakdownText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: Spacing[1],
  },
  playoffsToggleRow: {
    flexDirection: 'row',
    gap: Spacing[2.5],
  },
  playoffChoiceCard: {
    flex: 1,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 4,
  },
  playoffChoiceCardActive: {
    borderColor: '#08785E',
    backgroundColor: '#ECFDF5',
  },
  playoffChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  playoffRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  playoffRadioActive: {
    borderColor: '#08785E',
  },
  playoffRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#08785E',
  },
  playoffChoiceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  playoffChoiceTitleActive: {
    color: '#08785E',
    fontWeight: '700',
  },
  playoffChoiceDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
  },
  playoffChoiceDescActive: {
    color: '#064E3B',
  },
  cutoffRow: {
    flexDirection: 'row',
    gap: Spacing[2.5],
  },
  cutoffButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutoffButtonSelected: {
    borderColor: '#08785E',
    backgroundColor: '#ECFDF5',
  },
  cutoffText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  cutoffTextSelected: {
    color: '#08785E',
    fontWeight: '700',
  },
  rulesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[3.5],
    gap: Spacing[2.5],
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rulesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rulesList: {
    gap: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ruleLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  ruleValue: {
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '600',
    textAlign: 'right',
  },
  ruleDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing[2.5],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },
});
