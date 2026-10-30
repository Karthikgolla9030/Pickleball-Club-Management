import React from 'react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { HelpAndFaqsManager } from '@/components/platform/HelpAndFaqsManager';

export default function PlatformHelpFaqsScreen() {
  return (
    <PlatformShell activeTab="settings" scrollable={false}>
      <HelpAndFaqsManager />
    </PlatformShell>
  );
}

