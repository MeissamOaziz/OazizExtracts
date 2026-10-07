// Server messages (flash banners, QuickBooks sync notes stored on invoices and
// payments, the sync log) are written in French. When the portal is in
// English they are translated here at display time, pattern by pattern.
// Unknown text is shown as is.

type Rule = [RegExp, string | ((...m: string[]) => string)];

const RULES: Rule[] = [
  // QuickBooks connection / sync
  [/^QuickBooks non connecté — supprimez la facture dans QB manuellement$/, 'QuickBooks not connected — delete the bill in QB by hand'],
  [/^QuickBooks non connecté$/, 'QuickBooks not connected'],
  [/^QuickBooks déconnecté\.$/, 'QuickBooks disconnected.'],
  [/^Connexion QuickBooks expirée — reconnectez QuickBooks\.$/, 'QuickBooks connection expired — reconnect QuickBooks.'],
  [/^Nouvelle compagnie QuickBooks : liens de l’ancienne compagnie effacés$/, 'New QuickBooks company: links to the previous company cleared'],
  [/^Paramètres QuickBooks enregistrés\.$/, 'QuickBooks settings saved.'],
  [/^Lien QuickBooks enregistré\.$/, 'QuickBooks link saved.'],
  [/^Ce fournisseur QB est déjà lié à un autre fournisseur du portail\.$/, 'That QB vendor is already linked to another portal supplier.'],
  [/^Synchronisé : (\d+) facture\(s\) et (\d+) paiement\(s\) envoyés, (\d+) facture\(s\) et (\d+) paiement\(s\) importés(?: — (\d+) à corriger \(voir le journal\))?$/,
    (_, a, b, c, d, e) => `Synced: ${a} bill(s) and ${b} payment(s) sent, ${c} bill(s) and ${d} payment(s) imported${e ? ` — ${e} to fix (see the log)` : ''}`],
  [/^(\d+) facture\(s\) et (\d+) paiement\(s\) envoyés, (\d+) facture\(s\) et (\d+) paiement\(s\) importés(?:, (\d+) à corriger)?$/,
    (_, a, b, c, d, e) => `${a} bill(s) and ${b} payment(s) sent, ${c} bill(s) and ${d} payment(s) imported${e ? `, ${e} to fix` : ''}`],
  [/^(\d+) fournisseur\(s\) liés automatiquement, (\d+) facture\(s\) ouvertes rapprochées$/, (_, a, b) => `${a} supplier(s) linked automatically, ${b} open bill(s) matched`],
  [/^reconnect_required$/, 'reconnect required'],

  // Invoices → bills
  [/^À classer : choisissez le compte de dépense QuickBooks \(Paiements → QuickBooks → Factures à classer\)$/,
    'To classify: choose the QuickBooks expense account (Payments → QuickBooks → Bills to classify)'],
  [/^Facture introuvable$/, 'Invoice not found'],
  [/^Facture invalide$/, 'Invalid invoice'],
  [/^Facture annulée$/, 'Invoice voided'],
  [/^Déjà dans QuickBooks$/, 'Already in QuickBooks'],
  [/^Provient de QuickBooks$/, 'Comes from QuickBooks'],
  [/^Envoyée à QuickBooks$/, 'Sent to QuickBooks'],
  [/^Les soldes d’ouverture et ajustements ne sont pas envoyés à QB$/, 'Opening balances and adjustments are not sent to QB'],
  [/^Facture importée du classeur — déjà dans QB en principe$/, 'Invoice imported from the workbook — normally already in QB'],
  [/^Total dans QB ([\d.]+) \$ ≠ portail ([\d.]+) \$ — vérifiez la taxe dans QB$/, (_, a, b) => `QB total $${a} ≠ portal $${b} — check the tax in QB`],
  [/^PDF non joint dans QB \((.*)\)$/, (_, e) => `PDF not attached in QB (${e})`],
  [/^(Bill|VendorCredit) (.*) créée$/, (_, t, num) => `${t} ${num} created`],
  [/^Facture supprimée dans QB \(annulée au portail\)$/, 'Bill deleted in QB (voided in the portal)'],
  [/^Suppression dans QB impossible \((.*)\) — supprimez-la dans QB manuellement$/, (_, e) => `Could not delete in QB (${e}) — delete it in QB by hand`],
  [/^Montant modifié dans QB : ([\d.]+) \$ \(portail ([\d.]+) \$\)$/, (_, a, b) => `Amount changed in QB: $${a} (portal $${b})`],
  [/^Facture (.*) importée de QB \((.*)\)$/, (_, num, s) => `Bill ${num} imported from QB (${s})`],
  [/^Choisissez un compte de dépense\.$/, 'Choose an expense account.'],

  // Payments → bill payments
  [/^Paiement introuvable ou annulé$/, 'Payment not found or voided'],
  [/^Paiement invalide$/, 'Invalid payment'],
  [/^Non envoyé \(historique ou provenant de QB\)$/, 'Not sent (historical or from QB)'],
  [/^Compte bancaire « (.*) » non lié à un compte QB — voir Paiements → QuickBooks$/, (_, b) => `Bank account "${b}" is not linked to a QB account — see Payments → QuickBooks`],
  [/^Aucune des factures payées n’est liée à une facture QB — enregistrez ce paiement dans QB manuellement$/,
    'None of the paid invoices is linked to a QB bill — record this payment in QB by hand'],
  [/^Seuls ([\d.]+) \$ sur ([\d.]+) \$ liés à des factures QB$/, (_, a, b) => `Only $${a} of $${b} linked to QB bills`],
  [/^Paiement ([\d.]+) \$ créé$/, (_, a) => `Payment $${a} created`],
  [/^Paiement créé dans QuickBooks$/, 'Payment created in QuickBooks'],
  [/^Paiement (.*) mis à jour dans QB$/, (_, r) => `Payment ${r} updated in QB`],
  [/^Paiement supprimé dans QB \(annulé au portail\)$/, 'Payment deleted in QB (voided in the portal)'],
  [/^Suppression dans QB impossible : (.*)$/, (_, e) => `Could not delete in QB: ${e}`],
  [/^Paiement ([\d.]+) \$ importé de QB \((.*)\)$/, (_, a, s) => `Payment $${a} imported from QB (${s})`],
  [/^Référence (.*) déjà utilisée — (.*), ([\d.]+) \$, (\S+)$/, (_, r, s, a, d) => `Reference ${r} already used — ${s}, $${a}, ${d}`],

  // Vendors
  [/^Fournisseur créé dans QB : (.*)$/, (_, v) => `Vendor created in QB: ${v}`],
  [/^Fournisseur QB « (.*) » non lié au portail$/, (_, v) => `QB vendor "${v}" not linked to the portal`],
  [/^Lien fournisseur QB refusé : (.*)$/, (_, e) => `QB vendor link refused: ${e}`],
  [/^Fournisseur invalide$/, 'Invalid supplier'],

  // Differences page
  [/^Fournisseur non lié à QuickBooks\.$/, 'Supplier not linked to QuickBooks.'],
  [/^Déjà concordant\.$/, 'Already matching.'],
  [/^Indiquez la raison de l’ajustement\.$/, 'Enter the reason for the adjustment.'],
  [/^Indiquez la raison\.$/, 'Enter the reason.'],
  [/^Solde du portail ajusté de (-?[\d.]+) \$ pour concorder avec QuickBooks\.$/, (_, a) => `Portal balance adjusted by $${a} to match QuickBooks.`],
  [/^Facture (.*) ajustée à ([\d.]+) \$\.$/, (_, num, a) => `Invoice ${num} adjusted to $${a}.`],
  [/^Facture (.*) soldée dans le portail\.$/, (_, num) => `Invoice ${num} closed in the portal.`],
  [/^Document QB invalide$/, 'Invalid QB document'],
  [/^Document introuvable dans QuickBooks$/, 'Document not found in QuickBooks'],
  [/^Ce document QB est déjà lié à une facture du portail\.$/, 'That QB document is already linked to a portal invoice.'],
  [/^(Crédit|Facture) (.*) importé\(e\) de QuickBooks\.$/, (_, k, num) => `${k === 'Crédit' ? 'Credit' : 'Invoice'} ${num} imported from QuickBooks.`],
  [/^Choisissez la facture QB à lier\.$/, 'Choose the QB bill to link.'],
  [/^Facture liée au document QuickBooks\.$/, 'Invoice linked to the QuickBooks document.'],

  // Weekly run / approvals
  [/^Accès refusé$/, 'Access denied'],
  [/^Requête invalide\.$/, 'Invalid request.'],
  [/^Montant invalide\.?$/i, 'Invalid amount.'],
  [/^Montant payé invalide\.$/, 'Invalid paid amount.'],
  [/^Indiquez la raison de la modification\.$/, 'Enter the reason for the change.'],
  [/^La semaine n’est pas approuvée\.$/, 'The week is not approved.'],
  [/^Déjà approuvé\.$/, 'Already approved.'],
  [/^Déjà approuvé ou retiré\.$/, 'Already approved or withdrawn.'],
  [/^déjà payé$/, 'already paid'],
  [/^non approuvé$/, 'not approved'],
  [/^introuvable$/, 'not found'],
  [/^échec$/, 'failed'],
  [/^Aucun fichier\.$/, 'No file.'],
  [/^Fichier trop volumineux \(20 Mo max\)\.$/, 'File too large (20 MB max).'],
  [/^PDF, JPG, PNG ou WEBP seulement\.$/, 'PDF, JPG, PNG or WEBP only.'],
  [/^Téléversement impossible\.$/, 'Upload failed.'],
  [/^Le document n’a pas pu être lu \(refus du modèle\)\.$/, 'The document could not be read (model refusal).'],
  [/^Lecture incomplète du document\.$/, 'Incomplete reading of the document.'],
];

export function localizeMsg(text: string | null | undefined, locale: string): string {
  if (!text) return '';
  if (locale !== 'en') return text;
  // Several notes can be joined with " · " (e.g. a warning plus a PDF note).
  return text.split(' · ').map((part) => {
    for (const [re, out] of RULES) {
      const m = re.exec(part);
      if (m) return typeof out === 'string' ? out : out(...(m as unknown as string[]));
    }
    return part;
  }).join(' · ');
}
