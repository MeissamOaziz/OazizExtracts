// Chain of Custody form (controlled document, author Stéphane Paquin) for a
// shipment. A draft (watermarked) until QA verifies it and signs in the portal;
// the signed PDF is sent to the customer, who signs Part B and returns it.
// Filled with what the shipment knows: courier and tracking #, dates, vehicle
// check (YES unless QA says otherwise), temperature (N/A unless stated), the
// departure time QA enters, and the QA signature. Not used for the OCS.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { OAZIZ_LOGO_PNG_B64 } from './templates/oaziz-logo';

export interface CocData {
  cocNo: string;
  /** Date of shipment, YYYY-MM-DD. */
  shipDate: string;
  customer: string | null;
  shipTo: string | null;
  carrier: string | null;
  trackingNo: string | null;
  /** One bullet per product: "Juicy J Bubble Hash — Lot 74494, 2 843 g". */
  products: string[];
  vehicleOk: boolean;
  vehicleNote: string | null;
  temperature: string;
  departureTime: string | null;
  /** QA signature (PNG data URL) and who signed; absent on a draft. */
  signature: string | null;
  signerName: string | null;
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

// Standard PDF fonts only know Latin-1.
function pdfText(s: string | null | undefined): string {
  return String(s ?? '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[  ]/g, ' ').replace(/[^\x20-\x7e\xa0-\xff]/g, '');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  // Split on line breaks first: pdfText drops them.
  for (const para of String(text ?? '').split(/\r?\n/).map(pdfText)) {
    let cur = '';
    for (const w of para.split(' ')) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}

export async function buildCocPdf(d: CocData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Chain of Custody ${d.cocNo}`);
  doc.setAuthor('Oaziz Extracts Inc.');
  const page: PDFPage = doc.addPage([612, 792]); // letter
  const arial = await doc.embedFont(StandardFonts.Helvetica);
  const arialB = await doc.embedFont(StandardFonts.HelveticaBold);
  const times = await doc.embedFont(StandardFonts.TimesRomanBold);
  const logo = await doc.embedPng(Buffer.from(OAZIZ_LOGO_PNG_B64, 'base64'));
  const sig = d.signature ? await doc.embedPng(Buffer.from(d.signature.split(',')[1] ?? '', 'base64')) : null;
  const ink = rgb(0, 0, 0);
  const grey = rgb(0.75, 0.75, 0.75);
  const band = rgb(0.9, 0.9, 0.9);
  const blue = rgb(0.02, 0.27, 0.76);

  const text = (t: string, x: number, y: number, size: number, font: PDFFont = arial, color = ink) =>
    page.drawText(pdfText(t), { x, y, size, font, color });
  const box = (x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y, width: w, height: h, borderColor: ink, borderWidth: 0.75, ...(fill ? { color: fill } : {}) });
  const centred = (t: string, cx: number, y: number, size: number, font: PDFFont) =>
    text(t, cx - font.widthOfTextAtSize(pdfText(t), size) / 2, y, size, font);

  // ------------------------------------------------------------ header
  const L = 63; const R = 559; const W = R - L;
  box(L, 652, 125, 113);
  page.drawImage(logo, { x: L + 10, y: 657, width: 103, height: 103 });
  box(L + 125, 652, W - 125, 113, grey);
  centred('Oaziz Extracts Inc.', L + 125 + (W - 125) / 2, 712, 17, times);
  centred('Controlled Document', L + 125 + (W - 125) / 2, 692, 17, times);
  box(L, 606, 248, 46);
  text('Title: Chain of Custody Form', L + 6, 624, 11.5, times);
  box(L + 248, 629, 135, 23); box(L + 383, 629, W - 383, 23);
  box(L + 248, 606, 135, 23); box(L + 383, 606, W - 383, 23);
  text(`COC #: ${d.cocNo}`, L + 253, 637, 7, arialB);
  text('Page: 1 of 1', L + 388, 637, 7);
  text('Author:  Stephane Paquin', L + 253, 614, 7);
  text('Effective Date:', L + 388, 618, 7);
  text('01-November-2022', L + 388, 609, 7);

  const title = 'Chain of Custody Form';
  centred(title, 306, 575, 13, arialB);
  const tw = arialB.widthOfTextAtSize(title, 13);
  page.drawLine({ start: { x: 306 - tw / 2, y: 572 }, end: { x: 306 + tw / 2, y: 572 }, thickness: 0.9, color: ink });

  // ------------------------------------------------------------- table
  const T = 66; const TW = 480; const LW = 196; const VX = T + LW + 6; const VW = TW - LW - 12;
  let y = 556;
  const section = (label: string) => {
    box(T, y - 26, TW, 26, band);
    text(label, T + 6, y - 15, 10.5, arialB);
    y -= 26;
  };
  /** A label | value row; label and value may wrap. `value` lines are drawn by `draw` when given. */
  const row = (label: string, sub: string | null, value: string, opts: { minH?: number; draw?: (x: number, top: number) => void } = {}) => {
    const lab = wrap(label, arial, 8.5, LW - 10);
    const subl = sub ? wrap(sub, arial, 6, LW - 10) : [];
    const val = value ? wrap(value, arial, 8.5, VW) : [''];
    const h = Math.max(opts.minH ?? 15, 5 + lab.length * 10.5 + subl.length * 7 + 2, 5 + val.length * 10.5 + 2);
    box(T, y - h, LW, h); box(T + LW, y - h, TW - LW, h);
    lab.forEach((l, i) => text(l, T + 5, y - 10.5 - i * 10.5, 8.5));
    subl.forEach((l, i) => text(l, T + 5, y - 10.5 - lab.length * 10.5 - i * 7 + 2, 6));
    if (opts.draw) opts.draw(VX, y);
    else val.forEach((l, i) => text(l, VX, y - 10.5 - i * 10.5, 8.5));
    y -= h;
  };
  const sigRow = (label: string, left: string, date: string | null) => row(label, null, '', {
    draw: (x, top) => {
      text(left, x, top - 10.5, 8.5);
      text(`Date (dd-mm-yy):${date ? ` ${date}` : ''}`, x + 154, top - 10.5, 8.5);
    },
  });

  const ship = ddmmyyyy(d.shipDate);
  const dest = [d.customer, d.shipTo].filter(Boolean).join('\n');
  section('Part A: Shipment Information');
  row('Originator', null, 'Oaziz Extracts Inc.');
  row('Date of shipment (dd-mm-yy)', null, ship);
  row('Ship to (Company name and address)', null, dest);
  row('Courier company', null, [d.carrier, d.trackingNo ? `Tracking # ${d.trackingNo}` : null].filter(Boolean).join(' - '));
  row('Name of driver', null, '');
  const bullets = d.products.flatMap((p) => wrap(p, arial, 8.5, VW - 22).map((l, i) => ({ l, first: i === 0 })));
  row('Product(s) description and quantity (g)', '(Batch/Lot Name(s) and ID Number(s))', '', {
    minH: 12 + bullets.length * 10.5,
    draw: (x, top) => bullets.forEach((b, i) => {
      if (b.first) page.drawCircle({ x: x + 16, y: top - 8 - i * 10.5, size: 1.6, color: ink });
      text(b.l, x + 28, top - 10.5 - i * 10.5, 8.5);
    }),
  });
  row('Courier vehicle in good condition?', '(Inspect the inside of the vehicle - cargo area, for cleanliness and to ensure there are no gaps in the walls/ceilings)', '', {
    draw: (x, top) => {
      text(`[${d.vehicleOk ? 'X' : '   '}] YES`, x, top - 10.5, 8.5);
      text(`[${d.vehicleOk ? '   ' : 'X'}] NO`, x + 52, top - 10.5, 8.5);
      text(!d.vehicleOk && d.vehicleNote ? d.vehicleNote : '(if no, provide details)', x + 88, top - 10.5, !d.vehicleOk && d.vehicleNote ? 8 : 6.5);
    },
  });
  row('Shipping Temperature Range Required', '(State temperature range required - "NA" if not required)', d.temperature || 'N/A');
  // QA signs for the shipping department: the signature image sits on the line.
  row('Sign/Date (Shipping Dept)', null, '', {
    minH: d.signature ? 30 : 15,
    draw: (x, top) => {
      text('Signature:', x, top - 10.5, 8.5);
      if (sig) {
        const h = 24; const w = Math.min(110, (sig.width / sig.height) * h);
        page.drawImage(sig, { x: x + 44, y: top - 27, width: w, height: h });
        if (d.signerName) text(`(${d.signerName})`, x + 44 + w + 4, top - 22, 6.5);
      }
      text(`Date (dd-mm-yy): ${ship}`, x + 154, top - 10.5, 8.5);
    },
  });
  sigRow('Sign/Date (Courier)', 'Signature:', ship);
  sigRow('Time and date of shipment departure', `Time:${d.departureTime ? ` ${d.departureTime}` : ''}`, ship);
  section('Part B: Receiving Confirmation');
  row('Destination', null, dest);
  sigRow('Time and Date of shipment arrival', 'Time:', null);
  row('Name of receiver', null, '');
  sigRow('Sign/Date (Receiver)', 'Signature:', null);

  // ------------------------------------------------------------ footer
  y -= 22;
  text('Once Shipment arrives, ensure the receiver fills in their name, date and signs for the shipment.', T, y, 9, arialB);
  y -= 22;
  text('Email completed forms to:', T, y, 9, arialB);
  text('Oaziz Extracts Inc.', T, y - 11, 9);
  text('Email: ', T, y - 22, 9);
  text('stephane@oaziz.ca', T + arial.widthOfTextAtSize('Email: ', 9), y - 22, 9, arial, blue);
  text('Attn: Stephane Paquin', T, y - 33, 9);
  if (!d.signature) {
    // Draft: not to be sent before QA verifies and signs it in the portal.
    page.drawText('DRAFT - TO VERIFY AND SIGN', {
      x: 120, y: 260, size: 34, font: arialB, color: rgb(0.85, 0.2, 0.15), opacity: 0.18, rotate: degrees(35),
    });
  }
  text('Version Date: 1-Nov-2022', 80, 40, 8.5);
  text('Page 1 of 1', 530 - arial.widthOfTextAtSize('Page 1 of 1', 8.5), 40, 8.5);
  return doc.save();
}

/** "Juicy J Bubble Hash — Lot 74494, 2 843 g" (units × size when the SKU is not 1 g). */
export function cocProductLine(p: { product: string; lot: string | null; quantity: number | null; sku_size_g?: number | null }): string {
  const fmt = (n: number) => n.toLocaleString('en-CA', { maximumFractionDigits: 3 });
  const size = p.sku_size_g ?? 1;
  const qty = p.quantity === null ? null
    : size === 1 ? `${fmt(p.quantity)} g` : `${fmt(p.quantity * size)} g (${fmt(p.quantity)} x ${fmt(size)} g)`;
  return [p.product, p.lot ? `Lot ${p.lot}` : null].filter(Boolean).join(' - ') + (qty ? `, ${qty}` : '');
}

export interface CocShipment {
  coc_no: string | null; customer_name: string | null; ship_to: string | null; carrier: string | null; tracking_no: string | null;
  coc_ship_date: string | null; coc_vehicle_ok: boolean; coc_vehicle_note: string | null; coc_temperature: string;
  coc_departure_time: string | null; coc_signature: string | null; coc_signer_name: string | null;
}

/** The CoC of a shipment, from its work order lines (which know the SKU size). */
export function cocDataFor(
  s: CocShipment,
  lines: Array<{ product_name: string; lot_no: string | null; final_quantity: number | null; po_quantity: number | null; sku_size_g: number | null }>,
  fallbackDate: string,
): CocData {
  return {
    cocNo: s.coc_no ?? 'COC-', shipDate: s.coc_ship_date ?? fallbackDate, customer: s.customer_name, shipTo: s.ship_to,
    carrier: s.carrier, trackingNo: s.tracking_no,
    vehicleOk: s.coc_vehicle_ok, vehicleNote: s.coc_vehicle_note, temperature: s.coc_temperature,
    departureTime: s.coc_departure_time, signature: s.coc_signature, signerName: s.coc_signer_name,
    products: lines.filter((l) => l.product_name).map((l) => cocProductLine({
      product: l.product_name, lot: l.lot_no, quantity: l.final_quantity ?? l.po_quantity, sku_size_g: l.sku_size_g,
    })),
  };
}

export const cocFilename = (cocNo: string, customer: string | null) =>
  `${cocNo}${customer ? ` - ${customer.replace(/[^\w .&-]+/g, '').trim().replace(/\.+$/, '')}` : ''}.pdf`;
