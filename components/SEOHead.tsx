import { useEffect } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

/** SEO configuration — Arabic-first, targeting Saudi landlords */
const SEO = {
  // Arabic is primary (Saudi market)
  title: "أملاكي - مدير عقاراتك الذكي | Amlakey",
  titleAr: "أملاكي - أفضل تطبيق إدارة عقارات في السعودية",
  titleEn: "Amlakey - Best Property Management App in Saudi Arabia",
  description:
    "أملاكي أفضل تطبيق لإدارة العقارات والأملاك في المملكة العربية السعودية. تتبع الإيجارات، إدارة المستأجرين، متابعة فواتير الكهرباء والمياه، تقارير الأداء، وتذكيرات تلقائية للدفع. مجاني وسهل الاستخدام.",
  descriptionEn:
    "Amlakey is the best property management app in Saudi Arabia. Track rent, manage tenants, monitor electricity & water bills, performance reports, and automatic payment reminders. Free and easy to use.",
  url: "https://amlakeyapp.com",
  image: "https://amlakeyapp.com/og-image.png",
  siteName: "أملاكي - Amlakey",
  themeColor: "#0D9488",
  // Arabic-first keywords targeting Saudi market
  keywords: [
    // Primary Arabic keywords (Saudi search terms)
    "إدارة عقارات",
    "تطبيق إدارة أملاك",
    "برنامج إدارة عقارات",
    "تتبع إيجارات",
    "إدارة مستأجرين",
    "متابعة الإيجار",
    "فواتير كهرباء",
    "فواتير مياه",
    "تحصيل إيجارات",
    "عقارات السعودية",
    "ملاك عقارات",
    "أملاكي",
    "إدارة شقق",
    "إدارة عمارات",
    "إدارة فلل",
    "تطبيق عقاري",
    "تقارير عقارية",
    "تذكير إيجار",
    "متأخرات إيجار",
    "عقد إيجار",
    "إيجار شقة",
    // English keywords
    "property management saudi",
    "rent tracker",
    "tenant management",
    "amlakey",
    "saudi landlord app",
    "real estate management",
    "electricity bill tracker saudi",
    "SEC bill",
    "NWC bill",
  ].join(", "),
  author: "أملاكي",
  appStoreId: "6760889831",
};

/**
 * Structured data (JSON-LD) for Google rich results — Arabic-focused
 */
function getStructuredData(isAr: boolean) {
  return [
    // Software Application
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "أملاكي",
      alternateName: "Amlakey",
      description: isAr ? SEO.description : SEO.descriptionEn,
      url: SEO.url,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "PropertyManagement",
      operatingSystem: "iOS, Web",
      offers: [
        {
          "@type": "Offer",
          price: "0",
          priceCurrency: "SAR",
          name: "مجاني",
          description: "إدارة حتى 3 عقارات مجاناً",
        },
        {
          "@type": "Offer",
          price: "14.99",
          priceCurrency: "SAR",
          name: "احترافي",
          description: "عقارات غير محدودة وتقارير متقدمة",
          billingIncrement: "P1M",
        },
      ],
      featureList: [
        "إدارة العقارات والوحدات",
        "تتبع الإيجارات والمتأخرات",
        "إدارة بيانات المستأجرين",
        "متابعة فواتير الكهرباء (SEC)",
        "متابعة فواتير المياه (NWC)",
        "تقارير الأداء والتحصيل",
        "تذكيرات تلقائية للإيجار",
        "رسائل واتساب للمستأجرين",
        "دعم كامل للغة العربية",
      ],
      screenshot: SEO.image,
      author: {
        "@type": "Organization",
        name: "أملاكي",
        url: SEO.url,
      },
      inLanguage: ["ar", "en"],
      availableLanguage: [
        { "@type": "Language", name: "العربية", alternateName: "ar" },
        { "@type": "Language", name: "English", alternateName: "en" },
      ],
      countryOfOrigin: {
        "@type": "Country",
        name: "المملكة العربية السعودية",
      },
    },
    // Organization
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "أملاكي",
      alternateName: "Amlakey",
      url: SEO.url,
      logo: `${SEO.url}/favicon.ico`,
      contactPoint: {
        "@type": "ContactPoint",
        email: "support@amlakeyapp.com",
        contactType: "خدمة العملاء",
        availableLanguage: ["العربية", "English"],
        areaServed: {
          "@type": "Country",
          name: "SA",
        },
      },
    },
    // WebSite
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "أملاكي",
      alternateName: "Amlakey",
      url: SEO.url,
      description: SEO.description,
      inLanguage: "ar",
    },
    // FAQPage — helps with Google rich snippets
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "هل تطبيق أملاكي مجاني؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: "نعم، أملاكي مجاني لإدارة حتى 3 عقارات و5 وحدات لكل عقار. الباقة الاحترافية متاحة بـ 14.99 ريال شهرياً لعقارات غير محدودة.",
          },
        },
        {
          "@type": "Question",
          name: "هل يمكنني متابعة فواتير الكهرباء والمياه؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: "نعم، أملاكي يتصل مباشرة بشركة الكهرباء السعودية (SEC) وشركة المياه الوطنية (NWC) لجلب الفواتير تلقائياً وإضافتها للمصاريف.",
          },
        },
        {
          "@type": "Question",
          name: "هل التطبيق يعمل على الأيفون والويب؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: "نعم، أملاكي متاح على iOS وعلى الويب. يمكنك الوصول لبياناتك من أي جهاز.",
          },
        },
        {
          "@type": "Question",
          name: "كيف أتتبع إيجارات المستأجرين؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: "أضف عقاراتك ومستأجريك، وسجل الدفعات شهرياً. التطبيق يحسب المتأخرات تلقائياً ويرسل تذكيرات قبل موعد الإيجار.",
          },
        },
      ],
    },
  ];
}

/**
 * Injects all SEO meta tags into document head.
 * Arabic-first for Saudi audience.
 */
export function useSEO(options?: { isAr?: boolean }) {
  const isAr = options?.isAr ?? true; // Default Arabic

  useEffect(() => {
    if (!isWeb) return;

    const title = isAr ? SEO.titleAr : SEO.titleEn;
    const description = isAr ? SEO.description : SEO.descriptionEn;

    document.title = title;

    function setMeta(attr: string, attrValue: string, content: string) {
      let el = document.querySelector(`meta[${attr}="${attrValue}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, attrValue);
        document.head.appendChild(el);
      }
      el.content = content;
    }

    function setLink(rel: string, href: string, extra?: Record<string, string>) {
      const selector = extra?.hreflang
        ? `link[rel="${rel}"][hreflang="${extra.hreflang}"]`
        : `link[rel="${rel}"]`;
      let el = document.querySelector(selector) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = href;
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          el.setAttribute(k, v);
        }
      }
    }

    // ── Basic Meta ──
    setMeta("name", "description", description);
    setMeta("name", "keywords", SEO.keywords);
    setMeta("name", "author", SEO.author);
    setMeta("name", "robots", "index, follow, max-image-preview:large, max-snippet:-1");
    setMeta("name", "theme-color", SEO.themeColor);
    setMeta("name", "application-name", "أملاكي");
    setMeta("name", "apple-mobile-web-app-title", "أملاكي");
    setMeta("name", "apple-mobile-web-app-capable", "yes");
    setMeta("name", "apple-mobile-web-app-status-bar-style", "default");
    setMeta("name", "mobile-web-app-capable", "yes");
    setMeta("name", "format-detection", "telephone=no");
    // Geo targeting for Saudi Arabia
    setMeta("name", "geo.region", "SA");
    setMeta("name", "geo.placename", "Saudi Arabia");
    setMeta("name", "content-language", isAr ? "ar-SA" : "en");

    // ── Open Graph (WhatsApp, Twitter/X, LinkedIn) ──
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", SEO.siteName);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", SEO.url);
    setMeta("property", "og:image", SEO.image);
    setMeta("property", "og:image:width", "1200");
    setMeta("property", "og:image:height", "630");
    setMeta("property", "og:image:alt", "أملاكي - مدير عقاراتك الذكي");
    setMeta("property", "og:locale", isAr ? "ar_SA" : "en_US");
    setMeta("property", "og:locale:alternate", isAr ? "en_US" : "ar_SA");

    // ── Twitter/X Card ──
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", SEO.image);
    setMeta("name", "twitter:image:alt", "أملاكي - مدير عقاراتك الذكي");

    // ── Canonical & Language Alternates ──
    setLink("canonical", SEO.url);
    setLink("alternate", SEO.url, { hreflang: "ar" });
    setLink("alternate", SEO.url, { hreflang: "en" });
    setLink("alternate", SEO.url, { hreflang: "x-default" });
    setLink("apple-touch-icon", "/favicon.ico");

    // ── JSON-LD Structured Data ──
    const ldId = "amlakey-jsonld";
    let ldScript = document.getElementById(ldId) as HTMLScriptElement | null;
    if (!ldScript) {
      ldScript = document.createElement("script");
      ldScript.id = ldId;
      ldScript.type = "application/ld+json";
      document.head.appendChild(ldScript);
    }
    ldScript.textContent = JSON.stringify(getStructuredData(isAr));

  }, [isAr]);
}

export default useSEO;
