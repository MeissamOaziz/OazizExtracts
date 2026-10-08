// Portal module access control. Each staff member has an explicit list of
// modules ticked in the admin panel (stored in portal_permission_overrides as
// { permission: true }). Enforced centrally by src/middleware.ts via
// ROUTE_RULES, and used by pages/layout to hide what a user can't open.

export const PERMISSIONS = [
  'rnd',             // R&D forms (sample requests, R&D, consent)
  'calculators',     // Calculators
  'vq',              // Vendor qualification (submissions, invitations, approvals)
  'licenses',        // Oaziz's own CRA / Health Canada licenses
  'hr',              // HR documents: work attestation, incident report
  'hr_employees',    // HR new-employee packages
  'hr_evaluations',  // HR employee evaluations + tracker
  'atelier',         // Atelier (production / orders)
  'payables',        // Supplier payments: invoices, weekly payment run, approvals
  'payables_approve', // Approve weekly supplier payments + see past approvals (Jorge)
  'admin',           // Admin panel: users and access
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Legacy role presets — only used to read accounts not yet converted to
// explicit ticks (portal_role still set). New saves always clear the role.
const LEGACY_ROLES = ['admin', 'qa', 'sales', 'production'] as const;
type LegacyRole = (typeof LEGACY_ROLES)[number];
const LEGACY_PRESETS: Record<LegacyRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  qa: ['rnd', 'vq', 'licenses', 'hr', 'hr_employees'],
  sales: ['rnd', 'calculators', 'vq', 'licenses'],
  production: ['rnd', 'hr', 'hr_employees'],
};

export type PermissionGrants = Partial<Record<Permission, boolean>>;

// Modules not open to the team yet: only these accounts can ever get them,
// whatever is ticked. Lift a lock by adding the email (e.g. Nathalie for
// payables, jorge@oaziz.ca for payables_approve) or removing the entry.
export const RESTRICTED: Partial<Record<Permission, readonly string[]>> = {
  atelier: ['meissam@oaziz.ca'],
  payables: ['meissam@oaziz.ca'],
  payables_approve: ['meissam@oaziz.ca'],
};
// Who may set a supplier's payment status (Not due / Unpaid / Paid) on the weekly page.
export const DUE_STATUS_EDITORS: readonly string[] = ['meissam@oaziz.ca'];
export const ATELIER_ALLOWED_EMAILS = RESTRICTED.atelier!;
export const PAYABLES_ALLOWED_EMAILS = RESTRICTED.payables!;
export const PAYABLES_APPROVER_EMAILS = RESTRICTED.payables_approve!;

/** True when the module is locked for this email (allowlist). */
export function isLocked(perm: Permission, email: string | null | undefined): boolean {
  const list = RESTRICTED[perm];
  return !!list && !list.includes((email ?? '').toLowerCase());
}

export interface AccessSubject {
  email: string;
  portal_role: string | null;
  portal_permission_overrides: unknown;
}

export function cleanGrants(raw: unknown): PermissionGrants {
  const out: PermissionGrants = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const p of PERMISSIONS) {
    const v = (raw as Record<string, unknown>)[p];
    if (v === true || v === false) out[p] = v;
  }
  return out;
}

/** What is ticked for the user (before allowlist locks). */
export function grantedPermissions(s: AccessSubject): Set<Permission> {
  const grants = cleanGrants(s.portal_permission_overrides);
  const role = s.portal_role as LegacyRole | null;
  if (role && (LEGACY_ROLES as readonly string[]).includes(role)) {
    // Legacy account: role preset adjusted by overrides.
    const perms = new Set<Permission>(LEGACY_PRESETS[role]);
    if (role !== 'admin') {
      for (const p of PERMISSIONS) {
        if (grants[p] === true) perms.add(p);
        else if (grants[p] === false) perms.delete(p);
      }
    }
    return perms;
  }
  return new Set(PERMISSIONS.filter((p) => grants[p] === true));
}

/** What the user can actually open: ticked modules minus locked ones. */
export function effectivePermissions(s: AccessSubject): Set<Permission> {
  const perms = grantedPermissions(s);
  for (const p of [...perms]) if (isLocked(p, s.email)) perms.delete(p);
  return perms;
}

export const can = (perms: ReadonlySet<Permission>, ...any: Permission[]) => any.some((p) => perms.has(p));

// A person who has been assigned a specific piece of work (e.g. countersign a
// new-employee package, approve a vendor) can always open that one item even
// without the module permission — otherwise an email link would 403.
export type AssignedKind = 'vendor_approver' | 'package_witness';

export interface RouteRule {
  test: (path: string) => boolean;
  any: Permission[];
  assigned?: AssignedKind;
}

const under = (prefix: string) => (path: string) => path === prefix || path.startsWith(prefix + '/');

const RND_EXEMPT = [
  /^\/portail\/demande\/[^/]+\/signer\/?$/,       // signing is gated by a pending signer token
  /^\/api\/portail\/submissions\/[^/]+\/sign-as-me\/?$/,
];

// First match wins — order matters (most specific first).
export const ROUTE_RULES: RouteRule[] = [
  { test: under('/portail/admin'), any: ['admin'] },
  { test: under('/api/portail/admin'), any: ['admin'] },

  { test: under('/portail/atelier'), any: ['atelier'] },
  { test: under('/api/portail/atelier'), any: ['atelier'] },

  { test: under('/portail/paiements/approbations'), any: ['payables', 'payables_approve'] },
  { test: under('/api/portail/paiements/approbations'), any: ['payables', 'payables_approve'] },
  { test: under('/portail/paiements'), any: ['payables'] },
  { test: under('/api/portail/paiements'), any: ['payables'] },
  // /portail/approbation-paiements/<token> is deliberately unruled: the
  // approver opens it from an email, gated by the run's single-use token.

  { test: under('/portail/calculatrices'), any: ['calculators'] },

  { test: under('/portail/fournisseurs/licences'), any: ['licenses'] },
  { test: under('/api/portail/company-licenses'), any: ['licenses'] },
  { test: under('/portail/fournisseurs'), any: ['vq'], assigned: 'vendor_approver' },
  { test: under('/api/portail/vendor-submissions'), any: ['vq'], assigned: 'vendor_approver' },

  { test: under('/portail/rh/evaluation'), any: ['hr_evaluations'] },
  { test: under('/portail/rh/employes'), any: ['hr_employees'], assigned: 'package_witness' },
  { test: under('/api/portail/rh/employees'), any: ['hr_employees'], assigned: 'package_witness' },
  { test: under('/portail/rh/attestation'), any: ['hr'] },
  { test: under('/portail/rh/incident'), any: ['hr'] },
  // Hub + generate + documents: gated per kind inside the handlers too.
  { test: under('/portail/rh'), any: ['hr', 'hr_employees', 'hr_evaluations'] },
  { test: under('/api/portail/rh'), any: ['hr', 'hr_employees', 'hr_evaluations'] },

  {
    test: (p) =>
      !RND_EXEMPT.some((re) => re.test(p)) &&
      (under('/portail/formulaires')(p) || under('/portail/nouvelle')(p) || under('/portail/demande')(p) ||
        under('/api/portail/submissions')(p) || under('/api/portail/documents')(p)),
    any: ['rnd'],
  },
];

export function matchRule(path: string): RouteRule | null {
  const clean = path.replace(/\/+$/, '') || '/';
  return ROUTE_RULES.find((r) => r.test(clean)) ?? null;
}

// The module a user lands on from the hub / nav.
export interface ModuleLink { key: string; href: string; perms: Permission[] }
export const MODULES: ModuleLink[] = [
  { key: 'rnd', href: '/portail/formulaires', perms: ['rnd'] },
  { key: 'atelier', href: '/portail/atelier', perms: ['atelier'] },
  { key: 'payables', href: '/portail/paiements', perms: ['payables', 'payables_approve'] },
  { key: 'calculators', href: '/portail/calculatrices', perms: ['calculators'] },
  { key: 'vq', href: '/portail/fournisseurs', perms: ['vq', 'licenses'] },
  { key: 'hr', href: '/portail/rh', perms: ['hr', 'hr_employees', 'hr_evaluations'] },
];

// The VQ module opens on the vendor list, or straight on the license page for
// people who only have license access.
// Approver-only users land on their approvals list, not the payment workspace.
export function payablesHref(perms: ReadonlySet<Permission>): string {
  return perms.has('payables') ? '/portail/paiements' : '/portail/paiements/approbations';
}

export function vqHref(perms: ReadonlySet<Permission>): string {
  return perms.has('vq') ? '/portail/fournisseurs' : '/portail/fournisseurs/licences';
}
