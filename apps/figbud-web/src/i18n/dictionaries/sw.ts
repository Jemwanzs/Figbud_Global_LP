import type { DeepPartial } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. */
const sw: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — Programu za biashara zilizojengwa kwa utata",
    description:
      "FigBud Global hujenga mifumo ya biashara inayoweza kusanidiwa kwa watu, mikopo na matumizi: ZiraHR, Jasiri LMS, Expense Now na Ziwa LMS.",
  },
  common: {
    skipToContent: "Ruka hadi maudhui",
    breadcrumb: "Njia ya ukurasa",
    nav: {
      label: "Kuu",
      home: "Nyumbani",
      products: "Bidhaa",
      about: "Kuhusu Sisi",
      blog: "Blogu",
      contact: "Wasiliana",
    },
    productsMenu: { title: "Mifumo yetu", viewAll: "Tazama bidhaa zote" },
    cta: {
      letsTalk: "Tuzungumze",
      exploreProducts: "Gundua Bidhaa Zetu",
      talkToTeam: "Ongea na Timu Yetu",
      visitSite: "Tembelea {product}",
      joinWaitlist: "Jiunge na orodha ya kusubiri",
      requestDemo: "Omba onyesho",
    },
    status: { active: "Inatumika", coming_soon: "Inakuja hivi karibuni", planned: "Imepangwa" },
    theme: { toLight: "Badilisha kwenda mandhari angavu", toDark: "Badilisha kwenda mandhari meusi" },
    language: { label: "Lugha", inReview: "Inakaguliwa" },
    menu: { open: "Fungua menyu", close: "Funga menyu" },
    opensInNewTab: "hufunguka kwenye kichupo kipya",
    draftNotice: "Tafsiri hii inakaguliwa. Baadhi ya maudhui yanaonyeshwa kwa Kiingereza.",
  },
  home: {
    hero: {
      eyebrow: "Kutoka maono hadi thamani, tunatimiza",
      titleLead: "Imejengwa kwa utata.",
      titleAccent: "Imeundwa kwa maendeleo.",
      lead: "Teknolojia ya biashara inayosukuma biashara mbele. Inasanidika. Inategemewa. Iko tayari kukua.",
      pillars: ["Imejengwa Kenya", "Lugha na sarafu nyingi kwa muundo", "Salama kwa usanifu"],
    },
    platforms: { eyebrow: "Mifumo yetu", title: "Mifumo tofauti. Mfumo-ikolojia mmoja uliounganishwa." },
    philosophy: { eyebrow: "Falsafa yetu" },
    africa: {
      eyebrow: "Imejengwa kwa Afrika. Iko tayari kwa kila mahali.",
      title: "Kenya ndipo tunapoanzia. Si tunapoishia.",
    },
    engineer: { eyebrow: "Tunachokihandisi", title: "Sehemu ngumu, zimeshughulikiwa." },
    company: {
      eyebrow: "Kuhusu FigBud",
      title: "Teknolojia inapaswa kuendana na biashara yako. Si kinyume chake.",
    },
    finalCta: { titleLead: "Biashara tata?", titleAccent: "Kutana na teknolojia rahisi." },
  },
  footer: {
    productsTitle: "Bidhaa",
    companyTitle: "Kampuni",
    legalTitle: "Kisheria",
    rights: "Haki zote zimehifadhiwa.",
  },
};

export default sw;
