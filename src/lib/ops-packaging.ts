// Atelier — packaging run helpers.
//
// The rules that decide whether a run may close live in ops_complete_packaging_run()
// so they cannot be bypassed. What is here is the same set of rules read forwards,
// so the screen can show what is still missing BEFORE someone fills in the
// quantities and gets refused. If these two ever disagree, the database wins.

export const PACKAGING_STATUSES = {
  draft: { fr: 'En préparation', en: 'In preparation' },
  done: { fr: 'Terminé', en: 'Completed' },
  cancelled: { fr: 'Annulé', en: 'Cancelled' },
} as const;

export type RequirementState = 'ok' | 'missing' | 'na';

export interface Requirement {
  key: 'gtin' | 'caseGtin' | 'unitsPerCase' | 'cultivar' | 'province' | 'thc';
  state: RequirementState;
  /** What to do about it, when it is missing. */
  fixHref?: string;
}

interface RunContext {
  product: {
    id: string;
    is_bulk?: boolean | null;
    gtin?: string | null;
    case_gtin?: string | null;
    units_per_case?: number | null;
    requires_excise?: boolean | null;
    is_rotational?: boolean | null;
  };
  /** The destination customer, when the run serves an order. */
  customerRequiresCaseGtin: boolean;
  isExcised: boolean;
  exciseProvince?: string | null;
  cultivar?: string | null;
  thcPct?: number | null;
}

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

export function requirementsFor(ctx: RunContext): Requirement[] {
  const { product: p } = ctx;
  const productHref = '/portail/atelier/parametres/produits';

  const out: Requirement[] = [];

  // A unit that is not bulk gets scanned at retail, so it needs its barcode.
  out.push({
    key: 'gtin',
    state: p.is_bulk ? 'na' : filled(p.gtin) ? 'ok' : 'missing',
    fixHref: productHref,
  });

  // SQDC and OCS reject a shipment whose cases are not identified.
  out.push({
    key: 'caseGtin',
    state: !ctx.customerRequiresCaseGtin ? 'na' : filled(p.case_gtin) ? 'ok' : 'missing',
    fixHref: productHref,
  });
  out.push({
    key: 'unitsPerCase',
    state: !ctx.customerRequiresCaseGtin ? 'na' : (p.units_per_case ?? 0) > 0 ? 'ok' : 'missing',
    fixHref: productHref,
  });

  // A rotational SKU carries the cultivar on the label.
  out.push({
    key: 'cultivar',
    state: !p.is_rotational ? 'na' : filled(ctx.cultivar) ? 'ok' : 'missing',
  });

  // Excise stamps are provincial.
  const excisable = p.requires_excise !== false;
  out.push({
    key: 'province',
    state: !(excisable && ctx.isExcised) ? 'na' : filled(ctx.exciseProvince) ? 'ok' : 'missing',
  });

  out.push({
    key: 'thc',
    state: ctx.thcPct === null || ctx.thcPct === undefined ? 'missing' : 'ok',
  });

  return out;
}

export function blockingCount(reqs: Requirement[]): number {
  return reqs.filter((r) => r.state === 'missing').length;
}

/** Grams a run is expected to need, for the prefill. Bulk SKUs have no unit size. */
export function expectedGrams(units: number | null, unitSizeG: number | null): number | null {
  if (!units || !unitSizeG) return null;
  return Math.round(units * unitSizeG * 1000) / 1000;
}
