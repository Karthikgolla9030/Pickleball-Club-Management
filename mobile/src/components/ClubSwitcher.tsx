/**
 * Aught2 Pickleball — ClubSwitcher Component
 *
 * Light theme: white rounded card, green-tint switch pill, lighter modal.
 */

import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { ChevronDown, ChevronRight, Crown, Building2, Trophy } from 'lucide-react-native';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { useActiveClub } from '@/hooks';
import { Colors, Layout, Radius, Shadows, Spacing } from '@/theme';
import type { MembershipInfo } from '@/types';

export function ClubSwitcher({
  slogan = 'Play. Connect. Build Community.',
  compact = false,
}: {
  slogan?: string;
  compact?: boolean;
} = {}) {
  const {
    activeMembership,
    clubName,
    role,
    roleLabel,
    allMemberships,
    canSwitchClub,
    switchClub,
  } = useActiveClub();

  const [modalVisible, setModalVisible] = useState(false);

  // Zero-club users
  if (allMemberships.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.leftRow}>
          <View style={styles.iconCircle}>
            <Trophy size={14} color={Colors.text.inverse} />
          </View>
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            Player Mode (No active club)
          </AppText>
        </View>
      </View>
    );
  }

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={styles.compactContainer}
          onPress={canSwitchClub ? () => setModalVisible(true) : undefined}
          activeOpacity={canSwitchClub ? 0.75 : 1}
          accessibilityRole={canSwitchClub ? 'button' : 'none'}
          accessibilityLabel={`Active club: ${clubName ?? 'Select Club'}. Role: ${roleLabel ?? role ?? ''}`}
        >
          <View style={styles.compactLeft}>
            <View style={styles.compactIconCircle}>
              <Image
                source={require('../../assets/lessons/paddle_icon.png')}
                style={styles.compactPaddleImg}
                resizeMode="contain"
              />
            </View>
            <AppText style={styles.compactClubName} numberOfLines={1}>
              {clubName ?? 'Aught2 Pickleball'}
            </AppText>
            <ChevronDown size={15} color="#667776" style={styles.compactChevron} />
          </View>

          {role && (
            <View style={styles.compactOwnerBadge}>
              <AppText style={styles.compactOwnerBadgeText}>
                {role === 'club_owner' ? 'CLUB OWNER' : (roleLabel ?? role).toUpperCase()}
              </AppText>
            </View>
          )}
        </TouchableOpacity>

        {/* Club Selection Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setModalVisible(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View>
                  <AppText variant="heading3">Switch Club Context</AppText>
                  <AppText variant="caption" color="secondary">
                    Choose a club to manage
                  </AppText>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.closeButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <AppText variant="heading3" color="secondary">
                    ✕
                  </AppText>
                </TouchableOpacity>
              </View>

              <FlatList
                data={allMemberships}
                keyExtractor={(item) => item.membership_id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }: { item: MembershipInfo }) => {
                  const isSelected = item.club_id === activeMembership?.club_id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.clubItem,
                        isSelected && styles.clubItemSelected,
                      ]}
                      onPress={() => {
                        switchClub(item);
                        setModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.clubItemDetails}>
                        <AppText
                          variant="title"
                          color={isSelected ? 'brand' : 'primary'}
                          numberOfLines={1}
                        >
                          {item.club_name}
                        </AppText>
                        <View style={styles.badgeRow}>
                          <Badge label={item.role_label} role={item.role} size="sm" />
                          {!item.is_active && (
                            <Badge label="Inactive" variant="error" size="sm" />
                          )}
                        </View>
                      </View>
                      {isSelected && (
                        <View style={styles.activeCheck}>
                          <AppText variant="label" color="brand">
                            ✓ Active
                          </AppText>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={canSwitchClub ? () => setModalVisible(true) : undefined}
        activeOpacity={canSwitchClub ? 0.75 : 1}
        accessibilityRole={canSwitchClub ? 'button' : 'none'}
        accessibilityLabel={`Active club: ${clubName ?? 'Select Club'}. Role: ${roleLabel ?? role ?? ''}`}
      >
        <View style={styles.leftRow}>
          <View style={styles.iconCircle}>
            <Image
              source={require('../../assets/lessons/paddle_icon.png')}
              style={styles.paddleImg}
              resizeMode="contain"
            />
          </View>
          <View style={styles.clubInfo}>
            <AppText
              variant="label"
              numberOfLines={1}
              style={styles.clubName}
            >
              {clubName ?? 'Aught2 Pickleball'}
            </AppText>
            <AppText variant="caption" style={styles.clubSlogan}>
              {slogan}
            </AppText>
          </View>
        </View>

        <View style={styles.rightRow}>
          {role && (
            <View style={styles.ownerBadge}>
              <AppText style={styles.ownerBadgeText}>
                ♛ {role === 'club_owner' ? 'CLUB OWNER' : (roleLabel ?? role).toUpperCase()}
              </AppText>
            </View>
          )}
          <ChevronRight size={18} color="#667776" />
        </View>
      </TouchableOpacity>

      {/* Club Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="heading3">Switch Club Context</AppText>
                <AppText variant="caption" color="secondary">
                  Choose a club to manage
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <AppText variant="heading3" color="secondary">
                  ✕
                </AppText>
              </TouchableOpacity>
            </View>

            <FlatList
              data={allMemberships}
              keyExtractor={(item) => item.membership_id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }: { item: MembershipInfo }) => {
                const isSelected = item.club_id === activeMembership?.club_id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.clubItem,
                      isSelected && styles.clubItemSelected,
                    ]}
                    onPress={() => {
                      switchClub(item);
                      setModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.clubItemDetails}>
                      <AppText
                        variant="title"
                        color={isSelected ? 'brand' : 'primary'}
                        numberOfLines={1}
                      >
                        {item.club_name}
                      </AppText>
                      <View style={styles.badgeRow}>
                        <Badge label={item.role_label} role={item.role} size="sm" />
                        {!item.is_active && (
                          <Badge label="Inactive" variant="error" size="sm" />
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.activeCheck}>
                        <AppText variant="label" color="brand">
                          ✓ Active
                        </AppText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  leftRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: Spacing[2],
    minWidth: 0,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5F6EC',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  paddleImg: {
    width: 28,
    height: 28,
  },
  clubInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  clubName: {
    flexShrink: 1,
    fontWeight: '700',
    color: '#102B2A',
    fontSize: 16,
  },
  clubSlogan: {
    fontSize: 11.5,
    color: '#667776',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  ownerBadge: {
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  ownerBadgeText: {
    color: '#18794E',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalContent: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: Colors.surface.default,  // white
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: Spacing[4],
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  closeButton: {
    padding: Spacing[1],
  },
  listContent: {
    gap: Spacing[2],
  },
  clubItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing[3],
    backgroundColor: Colors.surface.elevated, // #F7F8FA
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  clubItemSelected: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primaryLight, // #E7F5EC
  },
  clubItemDetails: {
    flex: 1,
    gap: Spacing[1],
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing[1.5],
    alignItems: 'center',
  },
  activeCheck: {
    marginLeft: Spacing[2],
  },
  // Compact mode styles matching Tournament reference
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E8E4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  compactIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#CBEA3A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactPaddleImg: {
    width: 22,
    height: 22,
  },
  compactClubName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
  },
  compactChevron: {
    marginLeft: 2,
  },
  compactOwnerBadge: {
    backgroundColor: '#E3F3EA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexShrink: 0,
  },
  compactOwnerBadgeText: {
    color: '#176B59',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});

export { ClubSwitcher as ClubContextCard };
