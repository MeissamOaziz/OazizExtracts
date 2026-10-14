// The values the vendor qualification form renders, and how a saved
// submission becomes them. Shared by the blank form, the shared-invite form and
// the private draft-resume page, so a field added once shows up in all three.

export interface VendorFormValues {
  vendor_type: string | null;
  company_name: string; address: string; city: string; province: string; postal_code: string;
  contact_person: string; phone: string; phone_ext: string; email: string;
  shipping_same_as_billing: boolean; shipping_address: string; shipping_city: string;
  shipping_province: string; shipping_postal_code: string;
  sales_contact_name: string; sales_contact_email: string; sales_contact_phone: string; sales_contact_phone_ext: string;
  qa_contact_name: string; qa_contact_email: string; qa_contact_phone: string; qa_contact_phone_ext: string;
  accounting_contact_name: string; accounting_contact_email: string; accounting_contact_phone: string; accounting_contact_phone_ext: string;
  business_number: string; gst_hst_number: string; qst_number: string;
  bank_institution_number: string; bank_transit_number: string; bank_account_number: string; bank_address: string;
  products_sold: string;
  production_type: string | null; cultivation_methods: string[]; lighting_type: string; medium_type: string;
  nutrient_type: string; cultivar_name: string; starting_material: string[];
  pesticides_used: string;
  certified_by_name: string; certified_by_title: string;
  file_cra_license_expiry: string; file_health_canada_license_expiry: string;
}

export const blankVendorFormValues: VendorFormValues = {
  vendor_type: null,
  products_sold: '',
  company_name: '', address: '', city: '', province: '', postal_code: '',
  contact_person: '', phone: '', phone_ext: '', email: '',
  shipping_same_as_billing: true, shipping_address: '', shipping_city: '',
  shipping_province: '', shipping_postal_code: '',
  sales_contact_name: '', sales_contact_email: '', sales_contact_phone: '', sales_contact_phone_ext: '',
  qa_contact_name: '', qa_contact_email: '', qa_contact_phone: '', qa_contact_phone_ext: '',
  accounting_contact_name: '', accounting_contact_email: '', accounting_contact_phone: '', accounting_contact_phone_ext: '',
  business_number: '', gst_hst_number: '', qst_number: '',
  bank_institution_number: '', bank_transit_number: '', bank_account_number: '', bank_address: '',
  production_type: null, cultivation_methods: [], lighting_type: '', medium_type: '',
  nutrient_type: '', cultivar_name: '', starting_material: [],
  pesticides_used: '',
  certified_by_name: '', certified_by_title: '',
  file_cra_license_expiry: '', file_health_canada_license_expiry: '',
};

/** A saved vendor_submissions row, as the form expects it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function vendorFormValuesFrom(row: Record<string, any>): VendorFormValues {
  const out = { ...blankVendorFormValues };
  for (const key of Object.keys(out) as Array<keyof VendorFormValues>) {
    const v = row[key];
    if (v === null || v === undefined) continue;
    (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

/** Which required documents are already on file, so the form does not demand them again. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function vendorFormHasFiles(row: Record<string, any> | null) {
  return {
    cra: !!row?.file_cra_license_path,
    hc: !!row?.file_health_canada_license_path,
    bank: !!row?.file_bank_void_cheque_path,
  };
}
