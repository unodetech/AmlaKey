/**
 * Date formatting utilities with Hijri (Islamic Umm al-Qura) calendar support.
 * Uses Intl.DateTimeFormat — no external dependencies needed.
 */

/** Format a date string as Hijri (Islamic Umm al-Qura calendar) */
export function formatHijri(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? "T12:00:00" : ""));
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

/** Format a date string as Gregorian in the given language */
export function formatGregorian(dateStr?: string, lang: "en" | "ar" = "en"): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? "T12:00:00" : ""));
    return d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date with both Gregorian and Hijri.
 * Returns "15 Mar 2026 | 16 رمضان 1447" when showHijri is true.
 * Returns just "15 Mar 2026" when showHijri is false.
 */
export function formatDualDate(
  dateStr?: string,
  lang: "en" | "ar" = "en",
  showHijri: boolean = false,
): string {
  if (!dateStr) return "—";
  const greg = formatGregorian(dateStr, lang);
  if (!showHijri) return greg;
  const hijri = formatHijri(dateStr);
  if (!hijri) return greg;
  return `${greg}  ·  ${hijri}`;
}

/**
 * Check if a tenant's payment is due in a given month based on their payment frequency.
 * - monthly: due every month
 * - semi_annual: due every 6 months from lease_start
 * - annual: due every 12 months from lease_start
 *
 * Also checks that the lease period covers the given month.
 */
export function isPaymentDueInMonth(
  leaseStart?: string,
  leaseEnd?: string | null,
  frequency?: string,
  monthStr?: string,
): boolean {
  if (!leaseStart || !monthStr) return false;

  const mStart = new Date(`${monthStr}-01T00:00:00`);
  const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
  const ls = new Date(leaseStart + "T00:00:00");

  if (ls > mEnd) return false;
  if (leaseEnd) {
    const le = new Date(leaseEnd + "T23:59:59");
    if (le < mStart) return false;
  }

  const freq = frequency || "monthly";
  if (freq === "monthly") return true;

  const monthsElapsed = (mStart.getFullYear() - ls.getFullYear()) * 12 + (mStart.getMonth() - ls.getMonth());
  if (monthsElapsed < 0) return false;

  const interval = freq === "annual" ? 12 : freq === "semi_annual" ? 6 : 1;
  return monthsElapsed % interval === 0;
}

/**
 * Given a tenant's lease start, payment frequency, and the date a payment is made,
 * return the YYYY-MM of the due period the payment belongs to.
 *
 * For monthly tenants the period is simply the payment-date month.
 * For semi_annual / annual tenants the period is the most recent due-month
 * that falls on or before the payment date (aligned to lease_start).
 *
 * This ensures that a split payment made months after the due date still
 * gets attributed to the correct billing period.
 */
export function getDuePeriodMonth(
  leaseStart: string,
  frequency: string | undefined,
  paymentDate: string | Date,
): string {
  const pd =
    typeof paymentDate === "string"
      ? new Date(paymentDate + (paymentDate.length === 10 ? "T12:00:00" : ""))
      : paymentDate;

  const freq = frequency || "monthly";
  if (freq === "monthly") {
    return `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
  }

  const ls = new Date(leaseStart + "T00:00:00");
  const interval = freq === "annual" ? 12 : freq === "semi_annual" ? 6 : 1;

  const monthsElapsed =
    (pd.getFullYear() - ls.getFullYear()) * 12 + (pd.getMonth() - ls.getMonth());
  const periodNumber = Math.max(0, Math.floor(monthsElapsed / interval));
  const periodDate = new Date(ls.getFullYear(), ls.getMonth() + periodNumber * interval, 1);

  return `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;
}

/** Format a month string (YYYY-MM) as "March 2026" or "مارس 2026" with optional Hijri */
export function formatMonthDual(
  monthStr: string,
  lang: "en" | "ar" = "en",
  showHijri: boolean = false,
): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 15); // mid-month for accurate Hijri
  const greg = d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
    month: "long",
    year: "numeric",
  });
  if (!showHijri) return greg;
  try {
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      month: "long",
      year: "numeric",
    }).format(d);
    return `${greg}  ·  ${hijri}`;
  } catch {
    return greg;
  }
}
