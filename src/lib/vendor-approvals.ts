// The five people who must each personally review and approve a new vendor
// submission before Oaziz will accept samples/product from them. This list
// is intentionally hardcoded (mirrors the fixed-role pattern used for the
// R&D forms' Jorge/Stephane roles) — Health Canada compliance requires a
// named, individual sign-off from each of these people, not a single "QA
// approved" checkbox.
export const REQUIRED_APPROVER_EMAILS = [
  'jacobp@oaziz.ca',
  'stephane@oaziz.ca',
  'jorge@oaziz.ca',
  'kyle@oaziz.ca',
  'meissam@oaziz.ca',
] as const;
