/**
 * Start Now, demo booking and the websites' main buttons in every language
 * (P7-L3 with P8-M8, 19 Nov 2026). English is the approved text; the others
 * are drafts until a native speaker's review is recorded (Settings &
 * Security → Languages, Q6). Product websites show only reviewed languages,
 * so a draft never reaches their visitors. `{product}`, `{time}`, `{zone}`,
 * `{privacy}` and `{reference}` are filled in by the website; names are never
 * translated.
 */
import type { Locale } from "./index";

export interface LeadText {
  close: string;
  startTitle: string;
  startLead: string;
  startSubmit: string;
  startDone: string;
  startDoneBody: string;
  bookTitle: string;
  bookLead: string;
  bookSubmit: string;
  bookDone: string;
  bookDoneBody: string;
  name: string;
  email: string;
  company: string;
  headcount: string;
  headcountHint: string;
  phone: string;
  message: string;
  startMessageHint: string;
  optional: string;
  consent: string;
  privacy: string;
  reference: string;
  required: string;
  emailInvalid: string;
  phoneInvalid: string;
  consentRequired: string;
  failed: string;
  rateLimited: string;
  closed: string;
  chooseDay: string;
  chooseTime: string;
  timesIn: string;
  yourTime: string;
  noSlots: string;
  bookingOff: string;
  requestDemo: string;
  loadingSlots: string;
  slotsFailed: string;
  retry: string;
  continue: string;
  change: string;
  slotTaken: string;
}

/** A website's main button, by its stage or its chosen action. */
export interface CtaText {
  waitlist: string;
  early_access: string;
  demo: string;
  start_now: string;
  book_demo: string;
}

export const ctaCopy: Record<Locale, CtaText> = {
  en: {
    waitlist: "Join the waitlist",
    early_access: "Request early access",
    demo: "Request a demo",
    start_now: "Start now",
    book_demo: "Book a demo",
  },
  sw: {
    waitlist: "Jiunge na orodha ya kusubiri",
    early_access: "Omba ufikiaji wa mapema",
    demo: "Omba onyesho",
    start_now: "Anza sasa",
    book_demo: "Panga onyesho",
  },
  fr: {
    waitlist: "Rejoindre la liste d'attente",
    early_access: "Demander un accès anticipé",
    demo: "Demander une démo",
    start_now: "Commencer",
    book_demo: "Réserver une démo",
  },
  ar: {
    waitlist: "انضم إلى قائمة الانتظار",
    early_access: "اطلب الوصول المبكر",
    demo: "اطلب عرضًا توضيحيًا",
    start_now: "ابدأ الآن",
    book_demo: "احجز عرضًا توضيحيًا",
  },
  zh: {
    waitlist: "加入候补名单",
    early_access: "申请抢先体验",
    demo: "申请演示",
    start_now: "立即开始",
    book_demo: "预约演示",
  },
};

export const leadCopy: Record<Locale, LeadText> = {
  en: {
    close: "Close",
    startTitle: "Start with {product}",
    startLead: "Tell us about your organisation and we'll set up your workspace with you.",
    startSubmit: "Request my workspace",
    startDone: "Request received",
    startDoneBody: "Our team will contact you about setting up your {product} workspace.",
    bookTitle: "Book a {product} demo",
    bookLead: "Choose a time that suits you. Our team will confirm it with you.",
    bookSubmit: "Book this time",
    bookDone: "Demo requested",
    bookDoneBody: "We've held {time} for you. Our team will confirm it with you.",
    name: "Full name",
    email: "Work email",
    company: "Organisation",
    headcount: "How many people work there?",
    headcountHint: "Employees across all branches.",
    phone: "Phone",
    message: "Anything we should know?",
    startMessageHint: "Modules you need, a go-live date, branches…",
    optional: "optional",
    consent: "I agree to be contacted about my request, as described in the {privacy}.",
    privacy: "privacy notice",
    reference: "Your reference is {reference}.",
    required: "This field is required.",
    emailInvalid: "Enter a valid email address, like name@company.com.",
    phoneInvalid: "Enter a valid phone number for the selected country.",
    consentRequired: "Please agree so we can contact you.",
    failed: "We couldn't send your request. Please try again.",
    rateLimited: "Too many requests. Please wait a moment and try again.",
    closed: "We aren't taking requests online right now.",
    chooseDay: "Choose a day",
    chooseTime: "Choose a time",
    timesIn: "Times in {zone}.",
    yourTime: "{time} your time",
    noSlots: "No times are free in the coming days. Request a demo and we'll arrange one with you.",
    bookingOff: "Online booking isn't open right now. Request a demo and we'll arrange a time with you.",
    requestDemo: "Request a demo",
    loadingSlots: "Loading available times…",
    slotsFailed: "We couldn't load the available times.",
    retry: "Try again",
    continue: "Continue",
    change: "Change",
    slotTaken: "That time was just taken. Please choose another.",
  },
  sw: {
    close: "Funga",
    startTitle: "Anza na {product}",
    startLead: "Tueleze kuhusu shirika lako na tutaandaa eneo lako la kazi pamoja nawe.",
    startSubmit: "Omba eneo langu la kazi",
    startDone: "Ombi limepokelewa",
    startDoneBody: "Timu yetu itawasiliana nawe kuhusu kuandaa eneo lako la kazi la {product}.",
    bookTitle: "Panga onyesho la {product}",
    bookLead: "Chagua muda unaokufaa. Timu yetu itauthibitisha nawe.",
    bookSubmit: "Panga muda huu",
    bookDone: "Onyesho limeombwa",
    bookDoneBody: "Tumekuhifadhia {time}. Timu yetu itauthibitisha nawe.",
    name: "Jina kamili",
    email: "Barua pepe ya kazini",
    company: "Shirika",
    headcount: "Watu wangapi wanafanya kazi huko?",
    headcountHint: "Wafanyakazi katika matawi yote.",
    phone: "Simu",
    message: "Kuna jambo tunalopaswa kujua?",
    startMessageHint: "Moduli unazohitaji, tarehe ya kuanza, matawi…",
    optional: "si lazima",
    consent: "Ninakubali kuwasiliana nami kuhusu ombi langu, kama ilivyoelezwa katika {privacy}.",
    privacy: "taarifa ya faragha",
    reference: "Nambari yako ya kumbukumbu ni {reference}.",
    required: "Sehemu hii inahitajika.",
    emailInvalid: "Weka barua pepe sahihi, kama jina@kampuni.com.",
    phoneInvalid: "Weka nambari sahihi ya simu ya nchi uliyochagua.",
    consentRequired: "Tafadhali kubali ili tuweze kuwasiliana nawe.",
    failed: "Hatukuweza kutuma ombi lako. Tafadhali jaribu tena.",
    rateLimited: "Maombi ni mengi mno. Tafadhali subiri kidogo kisha ujaribu tena.",
    closed: "Hatupokei maombi mtandaoni kwa sasa.",
    chooseDay: "Chagua siku",
    chooseTime: "Chagua muda",
    timesIn: "Muda kwa saa za {zone}.",
    yourTime: "{time} kwa saa zako",
    noSlots: "Hakuna muda ulio wazi siku zijazo. Omba onyesho nasi tutapanga muda nawe.",
    bookingOff: "Upangaji mtandaoni haujafunguliwa kwa sasa. Omba onyesho nasi tutapanga muda nawe.",
    requestDemo: "Omba onyesho",
    loadingSlots: "Inapakia muda ulio wazi…",
    slotsFailed: "Hatukuweza kupakia muda ulio wazi.",
    retry: "Jaribu tena",
    continue: "Endelea",
    change: "Badilisha",
    slotTaken: "Muda huo umechukuliwa sasa hivi. Tafadhali chagua mwingine.",
  },
  fr: {
    close: "Fermer",
    startTitle: "Commencer avec {product}",
    startLead:
      "Parlez-nous de votre organisation et nous mettrons en place votre espace de travail avec vous.",
    startSubmit: "Demander mon espace de travail",
    startDone: "Demande reçue",
    startDoneBody: "Notre équipe vous contactera pour mettre en place votre espace de travail {product}.",
    bookTitle: "Réserver une démo {product}",
    bookLead: "Choisissez un créneau qui vous convient. Notre équipe vous le confirmera.",
    bookSubmit: "Réserver ce créneau",
    bookDone: "Démo demandée",
    bookDoneBody: "Nous vous avons réservé {time}. Notre équipe vous le confirmera.",
    name: "Nom complet",
    email: "E-mail professionnel",
    company: "Organisation",
    headcount: "Combien de personnes y travaillent ?",
    headcountHint: "Employés de toutes les agences.",
    phone: "Téléphone",
    message: "Quelque chose que nous devrions savoir ?",
    startMessageHint: "Modules souhaités, date de démarrage, agences…",
    optional: "facultatif",
    consent: "J'accepte d'être contacté au sujet de ma demande, comme décrit dans la {privacy}.",
    privacy: "politique de confidentialité",
    reference: "Votre référence est {reference}.",
    required: "Ce champ est obligatoire.",
    emailInvalid: "Saisissez une adresse e-mail valide, par exemple nom@entreprise.com.",
    phoneInvalid: "Saisissez un numéro de téléphone valide pour le pays choisi.",
    consentRequired: "Veuillez accepter afin que nous puissions vous contacter.",
    failed: "Nous n'avons pas pu envoyer votre demande. Veuillez réessayer.",
    rateLimited: "Trop de demandes. Veuillez patienter un instant puis réessayer.",
    closed: "Nous ne prenons pas de demandes en ligne pour le moment.",
    chooseDay: "Choisissez un jour",
    chooseTime: "Choisissez un créneau",
    timesIn: "Horaires en {zone}.",
    yourTime: "{time} chez vous",
    noSlots:
      "Aucun créneau n'est libre dans les prochains jours. Demandez une démo et nous en organiserons une avec vous.",
    bookingOff:
      "La réservation en ligne n'est pas ouverte pour le moment. Demandez une démo et nous conviendrons d'un créneau avec vous.",
    requestDemo: "Demander une démo",
    loadingSlots: "Chargement des créneaux disponibles…",
    slotsFailed: "Nous n'avons pas pu charger les créneaux disponibles.",
    retry: "Réessayer",
    continue: "Continuer",
    change: "Modifier",
    slotTaken: "Ce créneau vient d'être pris. Veuillez en choisir un autre.",
  },
  ar: {
    close: "إغلاق",
    startTitle: "ابدأ مع {product}",
    startLead: "أخبرنا عن مؤسستك وسنُعِدّ مساحة العمل الخاصة بك معك.",
    startSubmit: "اطلب مساحة العمل الخاصة بي",
    startDone: "تم استلام الطلب",
    startDoneBody: "سيتواصل معك فريقنا بشأن إعداد مساحة العمل الخاصة بك على {product}.",
    bookTitle: "احجز عرضًا توضيحيًا لـ {product}",
    bookLead: "اختر وقتًا يناسبك. سيؤكده فريقنا معك.",
    bookSubmit: "احجز هذا الوقت",
    bookDone: "تم طلب العرض التوضيحي",
    bookDoneBody: "حجزنا لك {time}. سيؤكده فريقنا معك.",
    name: "الاسم الكامل",
    email: "البريد الإلكتروني للعمل",
    company: "المؤسسة",
    headcount: "كم عدد العاملين فيها؟",
    headcountHint: "الموظفون في جميع الفروع.",
    phone: "الهاتف",
    message: "هل هناك ما ينبغي أن نعرفه؟",
    startMessageHint: "الوحدات التي تحتاجها، وموعد التشغيل، والفروع…",
    optional: "اختياري",
    consent: "أوافق على التواصل معي بشأن طلبي، كما هو موضح في {privacy}.",
    privacy: "إشعار الخصوصية",
    reference: "رقمك المرجعي هو {reference}.",
    required: "هذا الحقل مطلوب.",
    emailInvalid: "أدخل بريدًا إلكترونيًا صالحًا، مثل name@company.com.",
    phoneInvalid: "أدخل رقم هاتف صالحًا للبلد المختار.",
    consentRequired: "يرجى الموافقة حتى نتمكن من التواصل معك.",
    failed: "تعذّر إرسال طلبك. يرجى المحاولة مرة أخرى.",
    rateLimited: "طلبات كثيرة جدًا. يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.",
    closed: "لا نستقبل الطلبات عبر الإنترنت حاليًا.",
    chooseDay: "اختر يومًا",
    chooseTime: "اختر وقتًا",
    timesIn: "الأوقات بتوقيت {zone}.",
    yourTime: "{time} بتوقيتك",
    noSlots: "لا توجد أوقات متاحة في الأيام القادمة. اطلب عرضًا توضيحيًا وسنرتّب موعدًا معك.",
    bookingOff: "الحجز عبر الإنترنت غير متاح حاليًا. اطلب عرضًا توضيحيًا وسنرتّب موعدًا معك.",
    requestDemo: "اطلب عرضًا توضيحيًا",
    loadingSlots: "جارٍ تحميل الأوقات المتاحة…",
    slotsFailed: "تعذّر تحميل الأوقات المتاحة.",
    retry: "حاول مرة أخرى",
    continue: "متابعة",
    change: "تغيير",
    slotTaken: "حُجز هذا الوقت للتو. يرجى اختيار وقت آخر.",
  },
  zh: {
    close: "关闭",
    startTitle: "开始使用 {product}",
    startLead: "请介绍贵组织的情况，我们将与您一起设置工作空间。",
    startSubmit: "申请我的工作空间",
    startDone: "已收到申请",
    startDoneBody: "我们的团队将就设置您的 {product} 工作空间与您联系。",
    bookTitle: "预约 {product} 演示",
    bookLead: "请选择方便的时间，我们的团队会与您确认。",
    bookSubmit: "预约此时间",
    bookDone: "已申请演示",
    bookDoneBody: "我们已为您保留 {time}，团队会与您确认。",
    name: "姓名",
    email: "工作邮箱",
    company: "组织",
    headcount: "贵组织有多少员工？",
    headcountHint: "所有分支机构的员工总数。",
    phone: "电话",
    message: "还有什么需要我们了解的吗？",
    startMessageHint: "所需模块、上线日期、分支机构…",
    optional: "选填",
    consent: "我同意就我的申请与我联系，详见{privacy}。",
    privacy: "隐私声明",
    reference: "您的参考编号是 {reference}。",
    required: "此项为必填项。",
    emailInvalid: "请输入有效的邮箱地址，例如 name@company.com。",
    phoneInvalid: "请输入所选国家/地区的有效电话号码。",
    consentRequired: "请同意，以便我们与您联系。",
    failed: "无法发送您的申请，请重试。",
    rateLimited: "请求过多，请稍候再试。",
    closed: "我们目前不接受在线申请。",
    chooseDay: "选择日期",
    chooseTime: "选择时间",
    timesIn: "时间为 {zone} 时间。",
    yourTime: "您当地时间 {time}",
    noSlots: "未来几天没有空闲时间。请申请演示，我们将与您安排时间。",
    bookingOff: "在线预约暂未开放。请申请演示，我们将与您安排时间。",
    requestDemo: "申请演示",
    loadingSlots: "正在加载可预约时间…",
    slotsFailed: "无法加载可预约时间。",
    retry: "重试",
    continue: "继续",
    change: "更改",
    slotTaken: "该时间刚刚被预约，请选择其他时间。",
  },
};
