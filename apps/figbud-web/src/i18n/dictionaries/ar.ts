import type { DeepPartial } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. Rendered right-to-left. */
const ar: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — برمجيات مؤسسية مصممة للتعقيد",
    description:
      "تبني FigBud Global منصات مؤسسية قابلة للتهيئة للموارد البشرية والإقراض والنفقات: ZiraHR وJasiri LMS وExpense Now.",
  },
  common: {
    skipToContent: "انتقل إلى المحتوى",
    breadcrumb: "مسار التنقل",
    nav: {
      label: "الرئيسية",
      home: "الرئيسية",
      products: "المنتجات",
      about: "من نحن",
      blog: "المدونة",
      contact: "تواصل معنا",
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
    theme: { toLight: "التبديل إلى السمة الفاتحة", toDark: "التبديل إلى السمة الداكنة" },
    language: { label: "اللغة", inReview: "قيد المراجعة" },
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
    platforms: { eyebrow: "منصاتنا", title: "ثلاث منصات. منظومة واحدة متصلة." },
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
    productsTitle: "المنتجات",
    companyTitle: "الشركة",
    legalTitle: "قانوني",
    rights: "جميع الحقوق محفوظة.",
  },
};

export default ar;
