"""
Aught2 Pickleball — Default Legal Documents and Help Content Seeds
Provides clean, structured default content for initial database setup and fallback.
"""
from __future__ import annotations

DEFAULT_LEGAL_DOCUMENTS = [
    {
        "document_type": "player_terms",
        "title": "Player Terms of Service",
        "target_audience": "player",
        "version": "1.0",
        "change_summary": "Initial baseline Player Terms of Service",
        "content": """# Aught2 Pickleball — Player Terms of Service
**Version 1.0** • *Effective Date: October 2026*

Welcome to Aught2 Pickleball ("Platform"). These Player Terms of Service govern your access to and use of our mobile application, player profile, court reservations, tournaments, leagues, and related services.

---

### 1. Account Registration & Eligibility
- You must provide accurate, current, and complete information during registration.
- You are responsible for safeguarding your login credentials and for all activities that occur under your account.
- Accounts are individual and may not be transferred or shared.

### 2. Court Bookings & Reservations
- Court bookings made through the platform are reservations at designated pickleball facilities ("Clubs").
- Each club sets its own reservation windows, cancellation periods, and pricing.
- You agree to abide by each club's posted facility rules, attire policies, and code of conduct.

### 3. Competitions, Tournaments & Leagues
- When registering for tournaments or leagues, you agree to the tournament format, rules, scoring policies, and schedule published by the host club.
- Skill rating classifications (e.g., DUPR or self-ratings) must be entered honestly to preserve fair competition.
- Unsportsmanlike conduct, harassment, or match manipulation may result in immediate disqualification and platform suspension.

### 4. Payments, Fees & Refunds
- Applicable court booking fees, event entry fees, and club membership dues are billed in accordance with the rates displayed at checkout.
- Cancellation and refund policies are determined by the individual club hosting the booking or event.
- Disputed charges should be submitted through our Help & Support portal before initiating credit card chargebacks.

### 5. Code of Conduct & Safety
- Respect fellow players, facility staff, coaches, and spectators.
- Follow court safety standards and report facility hazards promptly to on-site club staff.
- Pickleball involves physical exertion; you participate at your own risk and are advised to maintain suitable physical fitness.

### 6. Modifications to Terms
- We may update these Player Terms periodically. Material updates requiring renewed acceptance will be presented in-app upon release.

---
*For support inquiries or clarification, please visit Player Profile → Help & Support.*
""",
    },
    {
        "document_type": "club_terms",
        "title": "Club & Facility Terms of Service",
        "target_audience": "club",
        "version": "1.0",
        "change_summary": "Initial baseline Club & Facility Terms of Service",
        "content": """# Aught2 Pickleball — Club & Facility Terms of Service
**Version 1.0** • *Effective Date: October 2026*

These Club & Facility Terms of Service govern the onboarding, administration, court management, booking operations, and commercial activities of club facilities utilizing the Aught2 Pickleball multi-tenant platform.

---

### 1. Facility Accreditation & Representation
- Club operators must possess legal authority to represent their sports facility, tennis/pickleball center, or recreational club.
- Information submitted during onboarding (operating hours, court surface, address, contact details) must remain accurate.

### 2. Court Scheduling & Member Access
- Clubs maintain full control over operating hours, court schedules, court pricing, and booking intervals.
- The platform enforces real-time conflict prevention, maintenance blocks, and membership privileges on behalf of the club.
- Club staff agree to honor confirmed player reservations and provide reasonable notice of emergency court closures.

### 3. Staff Roles, Permissions & Tenant Isolation
- Club owners may designate Club Managers, Tournament Directors, and Staff Members, or create Custom Staff Roles.
- Club management is strictly tenant-isolated; club personnel are prohibited from attempting to view or modify unauthorized data belonging to other clubs.

### 4. Financial Operations & Ledger Integrity
- Platform ledger records payments for court reservations, membership plans, tournaments, and coaching sessions.
- Club operators are responsible for local tax compliance, facility insurance, and business licenses applicable to their jurisdiction.

### 5. Competition Governance
- Tournaments, round robins, brackets, scrambles, and league play must adhere to standard USA Pickleball rules or club-published variants.
- Score dispute resolutions are administered by the designated club Tournament Director.

---
*For operational assistance, visit Club Settings → Help & Support.*
""",
    },
    {
        "document_type": "privacy_policy",
        "title": "Privacy Policy",
        "target_audience": "all",
        "version": "1.0",
        "change_summary": "Initial baseline Privacy Policy across Player, Club, and Platform Admin",
        "content": """# Aught2 Pickleball — Privacy Policy
**Version 1.0** • *Effective Date: October 2026*

At Aught2 Pickleball, we respect your privacy and are committed to protecting the personal data of players, club operators, and platform personnel.

---

### 1. Information We Collect
- **Player Information**: Name, email address, phone number, playing skill level, preferred hand, profile photo, court reservation history, and tournament participation.
- **Club Information**: Club name, facility address, operating schedules, court details, staff roster, and branding assets.
- **Technical & Audit Logs**: IP address, device user-agent, session timestamps, and legal acceptance records.

### 2. How We Use Information
- Facilitating court bookings, tournament draws, and league standings.
- Communicating booking confirmations, schedule notifications, and support ticket responses.
- Enforcing platform security, role-based access control, and tenant isolation.
- Maintaining compliance records for terms acceptance and payment integrity.

### 3. Data Protection & Storage
- Passwords are cryptographically hashed using salted bcrypt algorithms; raw passwords are never stored.
- All client-server communication is encrypted in transit using industry-standard TLS 1.3.
- Database access is restricted with tenant isolation safeguards preventing cross-club data exposure.

### 4. Third-Party Sharing
- We do not sell player personal information to data brokers or third-party advertisers.
- Club staff may view player contact details solely for reservation management, check-in, and tournament organization.

### 5. Your Rights & Inquiries
- You may review and update your profile information at any time via Profile Settings.
- To request data export or account closure, submit a ticket via Help & Support.

---
*Questions regarding our privacy practices may be submitted via Help & Support.*
""",
    },
    {
        "document_type": "club_agreement",
        "title": "Club/Facility Operating Agreement",
        "target_audience": "club",
        "version": "1.0",
        "change_summary": "Initial baseline Club/Facility Operating Agreement",
        "content": """# Aught2 Pickleball — Club/Facility Operating Agreement
**Version 1.0** • *Effective Date: October 2026*

This Club/Facility Operating Agreement ("Agreement") establishes the operating framework between the platform provider and approved pickleball club facilities.

---

### 1. Platform Services Provided
- Multi-court scheduling engine with sub-hour interval reservation capabilities.
- Automated tournament draw generation (Round Robin, Single/Double Elimination Bracket, Scramble, Pool Play).
- Multi-week league scheduler with dynamic standings calculations.
- Membership subscription management and digital check-in.
- Dedicated staff role assignment with custom granular permissions.

### 2. Facility Operational Commitments
- The Club agrees to maintain its physical playing surfaces, nets, lighting, and amenities in safe, playable condition.
- The Club agrees to promptly configure court maintenance blocks in the platform whenever courts are unavailable.
- The Club will honor confirmed player bookings and adhere to its published refund policies.

### 3. Service Level & Support
- Platform administrators provide technical support via the central Support Tickets desk.
- Scheduled platform maintenance will be announced in advance through administrative notices.

### 4. Termination & Continuity
- Either party may discontinue facility participation with 30 days written notice.
- Historical booking and competition records will remain archived for audit and member reference.

---
*For agreement inquiries, contact platform administration via Club Settings → Help & Support.*
""",
    },
]

DEFAULT_HELP_CATEGORIES = [
    {
        "name": "Court Bookings",
        "slug": "court-bookings",
        "target_audience": "player",
        "display_order": 1,
        "description": "How to reserve courts, check schedules, and manage booking cancellations.",
    },
    {
        "name": "Payments & Refunds",
        "slug": "payments-refunds",
        "target_audience": "all",
        "display_order": 2,
        "description": "Questions regarding court fees, tournament entry fees, receipts, and refund policies.",
    },
    {
        "name": "Memberships & Plans",
        "slug": "memberships",
        "target_audience": "all",
        "display_order": 3,
        "description": "Club membership subscriptions, renewal dates, and member-only pricing.",
    },
    {
        "name": "Tournaments & Leagues",
        "slug": "tournaments-leagues",
        "target_audience": "all",
        "display_order": 4,
        "description": "Signing up for tournaments, weekly leagues, playoff rules, and standings.",
    },
    {
        "name": "Lessons & Coaching",
        "slug": "lessons-coaching",
        "target_audience": "all",
        "display_order": 5,
        "description": "Booking private lessons, clinics, and coach schedules.",
    },
    {
        "name": "Account & Profile",
        "slug": "account-profile",
        "target_audience": "all",
        "display_order": 6,
        "description": "Profile photo updates, skill rating adjustment, passwords, and security.",
    },
    {
        "name": "Club Operations & Courts",
        "slug": "club-operations",
        "target_audience": "club",
        "display_order": 7,
        "description": "Adding courts, configuring operating hours, booking intervals, and maintenance blocks.",
    },
    {
        "name": "Staff Roles & Permissions",
        "slug": "staff-roles-permissions",
        "target_audience": "club",
        "display_order": 8,
        "description": "Inviting staff members, assigning roles, and creating custom role permissions.",
    },
]

DEFAULT_FAQS = [
    # Player FAQs
    {
        "category_slug": "court-bookings",
        "target_audience": "player",
        "question": "How do I book a court at my club?",
        "answer": "Navigate to the Courts tab from the bottom navigation or tap the central '+' action button. Choose your club facility, select your desired date and time interval, choose an available court, and confirm your reservation.",
        "display_order": 1,
    },
    {
        "category_slug": "court-bookings",
        "target_audience": "player",
        "question": "What is the policy for cancelling a court reservation?",
        "answer": "Open My Bookings in your player portal, select the reservation, and tap Cancel Booking. Cancellation deadlines and fee refunds depend on the specific host club's policy.",
        "display_order": 2,
    },
    {
        "category_slug": "payments-refunds",
        "target_audience": "all",
        "question": "How do refunds work for cancelled bookings or events?",
        "answer": "When a booking or event is cancelled within the club's allowed window, refund processing is initiated according to the club's policy. Contact your host club or submit a support ticket if your refund is delayed.",
        "display_order": 3,
    },
    {
        "category_slug": "memberships",
        "target_audience": "player",
        "question": "How do I join a club and activate membership benefits?",
        "answer": "Visit Clubs Discovery, select a club, and review their Membership Plans. Choose a plan and submit a membership request. Once approved by the club manager, your member discounts and priority booking access activate immediately.",
        "display_order": 4,
    },
    {
        "category_slug": "tournaments-leagues",
        "target_audience": "player",
        "question": "How do I register for tournaments or weekly leagues?",
        "answer": "Go to the Tournaments or Leagues section in your player portal. Filter by division (Singles or Doubles) and skill rating, then tap Register. For doubles competitions, you can invite your partner or enter team details.",
        "display_order": 5,
    },
    {
        "category_slug": "lessons-coaching",
        "target_audience": "player",
        "question": "How do I schedule a lesson with a certified coach?",
        "answer": "Open the Lessons tab on your club's page to view available coaching sessions, group clinics, and private lessons. Select a coach and available time slot to complete registration.",
        "display_order": 6,
    },
    {
        "category_slug": "account-profile",
        "target_audience": "player",
        "question": "How do I update my skill rating or profile photo?",
        "answer": "Go to Profile → Playing Details to adjust your skill rating and preferred play style. Tap the camera icon on your avatar in Profile to upload a new profile photo.",
        "display_order": 7,
    },
    # Club FAQs
    {
        "category_slug": "club-operations",
        "target_audience": "club",
        "question": "How do I add courts and configure operating hours?",
        "answer": "Navigate to Courts from your Club side menu. Tap 'Add Court' to specify the court name, surface type (indoor/outdoor), and default hourly rate. Operating hours and holiday schedules can be configured under Club Details → Operating Hours.",
        "display_order": 8,
    },
    {
        "category_slug": "staff-roles-permissions",
        "target_audience": "club",
        "question": "How do I assign custom permissions to staff members?",
        "answer": "Go to Members → Staff in the Club portal. You can assign built-in roles (Club Manager, Tournament Director, Staff Member) or create a Custom Staff Role with granular toggles for court management, tournaments, payments, and member approvals.",
        "display_order": 9,
    },
    {
        "category_slug": "tournaments-leagues",
        "target_audience": "club",
        "question": "Which tournament competition formats are supported?",
        "answer": "The platform supports Round Robin, Single and Double Elimination Brackets, Scramble (individual rotational play), and Pool Play with playoff bracket advancement. Draw generation and standings calculations are fully automated.",
        "display_order": 10,
    },
    {
        "category_slug": "payments-refunds",
        "target_audience": "club",
        "question": "Where can club managers track booking revenue and payments?",
        "answer": "Authorized staff with 'Manage Payments' permission can view the financial ledger under Payments in the Club side menu, displaying transaction histories, pending totals, and breakdown by booking type.",
        "display_order": 11,
    },
]

DEFAULT_HELP_ARTICLES = [
    {
        "category_slug": "court-bookings",
        "target_audience": "player",
        "title": "Complete Guide to Booking Courts and Managing Reservations",
        "slug": "guide-court-bookings",
        "display_order": 1,
        "content": """# Guide to Booking Courts & Reservations

Reserving a pickleball court on Aught2 Pickleball is fast and automated:

### 1. Selecting Date & Time
1. Tap the **Courts** tab in the navigation bar.
2. Select your club facility if you belong to multiple clubs.
3. Use the date picker calendar at the top to choose your playing date.
4. Available time slots are displayed with clear start and end times.

### 2. Choosing Your Court
- Indoor courts provide temperature-controlled environments.
- Outdoor cushioned courts offer premier outdoor play.
- Tap any open slot to review the pricing and interval details.

### 3. Confirming and Checking In
- Tap **Confirm Booking** to reserve the slot.
- Your reservation immediately syncs to **My Bookings**.
- Show your digital confirmation upon arrival at the facility.
""",
    },
    {
        "category_slug": "club-operations",
        "target_audience": "club",
        "title": "Club Facility Setup: Courts, Schedules, and Maintenance Blocks",
        "slug": "guide-club-facility-setup",
        "display_order": 2,
        "content": """# Facility Setup Guide for Club Operators

Setting up your club for seamless player bookings:

### 1. Court Configuration
- Set court numbers, environment (Indoor/Outdoor), and court names.
- Define booking intervals (e.g. 60 or 90 minutes).
- Specify custom peak vs non-peak hourly rates.

### 2. Operating Hours & Schedule Engine
- Configure daily opening and closing hours under Club Details.
- The platform automatically enforces operating boundaries when players view court availability.

### 3. Maintenance & Blocked Time
- Create maintenance blocks for resurfacing, cleaning, or private events.
- Maintenance blocks prevent player bookings on affected courts without deleting existing schedule configuration.
""",
    },
]

