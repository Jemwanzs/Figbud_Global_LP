import type { DeepPartial } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. */
const fr: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — Des logiciels d'entreprise conçus pour la complexité",
    description:
      "FigBud Global conçoit des plateformes d'entreprise configurables pour les personnes, le crédit et les dépenses : ZiraHR, Jasiri LMS et Expense Now.",
  },
  common: {
    skipToContent: "Aller au contenu",
    nav: {
      label: "Principale",
      home: "Accueil",
      products: "Produits",
      about: "À propos",
      blog: "Blog",
      contact: "Contact",
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
    theme: { toLight: "Passer au thème clair", toDark: "Passer au thème sombre" },
    language: { label: "Langue", inReview: "En relecture" },
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
    platforms: { eyebrow: "Nos plateformes", title: "Trois plateformes. Un écosystème connecté." },
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
    productsTitle: "Produits",
    companyTitle: "Entreprise",
    legalTitle: "Mentions légales",
    rights: "Tous droits réservés.",
  },
};

export default fr;
