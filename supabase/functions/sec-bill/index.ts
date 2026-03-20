import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** AES-128-CBC encryption matching CryptoJS on the SEC website */
async function encryptAccount(account: string, key: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const iv = new TextEncoder().encode(key);
  const data = new TextEncoder().encode(account);

  // NOTE: Do NOT manually PKCS7-pad — Web Crypto AES-CBC adds padding automatically
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    data // raw data, no manual padding
  );

  const bytes = new Uint8Array(encrypted);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const accountNumber = body?.accountNumber;

    if (!accountNumber || typeof accountNumber !== "string") {
      return respond({ error: "accountNumber is required" });
    }

    const SEC_KEY = Deno.env.get("SEC_KEY") ?? "";
    const SEC_API = Deno.env.get("SEC_API") ?? "";

    if (!SEC_KEY || !SEC_API) {
      return respond({ error: "Server config missing" });
    }

    const encrypted = await encryptAccount(accountNumber.trim(), SEC_KEY);
    const apiUrl =
      SEC_API +
      "?contractAccount=" +
      encodeURIComponent(encrypted) +
      "&isEncrypt=true";

    const apiRes = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ar-SA",
        Origin: "https://www.se.com.sa",
        Referer: "https://www.se.com.sa/ar-SA/GuestViewBill",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const text = await apiRes.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return respond(
        { error: "Non-JSON response from SEC", status: apiRes.status, body: text.slice(0, 300) },
      );
    }

    if (json?.Error?.ErrorMessage) {
      return respond({ error: json.Error.ErrorMessage });
    }

    if (!json?.d) {
      return respond({ error: "No data returned from SEC", raw: json });
    }

    const d = json.d;
    return respond({
      totalAmount: parseFloat(d.TotalAmt ?? "0"),
      dueAmount: parseFloat(d.CurrentDueAmt ?? "0"),
      invoiceAmount: parseFloat(d.InvAmt ?? "0"),
      vatAmount: parseFloat(d.Vat15Amt ?? "0"),
      consumption: d.TotalConsumption ?? "0",
      tarifType: d.TarifType ?? "",
      currency: d.Currency ?? "SAR",
      contractAccount: accountNumber.trim(),
    });
  } catch (err) {
    return respond({ error: (err as Error).message || "Internal server error" });
  }
});
