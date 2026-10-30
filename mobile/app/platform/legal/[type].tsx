import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { HelpAndFaqsManager } from '@/components/platform/HelpAndFaqsManager';
import { LegalDocumentManager, LegalDocType } from '@/components/platform/LegalDocumentManager';

export default function PlatformLegalDynamicScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const rawType = (params.type || '').toLowerCase().replace(/-/g, '_');

  if (rawType === 'help_faqs' || rawType === 'help' || rawType === 'faqs') {
    return (
      <PlatformShell activeTab="settings" scrollable={false}>
        <HelpAndFaqsManager />
      </PlatformShell>
    );
  }

  let docType: LegalDocType = 'player_terms';
  if (rawType === 'club_terms' || rawType === 'club') {
    docType = 'club_terms';
  } else if (rawType === 'privacy_policy' || rawType === 'privacy') {
    docType = 'privacy_policy';
  } else if (rawType === 'club_agreement' || rawType === 'agreement') {
    docType = 'club_agreement';
  } else if (rawType === 'player_terms' || rawType === 'player') {
    docType = 'player_terms';
  }

  return (
    <PlatformShell activeTab="settings" scrollable={false}>
      <LegalDocumentManager documentType={docType} />
    </PlatformShell>
  );
}

