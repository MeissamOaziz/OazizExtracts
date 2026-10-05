// Portal module access control. Each staff member has a preset role whose
// default permissions can be overridden per user (true = granted, false =
// denied) from the admin panel. Enforced centrally by src/middleware.ts via
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

export const ROLES = ['admin', 'qa', 'sales', 'production'] as const;
export type PortalRole = (typeof ROLES)[number];

export const ROLE_PRESETS: Record<PortalRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  qa: ['rnd', 'vq', 'licenses', 'hr', 'hr_employees'],
  sales: ['rnd', 'calculators', 'vq', 'licenses'],
  production: ['rnd', 'hr', 'hr_employees'],
};

export type PermissionOverrides = Partial<Record<Permission, boolean>>;

// Atelier isn't open to the team yet: only these accounts can ever get the
// 'atelier' permission, no matter their role or overrides.
export const ATELIER_ALLOWED_EMAILS: readonly string[] = ['meissam@oaziz.ca'];

// Supplier payments hold banking details and the company's cash position:
// restricted to these accounts regardless of role (add Nathalie here once she
// has a portal login).
export const PAYABLES_ALLOWED_EMAILS: readonly string[] = ['meissam@oaziz.ca'];
// Who may open the approver screens (past approvals + the pending one) by
// logging in. Add jorge@oaziz.ca when the module goes live for him.
export const PAYABLES_APPROVER_EMAILS: readonly string[] = ['meissam@oaziz.ca'];

export interface AccessSubject {
  email: string;
  portal_role: string | null;
  portal_permission_overrides: unknown;
}

export function isRole(v: unknown): v is PortalRole {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

export function cleanOverrides(raw: unknown): PermissionOverrides {
  const out: PermissionOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const p of PERMISSIONS) {
    const v = (raw as Record<string, unknown>)[p];
    if (v === true || v === false) out[p] = v;
  }
  return out;
}

// Admins always have everything (so the last admin can never lock themselves
// out through an override); everyone else = preset + overrides. No role =
// no access.
export function effectivePermissions(s: AccessSubject): Set<Permission> {
  const perms = rolePermissions(s);
  if (!ATELIER_ALLOWED_EMAILS.includes((s.email ?? '').toLowerCase())) perms.delete('atelier');
  if (!PAYABLES_ALLOWED_EMAILS.includes((s.email ?? '').toLowerCase())) perms.delete('payables');
  if (!PAYABLES_APPROVER_EMAILS.includes((s.email ?? '').toLowerCase())) perms.delete('payables_approve');
  return perms;
}

function rolePermissions(s: AccessSubject): Set<Permission> {
  if (!isRole(s.portal_role)) return new Set();
  if (s.portal_role === 'admin') return new Set(PERMISSIONS);
  const perms = new Set<Permission>(ROLE_PRESETS[s.portal_role]);
  const overrides = cleanOverrides(s.portal_permission_overrides);
  for (const p of PERMISSIONS) {
    if (overrides[p] === true) perms.add(p);
    else if (overrides[p] === false) perms.delete(p);
  }
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
