import { supabase } from "./supabase";

export interface NWCBillResult {
  dueAmount: number;
  lastBillAmount: number;
  accountNumber: string;
  accountClassification: string;
}

/**
 * Fetch an NWC water bill via Supabase Edge Function.
 * The edge function handles token generation and the API call server-side
 * for consistent behavior across all platforms.
 */
export async function fetchNWCBill(
  accountNumber: string
): Promise<NWCBillResult> {
  const { data, error } = await supabase.functions.invoke("nwc-bill", {
    body: { accountNumber: accountNumber.trim() },
  });

  if (error) {
    throw new Error(error.message || "NWC bill fetch failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as NWCBillResult;
}
