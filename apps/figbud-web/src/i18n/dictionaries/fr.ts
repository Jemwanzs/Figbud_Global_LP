import type { DeepPartial } from "@figbud/i18n";

import type { Dictionary } from "./en";

/** DRAFT — pending native-speaker review before this locale is indexed. */
const fr: DeepPartial<Dictionary> = {
  meta: {
    title: "FigBud Global — Des logiciels d'entreprise conçus pour la complexité",
    description:
      "FigBud Global conçoit des plateformes d'entreprise configurables pour les personnes, le crédit et les dépenses : ZiraHR, Jasiri LMS, Expense Now et Ziwa LMS.",
  },
  common: {
    skipToContent: "Aller au contenu",
    breadcrumb: "Fil d’Ariane",
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
  consent: {
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
};

export default fr;
