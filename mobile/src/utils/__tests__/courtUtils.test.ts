import { getCourtDisplayLabel, isUUIDOrTechnicalId } from '../courtUtils';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Test failed: ${msg}`);
  }
}

export function runCourtUtilsTests(): void {
  // 1. isUUIDOrTechnicalId
  assert(isUUIDOrTechnicalId('caa7ae17-e67f-4849-a67f-ddc3cebb410d') === true, 'should detect UUID');
  assert(isUUIDOrTechnicalId('Court caa7ae17-e67f-4849-a67f-ddc3cebb410d') === true, 'should detect UUID in string');
  assert(isUUIDOrTechnicalId('CAA7AE17-E67F-4849-A67F-DDC3CEBB410D') === true, 'should detect uppercase UUID');
  assert(isUUIDOrTechnicalId('Court 1') === false, 'Court 1 is not UUID');
  assert(isUUIDOrTechnicalId('Center Court') === false, 'Center Court is not UUID');
  assert(isUUIDOrTechnicalId('Court A') === false, 'Court A is not UUID');
  assert(isUUIDOrTechnicalId(null) === false, 'null is not UUID');
  assert(isUUIDOrTechnicalId(undefined) === false, 'undefined is not UUID');

  // 2. getCourtDisplayLabel - Valid named courts
  assert(
    getCourtDisplayLabel({
      court_id: 'caa7ae17-e67f-4849-a67f-ddc3cebb410d',
      court_name: 'Center Court',
      court_number: 1,
    }) === 'Center Court',
    'court_name takes precedence when valid'
  );

  assert(
    getCourtDisplayLabel({
      court_id: 'caa7ae17-e67f-4849-a67f-ddc3cebb410d',
      court: {
        display_name: 'Stadium Court',
        name: 'Court 5',
        court_number: 5,
      },
    }) === 'Stadium Court',
    'court.display_name takes precedence'
  );

  // 3. getCourtDisplayLabel - Numeric fallbacks
  assert(
    getCourtDisplayLabel({
      court_id: 'caa7ae17-e67f-4849-a67f-ddc3cebb410d',
      court_number: 4,
    }) === 'Court 4',
    'court_number produces Court 4'
  );

  // 4. getCourtDisplayLabel - UUID protection invariant (never leak technical IDs)
  assert(
    getCourtDisplayLabel({
      court_id: 'caa7ae17-e67f-4849-a67f-ddc3cebb410d',
      court_name: 'Court caa7ae17-e67f-4849-a67f-ddc3cebb410d',
      court_number: 3,
    }) === 'Court 3',
    'UUID in court_name is rejected and falls back to court_number'
  );

  assert(
    getCourtDisplayLabel({
      court_id: 'caa7ae17-e67f-4849-a67f-ddc3cebb410d',
      court_name: 'caa7ae17-e67f-4849-a67f-ddc3cebb410d',
    }) === 'Court TBD',
    'Raw UUID court_name rejected and falls back to unresolvedLabel'
  );

  // 5. getCourtDisplayLabel - Unassigned & options
  assert(
    getCourtDisplayLabel({ court_id: null }) === 'Court not assigned',
    'null court_id is unassigned'
  );

  assert(
    getCourtDisplayLabel(null, { unassignedLabel: 'Court TBD' }) === 'Court TBD',
    'custom unassigned label respected'
  );

  assert(
    getCourtDisplayLabel({ court_id: null }, { omitIfUnassigned: true }) === '',
    'omitIfUnassigned returns empty string'
  );
}

// Run tests when executed directly
if (typeof process !== 'undefined') {
  runCourtUtilsTests();
}
