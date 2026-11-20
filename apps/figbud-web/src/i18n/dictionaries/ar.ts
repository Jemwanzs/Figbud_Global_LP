import { consentCopy, type DeepPartial, interfaceCopy } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. Rendered right-to-left. */
const ar: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — برمجيات مؤسسية مصممة للتعقيد",
    description:
      "تبني FigBud Global منصات مؤسسية قابلة للتهيئة للموارد البشرية والإقراض والنفقات: ZiraHR وJasiri LMS وExpense Now وMaster Lender.",
  },
  common: {
    skipToContent: interfaceCopy.ar.skipToContent,
    breadcrumb: "مسار التنقل",
    nav: {
      label: "الرئيسية",
      home: "الرئيسية",
      products: "المنتجات",
      about: "من نحن",
      blog: "المدونة",
      contact: "تواصل معنا",
    },
    navPreviews: {
      home: {
        icon: "sparkles",
        headline: "حيث تتحول الأفكار إلى أثر.",
        description: "اكتشف التقنية التي تدعم أعمالًا أكثر ذكاءً.",
      },
      about: {
        icon: "compass",
        headline: "بُني بهدف. وصُمم للتقدم.",
        description: "تعرّف على الفكر الذي يقف وراء FigBud Global.",
      },
      blog: {
        icon: "book-open",
        headline: "أفكار جديدة. خطوات أذكى.",
        description: "أفكار ورؤى وقصص من عالم التقنية.",
      },
      contact: {
        icon: "message-circle",
        headline: "الأفكار الكبيرة تبدأ بحوار.",
        description: "أخبرنا بما تبنيه، وسنتولى الأمر من هناك.",
      },
    },
    productsMenu: { title: "منصاتنا", viewAll: "عرض جميع المنتجات" },
    cta: {
      letsTalk: "لنتحدث",
      exploreProducts: "استكشف منتجاتنا",
      talkToTeam: "تحدث إلى فريقنا",
      visitSite: "زيارة {product}",
      joinWaitlist: "انضم إلى قائمة الانتظار",
      requestDemo: "اطلب عرضًا توضيحيًا",
    },
    status: { active: "متاح", coming_soon: "قريبًا", planned: "مخطط" },
    search: {
      open: "بحث",
      title: "بحث",
      lead: "ابحث عن الصفحات والمنتجات والمقالات في FigBud Global.",
      label: "البحث في FigBud Global",
      placeholder: "الصفحات والمنتجات والمقالات…",
      button: "بحث",
      resultsFor: 'نتائج "{q}"',
      pages: "الصفحات والمنتجات",
      articles: "المقالات",
      noneTitle: "لا توجد نتائج",
      noneBody: "جرّب كلمات أخرى، أو تصفّح منتجاتنا ومقالاتنا.",
      hint: "ابحث عن منتج أو موضوع أو صفحة.",
      external: "يفتح موقع المنتج",
    },
    theme: interfaceCopy.ar.theme,
    language: interfaceCopy.ar.language,
    menu: { open: "فتح القائمة", close: "إغلاق القائمة" },
    opensInNewTab: "يفتح في علامة تبويب جديدة",
    draftNotice: "هذه الترجمة قيد المراجعة. يُعرض بعض المحتوى باللغة الإنجليزية.",
  },
  home: {
    hero: {
      eyebrow: "من الرؤية إلى القيمة، نحن ننجز",
      titleLead: "مبنية للتعقيد.",
      titleAccent: "مصممة للتقدم.",
      lead: "تقنية مؤسسية تدفع الأعمال إلى الأمام. قابلة للتهيئة. موثوقة. جاهزة للنمو.",
      pillars: ["صُنعت في كينيا", "متعددة اللغات والعملات بالتصميم", "آمنة بالبنية"],
    },
    platforms: { eyebrow: "منصاتنا", title: "منصات متميزة. منظومة واحدة متصلة." },
    philosophy: { eyebrow: "فلسفتنا" },
    africa: {
      eyebrow: "صُممت لأفريقيا. جاهزة لكل مكان.",
      title: "كينيا هي نقطة البداية. وليست نقطة النهاية.",
    },
    engineer: { eyebrow: "ما نبنيه", title: "الأجزاء الصعبة، تحت السيطرة." },
    company: {
      eyebrow: "عن FigBud",
      title: "يجب أن تتكيف التقنية مع عملك. لا العكس.",
    },
    finalCta: { titleLead: "أعمال معقدة؟", titleAccent: "تعرّف على تقنية أبسط." },
  },
  footer: {
    cookieSettings: "إعدادات ملفات تعريف الارتباط",
    productsTitle: "المنتجات",
    companyTitle: "الشركة",
    legalTitle: "قانوني",
    rights: "جميع الحقوق محفوظة.",
  },
  consent: consentCopy.ar,
};

export default ar;
