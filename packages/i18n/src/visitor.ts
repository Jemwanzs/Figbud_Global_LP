/**
 * Visitor-facing interface text shared by every website (P7-L3, 19 Nov 2026):
 * the cookie consent banner and preferences. FigBud Global's dictionaries and
 * the product websites read the same text. Languages other than English are
 * drafts until a native speaker's review is recorded (Settings & Security →
 * Languages, Q6); product websites show only reviewed languages.
 */
import type { Locale } from "./index";

export interface ConsentCopy {
  labels: {
    region: string;
    acceptAll: string;
    rejectOptional: string;
    customize: string;
    save: string;
    preferencesTitle: string;
    preferencesIntro: string;
    alwaysOn: string;
    privacyPolicy: string;
    cookiePolicy: string;
    close: string;
  };
  /** Shown on pages in other languages; English pages show the Studio's own text. */
  banner: { title: string; body: string };
  categories: Record<
    "necessary" | "analytics" | "preferences" | "marketing",
    { label: string; description: string }
  >;
}

export const consentCopy: Record<Locale, ConsentCopy> = {
  en: {
    labels: {
      region: "Cookie consent",
      acceptAll: "Accept all",
      rejectOptional: "Reject optional",
      customize: "Customize",
      save: "Save choices",
      preferencesTitle: "Cookie preferences",
      preferencesIntro:
        "Choose which optional cookies we may use. You can change your mind at any time from “Cookie settings” at the bottom of every page.",
      alwaysOn: "Always on",
      privacyPolicy: "Privacy Policy",
      cookiePolicy: "Cookie Policy",
      close: "Close",
    },
    // Shown on other languages' pages; English pages show the Studio's text.
    banner: {
      title: "Your privacy matters",
      body: "We use essential cookies to keep our website working. With your permission, we may also use optional cookies to understand website usage and improve your experience.",
    },
    categories: {
      necessary: {
        label: "Strictly necessary",
        description:
          "Keep the website working and secure: they remember your cookie choices, your theme and your language, and protect forms from abuse. Always on.",
      },
      analytics: {
        label: "Analytics",
        description:
          "Help us understand how the website is used, such as which pages are visited, so we can improve it.",
      },
      preferences: {
        label: "Preferences",
        description: "Remember optional personal settings beyond the essentials, to tailor your experience.",
      },
      marketing: {
        label: "Marketing",
        description: "Measure the reach of our marketing and show relevant FigBud content on other websites.",
      },
    },
  },
  sw: {
    labels: {
      region: "Idhini ya vidakuzi",
      acceptAll: "Kubali vyote",
      rejectOptional: "Kataa vya hiari",
      customize: "Chagua mwenyewe",
      save: "Hifadhi chaguo",
      preferencesTitle: "Mapendeleo ya vidakuzi",
      preferencesIntro:
        "Chagua vidakuzi vya hiari tunavyoweza kutumia. Unaweza kubadilisha uamuzi wako wakati wowote kupitia “Mipangilio ya vidakuzi” chini ya kila ukurasa.",
      alwaysOn: "Huwa vimewashwa",
      privacyPolicy: "Sera ya Faragha",
      cookiePolicy: "Sera ya Vidakuzi",
      close: "Funga",
    },
    banner: {
      title: "Faragha yako ni muhimu",
      body: "Tunatumia vidakuzi muhimu ili tovuti yetu ifanye kazi. Kwa idhini yako, tunaweza pia kutumia vidakuzi vya hiari kuelewa jinsi tovuti inavyotumiwa na kuboresha matumizi yako.",
    },
    categories: {
      necessary: {
        label: "Muhimu kabisa",
        description:
          "Huifanya tovuti ifanye kazi kwa usalama: hukumbuka chaguo zako za vidakuzi, mandhari na lugha yako, na hulinda fomu dhidi ya matumizi mabaya. Huwa vimewashwa.",
      },
      analytics: {
        label: "Takwimu",
        description:
          "Hutusaidia kuelewa jinsi tovuti inavyotumiwa, kama kurasa zinazotembelewa, ili tuiboreshe.",
      },
      preferences: {
        label: "Mapendeleo",
        description:
          "Hukumbuka mipangilio ya hiari ya kibinafsi zaidi ya ile muhimu, ili kuboresha matumizi yako.",
      },
      marketing: {
        label: "Masoko",
        description:
          "Hupima ufikiaji wa masoko yetu na kuonyesha maudhui ya FigBud yanayofaa kwenye tovuti nyingine.",
      },
    },
  },
  fr: {
    labels: {
      region: "Consentement aux cookies",
      acceptAll: "Tout accepter",
      rejectOptional: "Refuser les optionnels",
      customize: "Personnaliser",
      save: "Enregistrer mes choix",
      preferencesTitle: "Préférences de cookies",
      preferencesIntro:
        "Choisissez les cookies optionnels que nous pouvons utiliser. Vous pouvez changer d’avis à tout moment via « Paramètres des cookies » en bas de chaque page.",
      alwaysOn: "Toujours actifs",
      privacyPolicy: "Politique de confidentialité",
      cookiePolicy: "Politique relative aux cookies",
      close: "Fermer",
    },
    banner: {
      title: "Votre vie privée compte",
      body: "Nous utilisons des cookies essentiels au fonctionnement de notre site. Avec votre accord, nous pouvons aussi utiliser des cookies optionnels pour comprendre l’utilisation du site et améliorer votre expérience.",
    },
    categories: {
      necessary: {
        label: "Strictement nécessaires",
        description:
          "Assurent le fonctionnement et la sécurité du site : ils mémorisent vos choix de cookies, votre thème et votre langue, et protègent les formulaires contre les abus. Toujours actifs.",
      },
      analytics: {
        label: "Mesure d’audience",
        description:
          "Nous aident à comprendre comment le site est utilisé, par exemple les pages consultées, afin de l’améliorer.",
      },
      preferences: {
        label: "Préférences",
        description:
          "Mémorisent des réglages personnels optionnels au-delà de l’essentiel, pour adapter votre expérience.",
      },
      marketing: {
        label: "Marketing",
        description:
          "Mesurent la portée de notre marketing et affichent du contenu FigBud pertinent sur d’autres sites.",
      },
    },
  },
  ar: {
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
  zh: {
    labels: {
      region: "Cookie 同意",
      acceptAll: "全部接受",
      rejectOptional: "拒绝可选 Cookie",
      customize: "自定义",
      save: "保存选择",
      preferencesTitle: "Cookie 偏好设置",
      preferencesIntro: "选择我们可以使用的可选 Cookie。您可以随时通过每个页面底部的“Cookie 设置”更改选择。",
      alwaysOn: "始终开启",
      privacyPolicy: "隐私政策",
      cookiePolicy: "Cookie 政策",
      close: "关闭",
    },
    banner: {
      title: "您的隐私很重要",
      body: "我们使用必要的 Cookie 来保证网站正常运行。经您许可，我们还可能使用可选 Cookie 来了解网站的使用情况并改善您的体验。",
    },
    categories: {
      necessary: {
        label: "严格必要",
        description:
          "保障网站正常、安全地运行：记住您的 Cookie 选择、主题和语言，并防止表单被滥用。始终开启。",
      },
      analytics: {
        label: "分析",
        description: "帮助我们了解网站的使用方式（例如访问了哪些页面），以便改进网站。",
      },
      preferences: { label: "偏好", description: "记住必要设置之外的可选个人设置，为您提供个性化体验。" },
      marketing: {
        label: "营销",
        description: "衡量我们营销活动的覆盖范围，并在其他网站上展示相关的 FigBud 内容。",
      },
    },
  },
};
