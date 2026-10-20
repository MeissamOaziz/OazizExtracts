// QuickBooks customers, read-only: finds the customer of an order by name and
// returns its shipping address (billing address when no shipping one is set).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getQbo } from './qbo';
import { nameScore } from './name-match';

/** Below this, two names are not taken as the same customer. */
const MATCH = 0.85;

export interface QboShipTo { customer: string; address: string; from: 'ship' | 'bill' }

interface QboAddr {
  Line1?: string; Line2?: string; Line3?: string; Line4?: string; Line5?: string;
  City?: string; CountrySubDivisionCode?: string; PostalCode?: string; Country?: string;
}

/** "67 SINCLAIR BLVD\nBRANTFORD, ON, CANADA, N3S 7X6" — the shape QA writes on the forms. */
export function formatQboAddress(a: QboAddr | null | undefined): string | null {
  if (!a) return null;
  const street = [a.Line1, a.Line2, a.Line3, a.Line4, a.Line5].map((l) => l?.trim()).filter(Boolean) as string[];
  const city = [a.City, a.CountrySubDivisionCode, a.Country, a.PostalCode].map((p) => p?.trim()).filter(Boolean).join(', ');
  const lines = [...street, ...(city ? [city] : [])];
  return lines.length ? lines.join('\n') : null;
}

/** Best match among customers for a company name, or null below MATCH. */
export function pickCustomer<T extends { DisplayName?: string; CompanyName?: string; FullyQualifiedName?: string }>(
  customers: T[], name: string,
): T | null {
  let best: T | null = null; let bestScore = 0;
  for (const c of customers) {
    const s = Math.max(nameScore(name, c.DisplayName), nameScore(name, c.CompanyName), nameScore(name, c.FullyQualifiedName));
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return bestScore >= MATCH ? best : null;
}

/**
 * The ship-to address QuickBooks has for this customer. Null when QuickBooks
 * is not connected, no customer matches, or the customer has no address.
 */
export async function qboShipTo(admin: SupabaseClient, customerName: string | null): Promise<QboShipTo | null> {
  if (!customerName?.trim()) return null;
  const qbo = await getQbo(admin);
  if (!qbo) return null;
  const customers = await qbo.query<any>('Customer', 'Active = true');
  const c = pickCustomer(customers, customerName);
  if (!c) return null;
  const ship = formatQboAddress(c.ShipAddr);
  const bill = formatQboAddress(c.BillAddr);
  const address = ship ?? bill;
  return address ? { customer: c.DisplayName ?? c.CompanyName ?? customerName, address, from: ship ? 'ship' : 'bill' } : null;
}
