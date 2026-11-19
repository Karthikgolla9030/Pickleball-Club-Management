/**
 * Aught2 Pickleball — LayeredHeroAdBackground
 *
 * Premium, layered hero banner container that displays an automatically sliding
 * promotional advertisement carousel in the background layer while keeping the
 * foreground Welcome banner content (greeting, username, supporting text, CTA)
 * visually prominent, readable, and interactive at all times.
 *
 * Key Behaviors:
 * - Background Layer: Promotional ad images (from club promotional ads) with smooth crossfade
 * - Foreground Layer: Welcome banner content, fully readable with high contrast
 * - Auto-slide: 5-second interval between eligible ads
 * - Graceful Fallback: When no ads exist, seamlessly renders the default banner background
 * - Pauses on app backgrounding (AppState), page visibility (Web), or manual user interaction
 * - Respects reduced-motion accessibility settings
 * - Lightweight touch swipe gestures (swipe left/right to change ads)
 * - Subtle pagination dots when multiple ads exist; hidden when 0 or 1 ad
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  GestureResponderEvent,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MapPin } from 'lucide-react-native';

import { AppText } from './AppText';
import { resolveMediaUrl } from '@/utils';

export interface AdSlideItem {
  id: string;
  image_url: string;
  title?: string | null;
  subtitle?: string | null;
  tag?: string | null;
  club_name?: string | null;
  cta_text?: string | null;
  cta_route?: string | null;
  club_id?: string | null;
}

export interface LayeredHeroAdBackgroundProps {
  ads?: AdSlideItem[];
  fallbackImageUrl?: string | null;
  fallbackImageSource?: any;
  overlayVariant?: 'light-mint' | 'dark-emerald';
  containerStyle?: ViewStyle;
  children: React.ReactNode;
  showIndicators?: boolean;
  onAdPress?: (ad: AdSlideItem) => void;
  attributionPosition?: 'top-right' | 'bottom-right' | 'none';
  minHeight?: number;
}

export function LayeredHeroAdBackground({
  ads = [],
  fallbackImageUrl,
  fallbackImageSource,
  overlayVariant = 'light-mint',
  containerStyle,
  children,
  showIndicators = true,
  onAdPress,
  attributionPosition = 'top-right',
  minHeight = 185,
}: LayeredHeroAdBackgroundProps) {
  // Filter only ads with valid image URLs
  const validAds = ads.filter((ad) => Boolean(ad && ad.image_url));
  const hasAds = validAds.length > 0;
  const isMultiple = validAds.length > 1;

  // Active ad index
  const [activeIndex, setActiveIndex] = useState(0);
  // Layer A resting image URL, Layer B incoming image URL for buttery-smooth crossfade
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(
    hasAds ? validAds[0].image_url : null
  );
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null);

  // Crossfade opacity: 0 -> Layer A visible, 1 -> Layer B visible
  const crossfadeAnim = useRef(new Animated.Value(0)).current;

  // Interaction & Visibility controls
  const isInteractingRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAppActive, setIsAppActive] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Touch gesture coordinates
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ─── 1. Accessibility: Check Reduce Motion ─────────────────────────────────
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove();
  }, []);

  // ─── 2. App State & Page Visibility ────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setIsAppActive(nextState === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        setIsAppActive(!document.hidden);
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, []);

  // ─── 3. Sync with dynamic ads changes (e.g. club switch or query update) ───
  useEffect(() => {
    if (hasAds) {
      if (activeIndex >= validAds.length) {
        setActiveIndex(0);
        setDisplayedUrl(validAds[0].image_url);
        setIncomingUrl(null);
        crossfadeAnim.setValue(0);
      } else if (!displayedUrl) {
        setDisplayedUrl(validAds[activeIndex]?.image_url || validAds[0].image_url);
      }
    } else {
      setActiveIndex(0);
      setDisplayedUrl(null);
      setIncomingUrl(null);
      crossfadeAnim.setValue(0);
    }
  }, [hasAds, validAds, activeIndex, displayedUrl, crossfadeAnim]);

  // ─── 4. Transition to Slide Function (Crossfade) ───────────────────────────
  const transitionToSlide = useCallback(
    (targetIndex: number) => {
      if (!hasAds || targetIndex === activeIndex || targetIndex < 0 || targetIndex >= validAds.length) {
        return;
      }

      const nextAd = validAds[targetIndex];
      if (!nextAd) return;

      if (reduceMotion) {
        // Instant switch if user prefers reduced motion
        setActiveIndex(targetIndex);
        setDisplayedUrl(nextAd.image_url);
        setIncomingUrl(null);
        crossfadeAnim.setValue(0);
        return;
      }

      // Buffer incoming image on Layer B and fade in
      setIncomingUrl(nextAd.image_url);
      crossfadeAnim.setValue(0);

      Animated.timing(crossfadeAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: Platform.OS !== 'web',
      }).start(({ finished }) => {
        if (finished) {
          setActiveIndex(targetIndex);
          setDisplayedUrl(nextAd.image_url);
          setIncomingUrl(null);
          crossfadeAnim.setValue(0);
        }
      });
    },
    [hasAds, activeIndex, validAds, reduceMotion, crossfadeAnim]
  );

  // ─── 5. Auto-Play Interval (5 Seconds) ─────────────────────────────────────
  useEffect(() => {
    if (!isMultiple || !isAppActive || reduceMotion) return;

    const interval = setInterval(() => {
      if (!isInteractingRef.current) {
        const nextIndex = (activeIndex + 1) % validAds.length;
        transitionToSlide(nextIndex);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isMultiple, isAppActive, reduceMotion, activeIndex, validAds.length, transitionToSlide]);

  // ─── 6. User Interaction Pause Cooldown ────────────────────────────────────
  const triggerInteractionCooldown = useCallback(() => {
    isInteractingRef.current = true;
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 6000);
  }, []);

  // ─── 7. Swipe Gestures ─────────────────────────────────────────────────────
  const handleTouchStart = (e: GestureResponderEvent) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    if (!isMultiple) return;
    const deltaX = e.nativeEvent.pageX - touchStartX.current;
    const deltaY = e.nativeEvent.pageY - touchStartY.current;

    // Only recognize horizontal swipe if horizontal movement dominates vertical scroll
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      triggerInteractionCooldown();
      if (deltaX < 0) {
        // Swipe left -> Next
        const next = (activeIndex + 1) % validAds.length;
        transitionToSlide(next);
      } else {
        // Swipe right -> Prev
        const prev = (activeIndex - 1 + validAds.length) % validAds.length;
        transitionToSlide(prev);
      }
    }
  };

  const currentAd = hasAds ? validAds[activeIndex] : null;

  return (
    <View
      style={[styles.container, { minHeight }, containerStyle]}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ─── LAYER 0: BACKGROUND AD / BANNER IMAGES ─── */}
      <View style={StyleSheet.absoluteFill}>
        {hasAds ? (
          <>
            {/* Layer A (Base / Resting Image) */}
            {displayedUrl ? (
              <Image
                source={{ uri: resolveMediaUrl(displayedUrl) }}
                style={styles.backgroundImage}
                resizeMode="cover"
              />
            ) : null}

            {/* Layer B (Incoming Image with Animated Crossfade) */}
            {incomingUrl ? (
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: crossfadeAnim }]}>
                <Image
                  source={{ uri: resolveMediaUrl(incomingUrl) }}
                  style={styles.backgroundImage}
                  resizeMode="cover"
                />
              </Animated.View>
            ) : null}
          </>
        ) : fallbackImageUrl ? (
          <Image
            source={{ uri: resolveMediaUrl(fallbackImageUrl) }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        ) : fallbackImageSource ? (
          <Image
            source={fallbackImageSource}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        ) : null}

        {/* ─── LAYER 1: PROTECTIVE SCRIM OVERLAY (Ensures foreground text legibility) ─── */}
        {overlayVariant === 'light-mint' ? (
          <>
            {/* Base subtle dark gradient across image */}
            <View style={styles.lightMintBaseScrim} />
            {/* Left protective content shield ensuring WCAG contrast for dark text */}
            <View style={styles.lightMintContentShield} />
          </>
        ) : (
          /* Dark emerald overlay for white text (Club Side) */
          <View style={styles.darkEmeraldScrim} />
        )}
      </View>

      {/* ─── LAYER 2: OPTIONAL CLUB ATTRIBUTION BADGE (Top Right) ─── */}
      {hasAds && currentAd?.club_name && attributionPosition === 'top-right' ? (
        <TouchableOpacity
          style={styles.attributionPillTopRight}
          activeOpacity={0.85}
          onPress={() => onAdPress?.(currentAd)}
          accessibilityRole="button"
          accessibilityLabel={`Promoted by ${currentAd.club_name}`}
        >
          <MapPin size={11} color="#064E3B" strokeWidth={2.4} />
          <AppText style={styles.attributionText} numberOfLines={1}>
            {currentAd.club_name}
          </AppText>
        </TouchableOpacity>
      ) : null}

      {/* ─── LAYER 3: FOREGROUND WELCOME BANNER CONTENT (Uncompromised) ─── */}
      <View style={styles.foregroundContentWrapper}>{children}</View>

      {/* ─── LAYER 4: SUBTLE PAGINATION INDICATORS (Only when > 1 ad) ─── */}
      {hasAds && isMultiple && showIndicators ? (
        <View style={styles.paginationRow}>
          {validAds.map((ad, idx) => {
            const isActive = idx === activeIndex;
            return (
              <TouchableOpacity
                key={ad.id || idx}
                onPress={() => {
                  triggerInteractionCooldown();
                  transitionToSlide(idx);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                activeOpacity={0.8}
                style={[
                  styles.dotCircle,
                  isActive && (overlayVariant === 'light-mint' ? styles.dotActiveMint : styles.dotActiveEmerald),
                ]}
                accessibilityLabel={`Slide ${idx + 1} of ${validAds.length}`}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    backgroundColor: '#DCEFE7',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  // Overlay: Light Mint Variant (Player Side - dark typography on left)
  lightMintBaseScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 35, 30, 0.18)',
  },
  lightMintContentShield: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '68%',
    backgroundColor: '#DCEFE7',
    opacity: 0.95,
  },
  // Overlay: Dark Emerald Variant (Club Side - white typography)
  darkEmeraldScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 47, 43, 0.52)',
  },
  foregroundContentWrapper: {
    zIndex: 2,
    width: '100%',
  },
  // Attribution Pill (Upper Right)
  attributionPillTopRight: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(226, 238, 232, 0.9)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  attributionText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#064E3B',
    maxWidth: 130,
  },
  // Pagination Dots
  paginationRow: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dotCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  dotActiveMint: {
    width: 16,
    borderRadius: 4,
    backgroundColor: '#176B57',
  },
  dotActiveEmerald: {
    width: 16,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});
