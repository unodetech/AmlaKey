export interface NWCBillResult {
  dueAmount: number;
  lastBillAmount: number;
  accountNumber: string;
  accountClassification: string;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://xyyaatxxksushypsultx.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5eWFhdHh4a3N1c2h5cHN1bHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzUwMTgsImV4cCI6MjA4ODU1MTAxOH0.VHClVRq6vBuezUhhx15TqqOBW534TU6trMQK90TnaxI";

/**
 * Fetch an NWC water bill via Supabase Edge Function.
 * Uses direct fetch to avoid supabase.functions.invoke client issues.
 */
export async function fetchNWCBill(
  accountNumber: string
): Promise<NWCBillResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/nwc-bill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ accountNumber: accountNumber.trim() }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || `NWC bill fetch failed (${res.status})`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as NWCBillResult;
}
