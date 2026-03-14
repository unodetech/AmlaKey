import { supabase } from "./supabase";

export interface SECBillResult {
  totalAmount: number;
  dueAmount: number;
  invoiceAmount: number;
  vatAmount: number;
  consumption: string;
  tarifType: string;
  currency: string;
  contractAccount: string;
}

/**
 * Fetch an SEC electricity bill via Supabase Edge Function.
 * The edge function handles encryption, session cookies, and the API call
 * server-side — bypassing F5 anti-bot protection that blocks direct mobile fetches.
 */
export async function fetchSECBill(accountNumber: string): Promise<SECBillResult> {
  const { data, error } = await supabase.functions.invoke("sec-bill", {
    body: { accountNumber: accountNumber.trim() },
  });

  if (error) {
    throw new Error(error.message || "SEC bill fetch failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as SECBillResult;
}
