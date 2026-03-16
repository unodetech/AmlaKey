import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Keyboard, Linking, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { showAlert, crossAlert } from "../lib/alert";

const isWeb = Platform.OS === "web";

// WebView only available on native
let WebView: any = null;
if (!isWeb) {
  WebView = require("react-native-webview").WebView;
}
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { spacing, radii } from "../constants/theme";
import { userKey, EJAR_IMPORT_KEY } from "../lib/storage";

/* ── types ── */
interface ContractData {
  contractNumber: string;
  contractType: string;
  contractStatus: string;
  contractVersion: string;
  leaseStart: string;
  leaseEnd: string;
  duration: string;
  region: string;
  city: string;
  district: string;
  tenantName: string;
  tenantType: string;
  landlordName: string;
  landlordType: string;
  paymentType: string;
  totalAmount: number;
  monthlyRent: number;
  billCount: number;
  unpaidBills: number;
}

/* ── REGA URLs ── */
const REGA_FORM_URL =
  "https://rega.gov.sa/en/rega-services/real-estate-enquiries/enquiring-about-lease-contracts/";

/**
 * JS injected into the REGA detail page to extract contract data.
 * Matches the actual text structure (mixed Arabic + English labels).
 */
const EXTRACT_JS = `
(function() {
  try {
    var allText = document.body.innerText || "";
    var data = {};

    /* ── Contract header ── */
    var cnM = allText.match(/Contract Number[\\s\\n]+(\\d+)/);
    if (cnM) data.contractNumber = cnM[1];

    var ctM = allText.match(/Contract Type[\\s\\n]+(\\S+)/);
    if (ctM) data.contractType = ctM[1]; // "Residential" or "Commercial"

    var csM = allText.match(/Contract Status[\\s\\n]+(\\S+)/);
    if (csM) data.contractStatus = csM[1]; // "active" or "Expired"/"Terminated"

    var cvM = allText.match(/نسخة العقد[\\s\\n]+([\\d.]+)/);
    if (cvM) data.contractVersion = cvM[1];

    /* ── Dates ── */
    // تاريخ العقد = contract/lease start date
    var sdM = allText.match(/تاريخ العقد[\\s\\n]+(\\d{4}-\\d{2}-\\d{2})/);
    if (sdM) data.leaseStart = sdM[1];

    // Issue Date (Gregorian start)
    if (!data.leaseStart) {
      var idM = allText.match(/Issue Date[\\s\\n]+(\\d{4}-\\d{2}-\\d{2})/);
      if (idM) data.leaseStart = idM[1];
    }

    // تاريخ نهاية العقد = contract end date
    var edM = allText.match(/تاريخ نهاية العقد[\\s\\n]+(\\d{4}-\\d{2}-\\d{2})/);
    if (edM) data.leaseEnd = edM[1];

    // مدة العقد = duration
    var durM = allText.match(/مدة العقد[\\s\\n]+(\\d+\\s*يوم)/);
    if (durM) data.duration = durM[1];

    /* ── Location ── */
    var regM = allText.match(/Region[\\s\\n]+([^\\n]+)/);
    if (regM) data.region = regM[1].trim();

    var cityM = allText.match(/المدينة[\\s\\n]+([^\\n]+)/);
    if (cityM) data.city = cityM[1].trim();

    var distM = allText.match(/الحي[\\s\\n]+([^\\n]+)/);
    if (distM) data.district = distM[1].trim();

    /* ── Tenant (المستأجر) ── */
    var tenantM = allText.match(/المستأجر[\\s\\n]+([^\\n]+)/);
    if (tenantM) data.tenantName = tenantM[1].trim();

    var ttM = allText.match(/صفة المستأجر:\\s*(\\S+)/);
    data.tenantType = (ttM && ttM[1]) || "individual";

    /* ── Landlord (المؤجرين) ── */
    var landlordM = allText.match(/المؤجرين[\\s\\n]+([^\\n]+)/);
    if (landlordM) data.landlordName = landlordM[1].trim();

    var ltM = allText.match(/صفة المؤجر:\\s*(\\S+)/);
    data.landlordType = (ltM && ltM[1]) || "individual";

    /* ── Financial (المعلومات المالية) ── */
    // Amount: "60000.0 ريال"
    var amtM = allText.match(/المبلغ[\\s\\n]+([\\d,.]+)\\s*ريال/);
    if (amtM) data.totalAmount = parseFloat(amtM[1].replace(/,/g, ""));

    // Payment type from نوع الدفعات
    var ptText = allText.match(/نوع الدفعات[\\s\\n]+([^\\n]+)/);
    if (ptText) {
      var pt = ptText[1];
      if (pt.indexOf("شهري") >= 0) data.paymentType = "monthly";
      else if (pt.indexOf("ربع") >= 0) data.paymentType = "quarterly";
      else if (pt.indexOf("نصف") >= 0) data.paymentType = "semi-annual";
      else data.paymentType = "annual";
    } else {
      data.paymentType = "annual";
    }

    /* ── Bills (الفواتير) ── */
    var billsM = allText.match(/الفواتير\\s*(\\d+)/);
    data.billCount = billsM ? parseInt(billsM[1]) : 0;

    var unpaidM = allText.match(/غير مدفوعة/g);
    data.unpaidBills = unpaidM ? unpaidM.length : 0;

    /* ── Calculate monthly rent ── */
    if (data.totalAmount) {
      if (data.paymentType === "monthly") data.monthlyRent = data.totalAmount;
      else if (data.paymentType === "quarterly") data.monthlyRent = Math.round(data.totalAmount / 3);
      else if (data.paymentType === "semi-annual") data.monthlyRent = Math.round(data.totalAmount / 6);
      else data.monthlyRent = Math.round(data.totalAmount / 12);
    }

    /* ── Check if we got meaningful data ── */
    if (!data.contractNumber && !data.leaseStart) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ error: "not_found", text: allText.substring(0, 500) }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ success: true, data: data }));
    }
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.message }));
  }
})();
true;
`;

/* ── component ── */
export default function EjarImportScreen() {
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const S = useMemo(() => styles(C, shadow), [C, shadow]);
  const params = useLocalSearchParams<{ property_id?: string }>();

  const [tenantId, setTenantId] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [hijriDob, setHijriDob] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    tenantId?: string;
    contractNo?: string;
    hijriDob?: string;
  }>({});
  const [hijriPickerVisible, setHijriPickerVisible] = useState(false);
  const [pickerDay, setPickerDay] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(1);
  const [pickerYear, setPickerYear] = useState(1420);

  // Close hijri picker when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setHijriPickerVisible(false);
    });
    return () => sub.remove();
  }, []);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [currentStep, setCurrentStep] = useState(0); // 0=none, 1=loading form, 2=submitting, 3=searching, 4=loading details
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const webViewRef = useRef<any>(null);
  const extractAttemptRef = useRef(0);
  const stepRef = useRef<"idle" | "form_loaded" | "submitted" | "result_page" | "detail_page" | "done">("idle");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Input handlers ── */
  function handleTenantIdChange(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 10);
    setTenantId(digits);
    if (fieldErrors.tenantId) setFieldErrors((e) => ({ ...e, tenantId: undefined }));
  }

  function handleContractNoChange(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 11);
    setContractNo(digits);
    if (fieldErrors.contractNo) setFieldErrors((e) => ({ ...e, contractNo: undefined }));
  }

  function handleHijriDobChange(text: string) {
    // Auto-format: DD/MM/YYYY
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4)
      formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    else if (digits.length > 2)
      formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    setHijriDob(formatted);
    if (fieldErrors.hijriDob) setFieldErrors((e) => ({ ...e, hijriDob: undefined }));
  }

  /* ── Validation ── */
  function validateFields(): boolean {
    const errors: typeof fieldErrors = {};
    if (tenantId.length !== 10) {
      errors.tenantId = isRTL
        ? "رقم الهوية يجب أن يكون 10 أرقام"
        : "National ID must be exactly 10 digits";
    }
    if (contractNo.length !== 11) {
      errors.contractNo = isRTL
        ? "رقم العقد يجب أن يكون 11 رقم"
        : "Contract number must be exactly 11 digits";
    }
    const dobDigits = hijriDob.replace(/\D/g, "");
    if (dobDigits.length !== 8) {
      errors.hijriDob = isRTL
        ? "تاريخ الميلاد الهجري مطلوب (يوم/شهر/سنة)"
        : "Hijri date of birth is required (DD/MM/YYYY)";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /* ── Cleanup polling timer ── */
  function stopPolling() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  /* ── Start the fetch — load the REGA inquiry form ── */
  function handleFetch() {
    Keyboard.dismiss();
    if (!validateFields()) return;

    if (isWeb) {
      // On web, WebView is not available — open REGA in a new tab
      // User must manually look up contract and enter data
      crossAlert(
        t("ejarImport"),
        "The REGA contract lookup will open in a new browser tab. Once you have your contract details, you can enter them manually.",
        [
          {
            text: t("ok"),
            onPress: () => {
              if (typeof window !== "undefined") {
                window.open(REGA_FORM_URL, "_blank");
              } else {
                Linking.openURL(REGA_FORM_URL);
              }
            },
          },
          { text: t("cancel"), style: "cancel" },
        ]
      );
      return;
    }

    setError("");
    setContractData(null);
    setLoading(true);
    setCurrentStep(1);
    setLoadingMsg(t("loadingInquiryForm"));
    extractAttemptRef.current = 0;
    stepRef.current = "idle";
    stopPolling();
    setWebViewUrl(REGA_FORM_URL);
  }

  /** Convert user's DD/MM/YYYY → YYYY/M/D for HijriDatePicker API */
  function hijriDobToPickerFormat(): string {
    const digits = hijriDob.replace(/\D/g, "");
    if (digits.length !== 8) return "";
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    return `${yyyy}/${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
  }

  /**
   * Polling-based JS: checks current URL + page state, takes appropriate action.
   * This single script handles all steps. It reports back via postMessage.
   */
  function buildPollJS(): string {
    const idVal = tenantId.trim();
    const dobVal = hijriDobToPickerFormat();
    const cn = contractNo.trim();
    return `
(function() {
  try {
    var url = window.location.href;
    var step = '${stepRef.current}';

    /* ── STEP: On the inquiry form page → fill and submit ── */
    if (url.indexOf('enquiring-about-lease-contracts') >= 0 && (step === 'idle' || step === 'form_loaded')) {
      if (typeof jQuery === 'undefined' || !document.querySelector('.datepickerfield')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "waiting_for_jquery" }));
        return;
      }

      /* Find the CORRECT form — the one containing the datepicker (Umbraco inquiry form) */
      var theForm = null;
      var allForms = document.querySelectorAll('form');
      for (var fi = 0; fi < allForms.length; fi++) {
        if (allForms[fi].querySelector('.datepickerfield')) {
          theForm = allForms[fi];
          break;
        }
      }
      if (!theForm) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "form_not_found" }));
        return;
      }

      /* Collect info about what fields exist for debugging */
      var formInputs = theForm.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
      var formSelects = theForm.querySelectorAll('select');
      var debugInfo = 'inputs:' + formInputs.length + ' selects:' + formSelects.length;

      /* Set dropdown/select if present (inquiry type) */
      if (formSelects.length > 0) {
        var sel = formSelects[0];
        /* Select the first non-empty option if nothing selected */
        if (sel.selectedIndex <= 0 && sel.options.length > 1) {
          sel.selectedIndex = 1;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      /* Set ID Number — try multiple selectors */
      var idInput = theForm.querySelector('input[placeholder*="ID Number"]')
        || theForm.querySelector('input[placeholder*="رقم الهوية"]')
        || theForm.querySelector('input[placeholder*="id number"]');
      /* Fallback: find text input that is NOT the datepicker */
      if (!idInput) {
        var textInputs = theForm.querySelectorAll('input[type="text"], input:not([type]):not(.datepickerfield)');
        for (var ti = 0; ti < textInputs.length; ti++) {
          if (!textInputs[ti].classList.contains('datepickerfield') && !textInputs[ti].classList.contains('hijri')) {
            idInput = textInputs[ti];
            break;
          }
        }
      }
      if (idInput) {
        var ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        ns.call(idInput, '${idVal}');
        idInput.dispatchEvent(new Event('input', { bubbles: true }));
        idInput.dispatchEvent(new Event('change', { bubbles: true }));
        debugInfo += ' id:set';
      } else {
        debugInfo += ' id:NOT_FOUND';
      }

      /* Set Hijri DOB via HijriDatePicker jQuery plugin */
      var dobInput = theForm.querySelector('.datepickerfield');
      if (dobInput && jQuery(dobInput).data('HijriDatePicker')) {
        jQuery(dobInput).data('HijriDatePicker').date('${dobVal}');
        debugInfo += ' dob:set';
      } else {
        debugInfo += ' dob:NOT_FOUND';
      }

      /* Submit the CORRECT form (not the site search!) */
      setTimeout(function() {
        /* Try finding submit button INSIDE this form */
        var submitBtn = theForm.querySelector('button[type="submit"]')
          || theForm.querySelector('input[type="submit"]')
          || theForm.querySelector('.btn-primary[type="submit"]');
        if (submitBtn) {
          submitBtn.click();
          window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "form_submitted", debug: debugInfo + ' btn:clicked' }));
        } else {
          /* No button found inside form — submit the form directly */
          theForm.submit();
          window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "form_submitted", debug: debugInfo + ' form:submitted' }));
        }
      }, 800);
      return;
    }

    /* ── STEP: On result page (not detail) → click View More ── */
    if (url.indexOf('result-page') >= 0 && url.indexOf('%D8%AA%D9%81%D8%A7%D8%B5%D9%8A%D9%84') < 0) {
      var bodyText = document.body.innerText || "";
      var allLinks = document.querySelectorAll('a');
      var cards = document.querySelectorAll('.card');

      /* Debug: collect page info */
      var linkTexts = [];
      for (var li = 0; li < allLinks.length && li < 30; li++) {
        var lt2 = (allLinks[li].textContent || "").trim();
        if (lt2.length > 0 && lt2.length < 50) linkTexts.push(lt2);
      }
      var debugRP = 'cards:' + cards.length + ' links:' + allLinks.length + ' body:' + bodyText.substring(0, 150).replace(/[\\n\\r]+/g, '|');

      var found = false;

      /* Strategy 1: Look for any link with View More / المزيد / التفاصيل / Details / detail URL */
      for (var j = 0; j < allLinks.length; j++) {
        var linkText = (allLinks[j].textContent || "").trim();
        var linkHref = allLinks[j].href || "";
        if (linkText.indexOf("View More") >= 0 || linkText.indexOf("المزيد") >= 0 ||
            linkText.indexOf("التفاصيل") >= 0 || linkText.indexOf("Details") >= 0 ||
            linkHref.indexOf('id_number') >= 0 || linkHref.indexOf('%D8%AA%D9%81%D8%A7%D8%B5%D9%8A%D9%84') >= 0) {
          allLinks[j].click();
          found = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "view_more_clicked", debug: 'link:' + linkText.substring(0,30) }));
          return;
        }
      }

      /* Strategy 2: Click any link/button inside a card */
      if (!found) {
        cards.forEach(function(card) {
          if (found) return;
          var cLinks = card.querySelectorAll('a, button');
          for (var ci = 0; ci < cLinks.length; ci++) {
            var cText = (cLinks[ci].textContent || "").trim();
            if (cText.length > 0) {
              cLinks[ci].click();
              found = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "view_more_clicked", debug: "card_link:" + cText.substring(0,30) }));
              return;
            }
          }
        });
      }

      if (!found) {
        /* Maybe detail data is already on this page (SPA-style) — check for contract markers */
        if (bodyText.indexOf("Contract Number") >= 0 || bodyText.indexOf("رقم العقد") >= 0 ||
            bodyText.indexOf("تاريخ العقد") >= 0 || bodyText.indexOf("Contract Status") >= 0) {
          /* Contract data visible on result page — try extracting directly */
          ${EXTRACT_JS.replace("true;", "")}
          return;
        }

        if (bodyText.indexOf("لا توجد") >= 0 || bodyText.indexOf("No result") >= 0 || bodyText.indexOf("no contracts") >= 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "no_results", debug: debugRP }));
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "result_page_waiting", debug: debugRP, lt: linkTexts.join('|').substring(0, 150) }));
        }
      }
      return;
    }

    /* ── STEP: On detail page → extract data ── */
    if (url.indexOf('%D8%AA%D9%81%D8%A7%D8%B5%D9%8A%D9%84') >= 0 || url.indexOf('id_number') >= 0 ||
        url.indexOf('result-page') >= 0) {
      ${EXTRACT_JS.replace("true;", "")}
      return;
    }

    /* If we ended up on the site search page, something went wrong with form submission */
    if (url.indexOf('/search?') >= 0 || url.indexOf('/search') >= 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "wrong_page_search", url: url.substring(0, 200) }));
      return;
    }

    /* Unknown page */
    window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "unknown_page", url: url.substring(0, 200) }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ poll: "error", msg: e.message }));
  }
})();
true;
`;
  }

  /** Schedule the next poll */
  function schedulePoll(delayMs: number = 3000) {
    stopPolling();
    pollTimerRef.current = setTimeout(() => {
      if (stepRef.current === "done") return;
      webViewRef.current?.injectJavaScript(buildPollJS());
    }, delayMs);
  }

  /* ── WebView message handler ── */
  function onWebViewMessage(event: any) {
    try {
      const result = JSON.parse(event.nativeEvent.data);

      /* Handle extraction result (success/error from EXTRACT_JS) */
      if (result.success && result.data) {
        stopPolling();
        stepRef.current = "done";
        setCurrentStep(0);
        setContractData(result.data);
        setLoading(false);
        setWebViewUrl(null);
        return;
      }
      if (result.error === "not_found") {
        extractAttemptRef.current += 1;
        if (extractAttemptRef.current < 10) {
          schedulePoll(2500);
        } else {
          stopPolling();
          setLoading(false);
          setError(
            isRTL
              ? "لم يتم العثور على بيانات العقد. تأكد من صحة البيانات المدخلة"
              : "Could not find contract data. Please verify the entered information."
          );
          setWebViewUrl(null);
        }
        return;
      }
      if (result.error && result.error !== "not_found") {
        stopPolling();
        setLoading(false);
        setError(t("contractNotFound"));
        setWebViewUrl(null);
        return;
      }

      /* Handle poll status messages */
      const poll = result.poll;
      if (!poll) return;

      switch (poll) {
        case "waiting_for_jquery":
          schedulePoll(1500);
          break;

        case "form_not_found":
          schedulePoll(3000);
          break;

        case "form_submitted":
          stepRef.current = "submitted";
          setCurrentStep(3);
          setLoadingMsg(t("searching"));
          schedulePoll(6000);
          break;

        case "submit_not_found":
          schedulePoll(2000);
          break;

        case "wrong_page_search":
          stepRef.current = "idle";
          webViewRef.current?.injectJavaScript(`window.location.href = '${REGA_FORM_URL}'; true;`);
          schedulePoll(5000);
          break;

        case "view_more_clicked":
          stepRef.current = "detail_page";
          setCurrentStep(4);
          setLoadingMsg(t("loadingContractDetails"));
          schedulePoll(3000);
          break;

        case "result_page_waiting":
          setLoadingMsg(t("loadingResults"));
          schedulePoll(2000);
          break;

        case "no_results":
          stopPolling();
          setLoading(false);
          setError(
            isRTL
              ? "لا توجد عقود لهذا الرقم. تأكد من صحة البيانات"
              : "No contracts found. Please verify the entered data."
          );
          setWebViewUrl(null);
          break;

        case "unknown_page":
          schedulePoll(2000);
          break;

        case "error":
          schedulePoll(2000);
          break;

        default:
          schedulePoll(3000);
          break;
      }
    } catch {
      setLoading(false);
      setError(t("ejarFetchError"));
      setWebViewUrl(null);
    }
  }

  /* ── Import data back to tenants ── */
  async function handleImport() {
    if (!contractData) return;
    const freqMap: Record<string, string> = {
      monthly: "monthly",
      quarterly: "monthly",
      "semi-annual": "semi_annual",
      annual: "annual",
    };
    await AsyncStorage.setItem(
      userKey(uid, EJAR_IMPORT_KEY),
      JSON.stringify({
        name: contractData.tenantName || "",
        rent: String(contractData.monthlyRent || ""),
        lease_start: contractData.leaseStart || "",
        lease_end: contractData.leaseEnd || "",
        payment_frequency: freqMap[contractData.paymentType || ""] || "monthly",
        city: contractData.city || "",
        district: contractData.district || "",
        contract_type: contractData.contractType || "",
        national_id: tenantId,
        hijri_dob: hijriDob,
        contract_number: contractData.contractNumber || "",
        bill_count: contractData.billCount || 0,
        unpaid_bills: contractData.unpaidBills || 0,
        total_amount: contractData.totalAmount || 0,
        payment_type: contractData.paymentType || "",
      })
    );
    showAlert("✅", t("contractImported"), () => router.back());
  }

  /* ── helpers ── */
  const paymentLabel = (type?: string) => {
    if (!type) return "";
    const map: Record<string, string> = {
      monthly: t("monthly"),
      quarterly: t("quarterly"),
      "semi-annual": t("semiAnnual"),
      annual: t("annual"),
    };
    return map[type] || type;
  };

  const statusColor = (status?: string) => {
    if (!status) return "#888";
    const s = status.toLowerCase();
    return s === "active" ? "#22C55E" : "#EF4444";
  };

  return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        {/* Header */}
        <View style={[S.header, isRTL && S.rowRev]}>
          <View style={S.headerSide}>
            <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
              <Text style={S.backArrow}>{isRTL ? "→" : "←"}</Text>
            </TouchableOpacity>
          </View>
          <View style={S.headerCenter}>
            <Text style={S.headerTitle}>{t("ejarImport")}</Text>
          </View>
          <View style={S.headerSide} />
        </View>

        {/* Step Progress Indicator */}
        {loading && currentStep > 0 && (
          <View style={S.stepContainer}>
            {[
              { num: 1, label: t("stepLoadingForm") },
              { num: 2, label: t("stepSubmitting") },
              { num: 3, label: t("stepSearching") },
              { num: 4, label: t("stepLoadingDetails") },
            ].map((step, idx) => {
              const isCompleted = currentStep > step.num;
              const isCurrent = currentStep === step.num;
              const isFuture = currentStep < step.num;
              return (
                <React.Fragment key={step.num}>
                  {idx > 0 && (
                    <View style={[S.stepLine, isCompleted ? S.stepLineCompleted : isFuture ? S.stepLineFuture : S.stepLineCurrent]} />
                  )}
                  <View style={S.stepItem}>
                    <View
                      style={[
                        S.stepCircle,
                        isCompleted && S.stepCircleCompleted,
                        isCurrent && S.stepCircleCurrent,
                        isFuture && S.stepCircleFuture,
                      ]}
                    >
                      {isCompleted ? (
                        <Text style={S.stepCheck}>✓</Text>
                      ) : (
                        <Text style={[S.stepNum, isCurrent && S.stepNumCurrent, isFuture && S.stepNumFuture]}>{step.num}</Text>
                      )}
                    </View>
                    <Text style={[S.stepLabel, isCurrent && S.stepLabelCurrent, isFuture && S.stepLabelFuture]} numberOfLines={1}>
                      {step.label}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {/* ── Hero ── */}
          <View style={S.heroCard}>
            <Text style={S.heroIcon}>🏠</Text>
            <Text style={S.heroTitle}>{t("importFromEjar")}</Text>
            <Text style={S.heroSub}>
              {isRTL
                ? "أدخل بيانات المستأجر لاستيراد تفاصيل العقد تلقائياً من إيجار"
                : "Enter tenant details to auto-import contract info from Ejar"}
            </Text>
          </View>

          {/* ── Input Form ── */}
          <View style={S.formCard}>
            {/* Tenant ID */}
            <Text style={[S.label, isRTL && { textAlign: "right" }]}>
              {t("tenantIdNumber")} *
            </Text>
            <TextInput
              style={[S.input, isRTL && { textAlign: "right" }, fieldErrors.tenantId && S.inputError]}
              placeholder={t("exampleIdNumber")}
              placeholderTextColor={C.textMuted}
              value={tenantId}
              onChangeText={handleTenantIdChange}
              keyboardType="number-pad"
              maxLength={10}
            />
            {fieldErrors.tenantId && <Text style={S.fieldError}>{fieldErrors.tenantId}</Text>}

            {/* Hijri Date of Birth */}
            <Text style={[S.label, isRTL && { textAlign: "right" }]}>
              {t("hijriDob")} *
            </Text>
            <TouchableOpacity
              style={[S.input, { justifyContent: "center" }, fieldErrors.hijriDob && S.inputError]}
              onPress={() => setHijriPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[{ fontSize: 15, color: hijriDob ? C.text : C.textMuted }, isRTL && { textAlign: "right" }]}>
                {hijriDob || "DD/MM/YYYY"}
              </Text>
            </TouchableOpacity>
            {fieldErrors.hijriDob && <Text style={S.fieldError}>{fieldErrors.hijriDob}</Text>}
            <Text style={S.hintText}>
              {isRTL
                ? "مثال: 15/06/1410 (يوم/شهر/سنة هجرية)"
                : "Example: 15/06/1410 (day/month/hijri year)"}
            </Text>

            {/* Contract Number */}
            <Text style={[S.label, isRTL && { textAlign: "right" }]}>
              {t("contractNumber")} *
            </Text>
            <TextInput
              style={[S.input, isRTL && { textAlign: "right" }, fieldErrors.contractNo && S.inputError]}
              placeholder={t("enterContractNo")}
              placeholderTextColor={C.textMuted}
              value={contractNo}
              onChangeText={handleContractNoChange}
              keyboardType="number-pad"
              maxLength={11}
            />
            {fieldErrors.contractNo && <Text style={S.fieldError}>{fieldErrors.contractNo}</Text>}

            {/* Fetch Button */}
            <TouchableOpacity
              style={[S.fetchBtn, loading && { opacity: 0.6 }]}
              onPress={handleFetch}
              disabled={loading}
              activeOpacity={0.75}
            >
              {loading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={[S.fetchBtnText, { fontSize: 13 }]}>
                    {loadingMsg}
                  </Text>
                </View>
              ) : (
                <Text style={S.fetchBtnText}>🔍 {t("fetchContract")}</Text>
              )}
            </TouchableOpacity>

            {error ? (
              <View style={S.errorCard}>
                <Text style={S.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}
          </View>

          {/* ── Contract Results ── */}
          {contractData && (
            <View style={S.resultCard}>
              <Text style={S.resultTitle}>📋 {t("contractDetails")}</Text>

              {/* Contract Info */}
              <View style={S.resultSection}>
                <View style={[S.resultRow, isRTL && S.rowRev]}>
                  <Text style={S.resultLabel}>{t("contractNumber")}</Text>
                  <Text style={S.resultValue}>{contractData.contractNumber}</Text>
                </View>
                {contractData.contractType ? (
                  <View style={[S.resultRow, isRTL && S.rowRev]}>
                    <Text style={S.resultLabel}>{t("contractType")}</Text>
                    <Text style={S.resultValue}>
                      {contractData.contractType === "Commercial" ? t("commercial") : t("residential")}
                    </Text>
                  </View>
                ) : null}
                {contractData.contractStatus ? (
                  <View style={[S.resultRow, isRTL && S.rowRev]}>
                    <Text style={S.resultLabel}>{t("contractStatus")}</Text>
                    <View
                      style={[
                        S.statusBadge,
                        { backgroundColor: statusColor(contractData.contractStatus) + "20" },
                      ]}
                    >
                      <Text style={[S.statusText, { color: statusColor(contractData.contractStatus) }]}>
                        {contractData.contractStatus}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Dates */}
              {(contractData.leaseStart || contractData.leaseEnd) && (
                <View style={S.resultSection}>
                  {contractData.leaseStart ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("leaseStartDate")}</Text>
                      <Text style={S.resultValue}>{contractData.leaseStart}</Text>
                    </View>
                  ) : null}
                  {contractData.leaseEnd ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("leaseEndDate")}</Text>
                      <Text style={S.resultValue}>{contractData.leaseEnd}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Location */}
              {(contractData.city || contractData.district) && (
                <View style={S.resultSection}>
                  {contractData.region ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("region")}</Text>
                      <Text style={S.resultValue}>{contractData.region}</Text>
                    </View>
                  ) : null}
                  {contractData.city ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("city")}</Text>
                      <Text style={S.resultValue}>{contractData.city}</Text>
                    </View>
                  ) : null}
                  {contractData.district ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("district")}</Text>
                      <Text style={S.resultValue}>{contractData.district}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Parties */}
              {(contractData.tenantName || contractData.landlordName) && (
                <View style={S.resultSection}>
                  {contractData.tenantName ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("tenant")}</Text>
                      <Text
                        style={[S.resultValue, { flex: 1, textAlign: isRTL ? "left" : "right" }]}
                        numberOfLines={1}
                      >
                        {contractData.tenantName}
                      </Text>
                    </View>
                  ) : null}
                  {contractData.landlordName ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("landlord")}</Text>
                      <Text
                        style={[S.resultValue, { flex: 1, textAlign: isRTL ? "left" : "right" }]}
                        numberOfLines={1}
                      >
                        {contractData.landlordName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Financial */}
              {contractData.totalAmount ? (
                <View style={S.resultSection}>
                  <View style={[S.resultRow, isRTL && S.rowRev]}>
                    <Text style={S.resultLabel}>{t("annualRent")}</Text>
                    <Text style={[S.resultValue, { color: C.accent, fontWeight: "700" }]}>
                      {contractData.totalAmount?.toLocaleString()} {t("sar")}
                    </Text>
                  </View>
                  <View style={[S.resultRow, isRTL && S.rowRev]}>
                    <Text style={S.resultLabel}>{t("paymentFrequency")}</Text>
                    <Text style={S.resultValue}>{paymentLabel(contractData.paymentType)}</Text>
                  </View>
                  {contractData.monthlyRent ? (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("monthlyRent")}</Text>
                      <Text style={[S.resultValue, { color: "#22C55E", fontWeight: "700", fontSize: 16 }]}>
                        {contractData.monthlyRent?.toLocaleString()} {t("sar")}
                      </Text>
                    </View>
                  ) : null}
                  {contractData.billCount > 0 && (
                    <View style={[S.resultRow, isRTL && S.rowRev]}>
                      <Text style={S.resultLabel}>{t("bills")}</Text>
                      <Text style={S.resultValue}>
                        {contractData.billCount} ({contractData.unpaidBills}{" "}
                        {t("unpaidBills")})
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/* Import Button */}
              <TouchableOpacity style={S.importBtn} onPress={handleImport} activeOpacity={0.75}>
                <Text style={S.importBtnText}>✅ {t("importData")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* ── Hijri Date Picker Modal ── */}
        <Modal visible={hijriPickerVisible} transparent animationType="slide" onRequestClose={() => setHijriPickerVisible(false)}>
          <View style={S.pickerOverlay}>
            <View style={S.pickerSheet}>
              <View style={[S.pickerHeader, isRTL && S.rowRev]}>
                <TouchableOpacity onPress={() => setHijriPickerVisible(false)}>
                  <Text style={[S.pickerCancel, { color: C.textMuted }]}>{t("pickerCancel")}</Text>
                </TouchableOpacity>
                <Text style={S.pickerTitle}>{t("hijriDob")}</Text>
                <TouchableOpacity onPress={() => {
                  const dd = String(pickerDay).padStart(2, "0");
                  const mm = String(pickerMonth).padStart(2, "0");
                  const yyyy = String(pickerYear);
                  setHijriDob(`${dd}/${mm}/${yyyy}`);
                  if (fieldErrors.hijriDob) setFieldErrors(e => ({ ...e, hijriDob: undefined }));
                  setHijriPickerVisible(false);
                }}>
                  <Text style={[S.pickerDone, { color: C.accent }]}>{t("pickerDone")}</Text>
                </TouchableOpacity>
              </View>

              <View style={[S.pickerColumns, isRTL && S.rowRev]}>
                {/* Day */}
                <View style={S.pickerCol}>
                  <Text style={S.pickerColLabel}>{t("pickerDay")}</Text>
                  <FlatList
                    data={Array.from({ length: 30 }, (_, i) => i + 1)}
                    keyExtractor={i => String(i)}
                    style={S.pickerList}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[S.pickerItem, pickerDay === item && { backgroundColor: C.accent + "20" }]}
                        onPress={() => setPickerDay(item)}
                      >
                        <Text style={[S.pickerItemText, pickerDay === item && { color: C.accent, fontWeight: "700" }]}>
                          {String(item).padStart(2, "0")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>

                {/* Month */}
                <View style={S.pickerCol}>
                  <Text style={S.pickerColLabel}>{t("pickerMonth")}</Text>
                  <FlatList
                    data={Array.from({ length: 12 }, (_, i) => i + 1)}
                    keyExtractor={i => String(i)}
                    style={S.pickerList}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[S.pickerItem, pickerMonth === item && { backgroundColor: C.accent + "20" }]}
                        onPress={() => setPickerMonth(item)}
                      >
                        <Text style={[S.pickerItemText, pickerMonth === item && { color: C.accent, fontWeight: "700" }]}>
                          {String(item).padStart(2, "0")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>

                {/* Year */}
                <View style={S.pickerCol}>
                  <Text style={S.pickerColLabel}>{t("pickerYear")}</Text>
                  <FlatList
                    data={Array.from({ length: 81 }, (_, i) => 1380 + i)}
                    keyExtractor={i => String(i)}
                    style={S.pickerList}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[S.pickerItem, pickerYear === item && { backgroundColor: C.accent + "20" }]}
                        onPress={() => setPickerYear(item)}
                      >
                        <Text style={[S.pickerItemText, pickerYear === item && { color: C.accent, fontWeight: "700" }]}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Off-screen WebView — real size needed for REGA to render content (native only) ── */}
        {!isWeb && webViewUrl && WebView && (
          <WebView
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            style={{ height: 800, width: 400, position: "absolute", left: -9999, top: 0, opacity: 0 }}
            onMessage={onWebViewMessage}
            onLoadEnd={() => {
              if (stepRef.current === "idle") {
                stepRef.current = "form_loaded";
                setCurrentStep(2);
                setLoadingMsg(t("fillingForm"));
                schedulePoll(2000);
              } else if (stepRef.current === "submitted") {
                schedulePoll(1500);
              }
            }}
            onError={() => {
              setLoading(false);
              setError(t("ejarFetchError"));
              setWebViewUrl(null);
            }}
            onHttpError={() => {
              setLoading(false);
              setError(t("ejarFetchError"));
              setWebViewUrl(null);
            }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            startInLoadingState
            userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          />
        )}
      </View>
  );
}

/* ── styles ── */
const styles = (C: any, shadow: any): any =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 54,
      paddingBottom: 12,
      paddingHorizontal: spacing.md,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    rowRev: { flexDirection: "row-reverse" },
    headerSide: { width: 40 },
    headerCenter: { flex: 1, alignItems: "center" },
    backBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.background,
      alignItems: "center",
      justifyContent: "center",
    },
    backArrow: { fontSize: 18, color: C.text, fontWeight: "700" },
    headerTitle: { fontSize: 18, fontWeight: "700", color: C.text },

    heroCard: {
      backgroundColor: C.accentSoft,
      borderRadius: radii.lg,
      padding: spacing.lg,
      alignItems: "center",
      marginBottom: spacing.md,
    },
    heroIcon: { fontSize: 40, marginBottom: 8 },
    heroTitle: { fontSize: 18, fontWeight: "700", color: C.accent, marginBottom: 4 },
    heroSub: { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 20 },

    formCard: {
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadow,
    },
    label: { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6, marginTop: 12 },
    input: {
      backgroundColor: C.background,
      borderRadius: radii.md,
      padding: 14,
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
    },
    inputError: { borderColor: "#EF4444" },
    fieldError: { color: "#EF4444", fontSize: 12, marginTop: 2, marginBottom: 4 },
    hintText: { color: C.textMuted, fontSize: 11, marginTop: 4 },

    fetchBtn: {
      backgroundColor: "#25935f",
      borderRadius: radii.md,
      padding: 16,
      alignItems: "center",
      marginTop: 20,
    },
    fetchBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

    errorCard: {
      backgroundColor: "#FEF2F2",
      borderRadius: radii.md,
      padding: 14,
      marginTop: 12,
      borderWidth: 1,
      borderColor: "#FECACA",
    },
    errorText: { color: "#DC2626", fontSize: 13, textAlign: "center" },

    resultCard: {
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 2,
      borderColor: C.accent + "40",
      ...shadow,
    },
    resultTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: C.text,
      marginBottom: 12,
      textAlign: "center",
    },
    resultSection: {
      backgroundColor: C.background,
      borderRadius: radii.md,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    resultRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 6,
    },
    resultLabel: { fontSize: 13, color: C.textMuted, fontWeight: "500" },
    resultValue: { fontSize: 14, color: C.text, fontWeight: "600" },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
    statusText: { fontSize: 12, fontWeight: "700" },

    importBtn: {
      backgroundColor: C.accent,
      borderRadius: radii.md,
      padding: 16,
      alignItems: "center",
      marginTop: 8,
    },
    importBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

    // Step progress indicator
    stepContainer: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: 14,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    stepItem: { alignItems: "center", width: 64 },
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: C.border,
      backgroundColor: C.background,
    },
    stepCircleCompleted: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
    stepCircleCurrent: { backgroundColor: C.accent, borderColor: C.accent },
    stepCircleFuture: { backgroundColor: C.background, borderColor: C.border },
    stepCheck: { color: "#fff", fontSize: 14, fontWeight: "700" },
    stepNum: { color: C.text, fontSize: 12, fontWeight: "700" },
    stepNumCurrent: { color: "#fff" },
    stepNumFuture: { color: C.textMuted },
    stepLabel: { fontSize: 9, color: C.text, marginTop: 4, textAlign: "center", fontWeight: "600" },
    stepLabelCurrent: { color: C.accent, fontWeight: "700" },
    stepLabelFuture: { color: C.textMuted },
    stepLine: { height: 2, flex: 1, marginTop: 13, marginHorizontal: 2 },
    stepLineCompleted: { backgroundColor: "#22C55E" },
    stepLineCurrent: { backgroundColor: C.accent },
    stepLineFuture: { backgroundColor: C.border },

    // Hijri picker
    pickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    pickerSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 34,
    },
    pickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    pickerTitle: { fontSize: 16, fontWeight: "700", color: C.text },
    pickerCancel: { fontSize: 15, fontWeight: "500" },
    pickerDone: { fontSize: 15, fontWeight: "700" },
    pickerColumns: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 8 },
    pickerCol: { flex: 1, alignItems: "center" },
    pickerColLabel: { fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 6 },
    pickerList: { height: 220 },
    pickerItem: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginVertical: 1, alignItems: "center" },
    pickerItemText: { fontSize: 17, color: C.text },
  });
