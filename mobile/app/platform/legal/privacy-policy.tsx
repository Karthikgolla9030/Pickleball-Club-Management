import React from 'react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { LegalDocumentManager } from '@/components/platform/LegalDocumentManager';

export default function PlatformPrivacyPolicyScreen() {
  return (
    <PlatformShell activeTab="settings" scrollable={false}>
      <LegalDocumentManager documentType="privacy_policy" />
    </PlatformShell>
  );
}

