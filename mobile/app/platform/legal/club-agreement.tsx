import React from 'react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { LegalDocumentManager } from '@/components/platform/LegalDocumentManager';

export default function PlatformClubAgreementScreen() {
  return (
    <PlatformShell activeTab="settings" scrollable={false}>
      <LegalDocumentManager documentType="club_agreement" />
    </PlatformShell>
  );
}

