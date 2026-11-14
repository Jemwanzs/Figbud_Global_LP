import { type DeepPartial, interfaceCopy } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. */
const sw: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — Programu za biashara zilizojengwa kwa utata",
    description:
      "FigBud Global hujenga mifumo ya biashara inayoweza kusanidiwa kwa watu, mikopo na matumizi: ZiraHR, Jasiri LMS, Expense Now na Ziwa LMS.",
  },
  common: {
    skipToContent: interfaceCopy.sw.skipToContent,
    breadcrumb: "Njia ya ukurasa",
    nav: {
      label: "Kuu",
      home: "Nyumbani",
      products: "Bidhaa",
      about: "Kuhusu Sisi",
      blog: "Blogu",
      contact: "Wasiliana",
    },
    navPreviews: {
      home: {
        icon: "sparkles",
        headline: "Mahali mawazo yanapoleta matokeo.",
        description: "Gundua teknolojia inayowezesha biashara bora zaidi.",
      },
      about: {
        icon: "compass",
        headline: "Imejengwa kwa kusudi. Imeundwa kwa maendeleo.",
        description: "Fahamu fikra zilizo nyuma ya FigBud Global.",
      },
      blog: {
        icon: "book-open",
        headline: "Mawazo mapya. Hatua bora zaidi.",
        description: "Mawazo, maarifa na hadithi kutoka ulimwengu wa teknolojia.",
      },
      contact: {
        icon: "message-circle",
        headline: "Mawazo makubwa huanza na mazungumzo.",
        description: "Tuambie unachojenga. Tutaendelea kutoka hapo.",
      },
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
    search: {
      open: "Tafuta",
      title: "Tafuta",
      lead: "Pata kurasa, bidhaa na makala kwenye FigBud Global.",
      label: "Tafuta kwenye FigBud Global",
      placeholder: "Kurasa, bidhaa na makala…",
      button: "Tafuta",
      resultsFor: 'Matokeo ya "{q}"',
      pages: "Kurasa na bidhaa",
      articles: "Makala",
      noneTitle: "Hakuna kilichopatikana",
      noneBody: "Jaribu maneno mengine, au angalia bidhaa na makala zetu.",
      hint: "Tafuta bidhaa, mada au ukurasa.",
      external: "hufungua tovuti ya bidhaa",
    },
    theme: interfaceCopy.sw.theme,
    language: interfaceCopy.sw.language,
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
    cookieSettings: "Mipangilio ya vidakuzi",
    productsTitle: "Bidhaa",
    companyTitle: "Kampuni",
    legalTitle: "Kisheria",
    rights: "Haki zote zimehifadhiwa.",
  },
  consent: {
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
};

export default sw;
