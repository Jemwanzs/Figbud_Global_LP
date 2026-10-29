import type { DeepPartial } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. Rendered right-to-left. */
const ar: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — برمجيات مؤسسية مصممة للتعقيد",
    description:
      "تبني FigBud Global منصات مؤسسية قابلة للتهيئة للموارد البشرية والإقراض والنفقات: ZiraHR وJasiri LMS وExpense Now وZiwa LMS.",
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
  consent: {
    labels: {
      region: "الموافقة على ملفات تعريف الارتباط",
      acceptAll: "قبول الكل",
      rejectOptional: "رفض الاختيارية",
      customize: "تخصيص",
      save: "حفظ الاختيارات",
      preferencesTitle: "تفضيلات ملفات تعريف الارتباط",
      preferencesIntro:
        "اختر ملفات تعريف الارتباط الاختيارية التي يمكننا استخدامها. يمكنك تغيير رأيك في أي وقت من «إعدادات ملفات تعريف الارتباط» أسفل كل صفحة.",
      alwaysOn: "مفعّلة دائمًا",
      privacyPolicy: "سياسة الخصوصية",
      cookiePolicy: "سياسة ملفات تعريف الارتباط",
      close: "إغلاق",
    },
    banner: {
      title: "خصوصيتك تهمّنا",
      body: "نستخدم ملفات تعريف الارتباط الأساسية لضمان عمل موقعنا. وبإذنك، قد نستخدم أيضًا ملفات اختيارية لفهم كيفية استخدام الموقع وتحسين تجربتك.",
    },
    categories: {
      necessary: {
        label: "ضرورية للغاية",
        description:
          "تحافظ على عمل الموقع وأمانه: تتذكر اختياراتك لملفات تعريف الارتباط والسمة واللغة، وتحمي النماذج من إساءة الاستخدام. مفعّلة دائمًا.",
      },
      analytics: {
        label: "التحليلات",
        description: "تساعدنا على فهم كيفية استخدام الموقع، مثل الصفحات التي تتم زيارتها، لنتمكن من تحسينه.",
      },
      preferences: {
        label: "التفضيلات",
        description: "تتذكر إعدادات شخصية اختيارية تتجاوز الأساسيات لتخصيص تجربتك.",
      },
      marketing: {
        label: "التسويق",
        description: "تقيس مدى وصول حملاتنا التسويقية وتعرض محتوى FigBud ذا صلة على مواقع أخرى.",
      },
    },
  },
};

export default ar;
