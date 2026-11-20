import { consentCopy, type DeepPartial, interfaceCopy } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. */
const fr: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — Des logiciels d'entreprise conçus pour la complexité",
    description:
      "FigBud Global conçoit des plateformes d'entreprise configurables pour les personnes, le crédit et les dépenses : ZiraHR, Jasiri LMS, Expense Now et Master Lender.",
  },
  common: {
    skipToContent: interfaceCopy.fr.skipToContent,
    breadcrumb: "Fil d’Ariane",
    nav: {
      label: "Principale",
      home: "Accueil",
      products: "Produits",
      about: "À propos",
      blog: "Blog",
      contact: "Contact",
    },
    navPreviews: {
      home: {
        icon: "sparkles",
        headline: "Là où les idées deviennent impact.",
        description: "Découvrez la technologie au service d'entreprises plus intelligentes.",
      },
      about: {
        icon: "compass",
        headline: "Pensé avec sens. Conçu pour le progrès.",
        description: "Découvrez la réflexion derrière FigBud Global.",
      },
      blog: {
        icon: "book-open",
        headline: "Idées neuves. Choix plus avisés.",
        description: "Idées, analyses et récits du monde de la technologie.",
      },
      contact: {
        icon: "message-circle",
        headline: "Les grandes idées naissent d'une conversation.",
        description: "Dites-nous ce que vous construisez. Nous prendrons le relais.",
      },
    },
    productsMenu: { title: "Nos plateformes", viewAll: "Voir tous les produits" },
    cta: {
      letsTalk: "Parlons-en",
      exploreProducts: "Découvrir nos produits",
      talkToTeam: "Parler à notre équipe",
      visitSite: "Visiter {product}",
      joinWaitlist: "Rejoindre la liste d'attente",
      requestDemo: "Demander une démo",
    },
    status: { active: "Disponible", coming_soon: "Bientôt disponible", planned: "Prévu" },
    search: {
      open: "Rechercher",
      title: "Recherche",
      lead: "Trouvez des pages, des produits et des articles sur FigBud Global.",
      label: "Rechercher sur FigBud Global",
      placeholder: "Pages, produits, articles…",
      button: "Rechercher",
      resultsFor: "Résultats pour « {q} »",
      pages: "Pages et produits",
      articles: "Articles",
      noneTitle: "Aucun résultat",
      noneBody: "Essayez d'autres mots, ou parcourez nos produits et nos articles.",
      hint: "Cherchez un produit, un sujet ou une page.",
      external: "ouvre le site du produit",
    },
    theme: interfaceCopy.fr.theme,
    language: interfaceCopy.fr.language,
    menu: { open: "Ouvrir le menu", close: "Fermer le menu" },
    opensInNewTab: "s'ouvre dans un nouvel onglet",
    draftNotice: "Cette traduction est en cours de relecture. Certains contenus sont affichés en anglais.",
  },
  home: {
    hero: {
      eyebrow: "De la vision à la valeur, nous livrons",
      titleLead: "Conçu pour la complexité.",
      titleAccent: "Pensé pour le progrès.",
      lead: "Une technologie d'entreprise qui fait avancer les organisations. Configurable. Fiable. Prête à grandir.",
      pillars: ["Conçu au Kenya", "Multilingue et multidevise par conception", "Sécurisé par l'architecture"],
    },
    platforms: { eyebrow: "Nos plateformes", title: "Des plateformes distinctes. Un écosystème connecté." },
    philosophy: { eyebrow: "Notre philosophie" },
    africa: {
      eyebrow: "Conçu pour l'Afrique. Prêt pour le monde.",
      title: "Le Kenya est notre point de départ. Pas notre point d'arrivée.",
    },
    engineer: { eyebrow: "Ce que nous concevons", title: "Les parties difficiles, maîtrisées." },
    company: {
      eyebrow: "À propos de FigBud",
      title: "La technologie doit s'adapter à votre entreprise. Pas l'inverse.",
    },
    finalCta: { titleLead: "Une activité complexe ?", titleAccent: "Découvrez une technologie plus simple." },
  },
  footer: {
    cookieSettings: "Paramètres des cookies",
    productsTitle: "Produits",
    companyTitle: "Entreprise",
    legalTitle: "Mentions légales",
    rights: "Tous droits réservés.",
  },
  consent: consentCopy.fr,
};

export default fr;
