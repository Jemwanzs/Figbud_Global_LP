import type { Locale } from "./index";

/** The Platform menu's built-in entries, in order; each shows only while it exists. */
export const PLATFORM_ENTRIES = ["overview", "modules", "payroll", "pricing", "integrations"] as const;
export type PlatformEntry = (typeof PLATFORM_ENTRIES)[number];

/**
 * Interface text shared by every website (P7-L2b, 14 Nov 2026): the skip
 * link, theme switch and language selector, and the Platform menu's built-in
 * entries (owner's brief, 14 Nov 2026). One source for FigBud Global's
 * dictionaries and the product websites; translations other than English are
 * drafts until a native speaker's review is recorded (Settings & Security →
 * Languages, Q6).
 */
export const interfaceCopy: Record<
  Locale,
  {
    skipToContent: string;
    theme: { toLight: string; toDark: string };
    language: { label: string; inReview: string };
    /** A product showcase's controls (owner's brief, 18 Nov 2026). */
    showcase: { views: string; preview: string; close: string; fit: string; actual: string };
    /** The button that opens a menu entry's submenu ("{label}": the entry). */
    submenu: string;
    /** The Platform submenu: each entry's name and a short description. */
    platformMenu: Record<PlatformEntry, { label: string; hint: string }>;
  }
> = {
  en: {
    skipToContent: "Skip to content",
    theme: { toLight: "Switch to light theme", toDark: "Switch to dark theme" },
    language: { label: "Language", inReview: "In review" },
    submenu: "More in {label}",
    showcase: {
      views: "Product views",
      preview: "View dashboard preview",
      close: "Close preview",
      fit: "Fit to screen",
      actual: "Actual size",
    },
    platformMenu: {
      overview: { label: "Platform overview", hint: "How everything connects" },
      modules: { label: "Features & modules", hint: "Every module and what it does" },
      payroll: { label: "Payroll calculator", hint: "Gross to net, with statutory deductions" },
      pricing: { label: "Pricing & plans", hint: "Published prices and an estimate" },
      integrations: { label: "Integrations", hint: "What it connects to" },
    },
  },
  sw: {
    skipToContent: "Ruka hadi maudhui",
    theme: { toLight: "Badili kwenda mandhari angavu", toDark: "Badili kwenda mandhari meusi" },
    language: { label: "Lugha", inReview: "Inakaguliwa" },
    submenu: "Zaidi katika {label}",
    showcase: {
      views: "Mionekano ya bidhaa",
      preview: "Tazama dashibodi kwa ukubwa",
      close: "Funga",
      fit: "Toshea skrini",
      actual: "Ukubwa halisi",
    },
    platformMenu: {
      overview: { label: "Muhtasari wa jukwaa", hint: "Jinsi kila kitu kinavyounganishwa" },
      modules: { label: "Vipengele na moduli", hint: "Kila moduli na kazi yake" },
      payroll: { label: "Kikokotoo cha mishahara", hint: "Jumla hadi halisi, pamoja na makato ya kisheria" },
      pricing: { label: "Bei na mipango", hint: "Bei zilizochapishwa na makadirio" },
      integrations: { label: "Miunganisho", hint: "Inaunganishwa na nini" },
    },
  },
  fr: {
    skipToContent: "Aller au contenu",
    theme: { toLight: "Passer au thème clair", toDark: "Passer au thème sombre" },
    language: { label: "Langue", inReview: "En relecture" },
    submenu: "Plus dans {label}",
    showcase: {
      views: "Vues du produit",
      preview: "Voir le tableau de bord en grand",
      close: "Fermer l’aperçu",
      fit: "Ajuster à l’écran",
      actual: "Taille réelle",
    },
    platformMenu: {
      overview: { label: "Présentation de la plateforme", hint: "Comment tout est relié" },
      modules: { label: "Fonctionnalités et modules", hint: "Chaque module et son rôle" },
      payroll: { label: "Calculateur de paie", hint: "Du brut au net, retenues légales comprises" },
      pricing: { label: "Tarifs et formules", hint: "Tarifs publiés et estimation" },
      integrations: { label: "Intégrations", hint: "Ce à quoi elle se connecte" },
    },
  },
  ar: {
    skipToContent: "انتقل إلى المحتوى",
    theme: { toLight: "التبديل إلى السمة الفاتحة", toDark: "التبديل إلى السمة الداكنة" },
    language: { label: "اللغة", inReview: "قيد المراجعة" },
    submenu: "المزيد في {label}",
    showcase: {
      views: "عروض المنتج",
      preview: "عرض لوحة المعلومات بحجم أكبر",
      close: "إغلاق المعاينة",
      fit: "ملاءمة الشاشة",
      actual: "الحجم الفعلي",
    },
    platformMenu: {
      overview: { label: "نظرة عامة على المنصة", hint: "كيف يترابط كل شيء" },
      modules: { label: "الميزات والوحدات", hint: "كل وحدة ووظيفتها" },
      payroll: { label: "حاسبة الرواتب", hint: "من الإجمالي إلى الصافي مع الاستقطاعات النظامية" },
      pricing: { label: "الأسعار والباقات", hint: "الأسعار المنشورة وتقدير للتكلفة" },
      integrations: { label: "التكاملات", hint: "ما تتصل به" },
    },
  },
  zh: {
    skipToContent: "跳到主要内容",
    theme: { toLight: "切换到浅色主题", toDark: "切换到深色主题" },
    language: { label: "语言", inReview: "审校中" },
    submenu: "{label}：更多内容",
    showcase: {
      views: "产品视图",
      preview: "查看大图",
      close: "关闭预览",
      fit: "适应屏幕",
      actual: "实际大小",
    },
    platformMenu: {
      overview: { label: "平台概览", hint: "一切如何连接" },
      modules: { label: "功能与模块", hint: "每个模块及其作用" },
      payroll: { label: "薪资计算器", hint: "从税前到税后，含法定扣除" },
      pricing: { label: "价格与方案", hint: "已发布的价格与估算" },
      integrations: { label: "集成", hint: "可连接的系统" },
    },
  },
};
