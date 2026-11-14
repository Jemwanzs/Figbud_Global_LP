import type { Locale } from "./index";

/**
 * Interface text shared by every website (P7-L2b, 14 Nov 2026): the skip
 * link, theme switch and language selector. One source for FigBud Global's
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
  }
> = {
  en: {
    skipToContent: "Skip to content",
    theme: { toLight: "Switch to light theme", toDark: "Switch to dark theme" },
    language: { label: "Language", inReview: "In review" },
  },
  sw: {
    skipToContent: "Ruka hadi maudhui",
    theme: { toLight: "Badili kwenda mandhari angavu", toDark: "Badili kwenda mandhari meusi" },
    language: { label: "Lugha", inReview: "Inakaguliwa" },
  },
  fr: {
    skipToContent: "Aller au contenu",
    theme: { toLight: "Passer au thème clair", toDark: "Passer au thème sombre" },
    language: { label: "Langue", inReview: "En relecture" },
  },
  ar: {
    skipToContent: "انتقل إلى المحتوى",
    theme: { toLight: "التبديل إلى السمة الفاتحة", toDark: "التبديل إلى السمة الداكنة" },
    language: { label: "اللغة", inReview: "قيد المراجعة" },
  },
  zh: {
    skipToContent: "跳到主要内容",
    theme: { toLight: "切换到浅色主题", toDark: "切换到深色主题" },
    language: { label: "语言", inReview: "审校中" },
  },
};
