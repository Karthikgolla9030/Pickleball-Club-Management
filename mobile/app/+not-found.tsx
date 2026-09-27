import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { AppText, Button, Card, Screen } from '@/components';
import { Spacing } from '@/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!', headerShown: false }} />
      <Screen>
        <View style={styles.container}>
          <Card style={styles.card}>
            <AppText variant="heading2" center>
              Page Not Found
            </AppText>
            <AppText variant="body" color="secondary" center>
              This screen doesn't exist or has moved.
            </AppText>
            <Button
              label="Go to Home"
              variant="primary"
              onPress={() => router.replace('/')}
            />
          </Card>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[4],
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing[4],
    paddingVertical: Spacing[6],
  },
});
