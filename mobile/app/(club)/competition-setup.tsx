import React, { useState } from 'react';
import { Alert, StyleSheet, View, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText, Button, Card, Screen, AppHeader, Input } from '@/components';
import { useTournamentDetails, useMatches } from '@/hooks';
import { useActiveClub } from '@/hooks/useActiveClub';
import { Colors, Radius, Spacing } from '@/theme';
import { apiClient } from '@/services/api/client';

export default function CompetitionSetupScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const { clubId } = useActiveClub();
  
  const { tournament, isLoading } = useTournamentDetails(clubId, tournamentId ?? null);
  const { generateRoundRobin, isGenerating } = useMatches(clubId, tournamentId ?? null);

  const [poolCount, setPoolCount] = useState('2');
  const [teamsPerPool, setTeamsPerPool] = useState('4');
  const [qualifiers, setQualifiers] = useState('2');

  const [rounds, setRounds] = useState('4');
  const [matchesPerPlayer, setMatchesPerPlayer] = useState('4');

  const [isSettingUp, setIsSettingUp] = useState(false);

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Competition Setup" showBack />
        <View style={styles.center}><AppText>Loading...</AppText></View>
      </Screen>
    );
  }

  if (!tournament) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Competition Setup" showBack />
        <View style={styles.center}><AppText>Tournament not found.</AppText></View>
      </Screen>
    );
  }

  const handleGenerate = async () => {
    setIsSettingUp(true);
    try {
      if (tournament.format === 'round_robin') {
        await generateRoundRobin();
      } else if (tournament.format === 'pool_play') {
        await apiClient.post(`/clubs/${clubId}/tournaments/${tournamentId}/pools/configure`, {
          pool_count: parseInt(poolCount, 10),
          teams_per_pool: parseInt(teamsPerPool, 10),
          qualifiers_per_pool: parseInt(qualifiers, 10),
        });
        await apiClient.post(`/clubs/${clubId}/tournaments/${tournamentId}/pools/assign-serpentine`, {});
        await apiClient.post(`/clubs/${clubId}/tournaments/${tournamentId}/generate-pool-play`, {});
      } else if (tournament.format === 'scramble') {
        await apiClient.post(`/clubs/${clubId}/tournaments/${tournamentId}/generate-scramble`, {
          rounds: parseInt(rounds, 10),
          matches_per_player: parseInt(matchesPerPlayer, 10),
          partner_rotation: 'random',
        });
      } else if (tournament.format === 'bracket') {
        await apiClient.post(`/clubs/${clubId}/tournaments/${tournamentId}/generate-bracket`, {
          seeding_method: 'random',
        });
      }
      
      Alert.alert('Success', 'Competition generated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      Alert.alert('Generation Error', err?.message || 'Failed to generate competition.');
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="Setup Competition"
        showBack
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <AppText variant="heading2" style={styles.title}>
            Finalize {tournament.format.replace('_', ' ').toUpperCase()} Setup
          </AppText>
          
          <AppText variant="body" color="secondary" style={styles.subtitle}>
            Registration is closed. Adjust your competition parameters before generating matches.
          </AppText>

          {tournament.format === 'round_robin' && (
            <View style={styles.formatConfig}>
              <AppText variant="bodySmall" color="secondary">
                Round Robin requires no additional configuration. Every player/team will play each other once.
              </AppText>
            </View>
          )}

          {tournament.format === 'pool_play' && (
            <View style={styles.formatConfig}>
              <Input
                label="Number of Pools"
                value={poolCount}
                onChangeText={setPoolCount}
                keyboardType="number-pad"
              />
              <View style={styles.spacing} />
              <Input
                label="Teams per Pool"
                value={teamsPerPool}
                onChangeText={setTeamsPerPool}
                keyboardType="number-pad"
              />
              <View style={styles.spacing} />
              <Input
                label="Qualifiers per Pool"
                value={qualifiers}
                onChangeText={setQualifiers}
                keyboardType="number-pad"
              />
            </View>
          )}

          {tournament.format === 'scramble' && (
            <View style={styles.formatConfig}>
              <Input
                label="Total Rounds"
                value={rounds}
                onChangeText={setRounds}
                keyboardType="number-pad"
              />
              <View style={styles.spacing} />
              <Input
                label="Matches per Player"
                value={matchesPerPlayer}
                onChangeText={setMatchesPerPlayer}
                keyboardType="number-pad"
              />
            </View>
          )}

          {tournament.format === 'bracket' && (
            <View style={styles.formatConfig}>
              <AppText variant="bodySmall" color="secondary">
                Bracket will be auto-generated based on the total number of registrations.
                Byes will be assigned automatically for non-power-of-two participant counts.
              </AppText>
            </View>
          )}

          <Button
            label="Generate Competition"
            onPress={handleGenerate}
            loading={isSettingUp || isGenerating}
            style={styles.actionButton}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  scroll: {
    padding: Spacing[4],
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    padding: Spacing[4],
  },
  title: {
    marginBottom: Spacing[2],
  },
  subtitle: {
    marginBottom: Spacing[6],
  },
  formatConfig: {
    marginBottom: Spacing[6],
    padding: Spacing[4],
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  spacing: {
    height: Spacing[4],
  },
  actionButton: {
    marginTop: Spacing[2],
  },
});
