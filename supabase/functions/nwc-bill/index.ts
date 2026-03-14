/**
 * Supabase Edge Function: NWC Bill Fetcher
 *
 * Proxies the NWC (National Water Company) bill lookup API.
 * Runs server-side to ensure consistent behavior across all platforms.
 *
 * Usage: POST /functions/v1/nwc-bill
 * Body: { "accountNumber": "..." }
 */

import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function generateXToken(): Promise<string> {
  const uid = generateUUID();
  const data = `vgnw%XO3=pR[jji,F/>L>6%YHDv@m]${uid}`;
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { accountNumber } = await req.json();

    if (!accountNumber || typeof accountNumber !== "string") {
      return new Response(
        JSON.stringify({ error: "accountNumber is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const NWC_API = Deno.env.get("NWC_API");
    if (!NWC_API) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing (NWC_API)" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const xToken = await generateXToken();
    const xTimestamp = generateUUID();
    const xRequestId = generateUUID();

    const res = await fetch(NWC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
        "Accept-Language": "ar-SA",
        "X-Source-Application": "RES",
        "X-Timestamp": xTimestamp,
        "X-Request-ID": xRequestId,
        "X-App-Version": "5.1.6",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Token": xToken,
        Origin: "https://ebranch.nwc.com.sa",
        Referer: "https://ebranch.nwc.com.sa/",
      },
      body: JSON.stringify({
        acctCharType: "DPACCNUM",
        acctCharValue: accountNumber.trim(),
        premGeoNb: "",
        premGeoType: "",
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      const err = Array.isArray(json) ? json[0] : json;
      const code = err?.ErrorCode ?? "Error";
      const desc = err?.ErrorDescription ?? `HTTP ${res.status}`;
      return new Response(
        JSON.stringify({ error: `${code}: ${desc}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accountsList: any[] =
      json?.accountsList ??
      json?.Result?.accountsList ??
      (Array.isArray(json) ? json : []);

    const account = Array.isArray(accountsList) ? accountsList[0] : null;

    if (!account) {
      return new Response(
        JSON.stringify({ error: "No account data returned from NWC" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const params: Array<{ parameterName: string; parameterValue: string }> =
      account.parameters ?? [];

    const dueAmountStr =
      params.find((p: any) => p.parameterName === "DUEAMOUNT")
        ?.parameterValue ?? "0";
    const lastBillStr =
      params.find((p: any) => p.parameterName === "LASTBILLAMOUNT")
        ?.parameterValue ??
      params.find((p: any) => p.parameterName === "TOTALBILLAMOUNT")
        ?.parameterValue ??
      "0";

    const result = {
      dueAmount: parseFloat(dueAmountStr) || 0,
      lastBillAmount: parseFloat(lastBillStr) || 0,
      accountNumber: accountNumber.trim(),
      accountClassification: account.accountClassification ?? "RES",
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
