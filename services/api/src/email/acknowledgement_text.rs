//! The visitor's acknowledgement in their language (P5-12). English is the
//! approved text; the others are drafts, used only once their language is
//! published in Settings & Security → Languages with a recorded native-speaker
//! review (`locale_reviews`), which covers these texts as well (the Languages
//! page shows them). Product and company names are never translated.

use crate::enquiry::{EnquiryKind, Product};

/// One language's acknowledgement wording. `{product}` is replaced by the
/// product's name.
pub struct Text {
    pub lang: &'static str,
    pub dir: &'static str,
    /// (subject, headline, next steps) per kind of enquiry.
    pub referral: [&'static str; 3],
    pub waitlist: [&'static str; 3],
    pub early_access: [&'static str; 3],
    pub demo: [&'static str; 3],
    pub partnership: [&'static str; 3],
    pub contact_figbud: [&'static str; 3],
    pub contact_product: [&'static str; 3],
    /// "Hi {name},"
    pub greeting: &'static str,
    /// "Your reference is {reference}. Quote it if you need to follow up." ({reference} is wrapped in HTML)
    pub reference: &'static str,
    pub ignore: &'static str,
}

const EN: Text = Text {
    lang: "en",
    dir: "ltr",
    referral: [
        "Thanks for your {product} referral",
        "Thanks for the introduction",
        "Our team will review it and reach out to the business you introduced. You earn once the deal has closed. Quote your reference to follow it with the {product} team.",
    ],
    waitlist: [
        "You're on the {product} waitlist",
        "You're on the {product} waitlist",
        "We'll let you know as soon as {product} opens to early customers. There's nothing else you need to do for now.",
    ],
    early_access: [
        "Your {product} early-access request",
        "We've received your early-access request",
        "Our team reviews early-access requests in batches and will contact you about next steps.",
    ],
    demo: [
        "Your {product} demo request",
        "Thanks for your interest in {product}",
        "A member of our team will contact you to arrange a demo at a time that suits you.",
    ],
    partnership: [
        "Your partnership enquiry with FigBud Global",
        "Thanks for reaching out about partnering with us",
        "The right person on our team will review your enquiry and get back to you.",
    ],
    contact_figbud: [
        "We've received your message",
        "Thanks for getting in touch",
        "A member of our team will review your message and get back to you.",
    ],
    contact_product: [
        "We've received your {product} enquiry",
        "Thanks for getting in touch",
        "A member of the {product} team will review your message and get back to you.",
    ],
    greeting: "Hi {name},",
    reference: "Your reference is {reference}. Quote it if you need to follow up.",
    ignore: "If you didn't submit this request, you can safely ignore this email.",
};

/// Draft: Kiswahili.
const SW: Text = Text {
    lang: "sw",
    dir: "ltr",
    referral: [
        "Asante kwa kutupendekezea {product}",
        "Asante kwa utambulisho",
        "Timu yetu itaupitia na kuwasiliana na biashara uliyotutambulisha. Utapata malipo mara mkataba utakapokamilika. Taja nambari yako ya kumbukumbu ili kufuatilia na timu ya {product}.",
    ],
    waitlist: [
        "Uko kwenye orodha ya kusubiri ya {product}",
        "Uko kwenye orodha ya kusubiri ya {product}",
        "Tutakujulisha mara tu {product} itakapofunguliwa kwa wateja wa mwanzo. Hakuna jambo jingine unalohitaji kufanya kwa sasa.",
    ],
    early_access: [
        "Ombi lako la ufikiaji wa mapema wa {product}",
        "Tumepokea ombi lako la ufikiaji wa mapema",
        "Timu yetu hupitia maombi ya ufikiaji wa mapema kwa makundi na itawasiliana nawe kuhusu hatua zinazofuata.",
    ],
    demo: [
        "Ombi lako la onyesho la {product}",
        "Asante kwa kupendezwa na {product}",
        "Mmoja wa timu yetu atawasiliana nawe kupanga onyesho kwa wakati unaokufaa.",
    ],
    partnership: [
        "Ombi lako la ushirikiano na FigBud Global",
        "Asante kwa kuwasiliana nasi kuhusu ushirikiano",
        "Mtu sahihi katika timu yetu atapitia ombi lako na kukujibu.",
    ],
    contact_figbud: [
        "Tumepokea ujumbe wako",
        "Asante kwa kuwasiliana nasi",
        "Mmoja wa timu yetu atapitia ujumbe wako na kukujibu.",
    ],
    contact_product: [
        "Tumepokea ombi lako kuhusu {product}",
        "Asante kwa kuwasiliana nasi",
        "Mmoja wa timu ya {product} atapitia ujumbe wako na kukujibu.",
    ],
    greeting: "Habari {name},",
    reference: "Nambari yako ya kumbukumbu ni {reference}. Itaje ukihitaji kufuatilia.",
    ignore: "Kama hukutuma ombi hili, unaweza kupuuza barua pepe hii.",
};

/// Draft: French.
const FR: Text = Text {
    lang: "fr",
    dir: "ltr",
    referral: [
        "Merci pour votre recommandation {product}",
        "Merci pour la mise en relation",
        "Notre équipe va l'examiner et contacter l'entreprise que vous avez présentée. Vous êtes rémunéré une fois l'affaire conclue. Indiquez votre référence pour en assurer le suivi avec l'équipe {product}.",
    ],
    waitlist: [
        "Vous êtes sur la liste d'attente de {product}",
        "Vous êtes sur la liste d'attente de {product}",
        "Nous vous préviendrons dès que {product} s'ouvrira aux premiers clients. Vous n'avez rien d'autre à faire pour le moment.",
    ],
    early_access: [
        "Votre demande d'accès anticipé à {product}",
        "Nous avons bien reçu votre demande d'accès anticipé",
        "Notre équipe examine les demandes d'accès anticipé par lots et vous contactera pour la suite.",
    ],
    demo: [
        "Votre demande de démonstration de {product}",
        "Merci de l'intérêt que vous portez à {product}",
        "Un membre de notre équipe vous contactera pour organiser une démonstration au moment qui vous convient.",
    ],
    partnership: [
        "Votre demande de partenariat avec FigBud Global",
        "Merci de nous avoir contactés au sujet d'un partenariat",
        "La bonne personne de notre équipe examinera votre demande et vous répondra.",
    ],
    contact_figbud: [
        "Nous avons bien reçu votre message",
        "Merci de nous avoir contactés",
        "Un membre de notre équipe examinera votre message et vous répondra.",
    ],
    contact_product: [
        "Nous avons bien reçu votre demande concernant {product}",
        "Merci de nous avoir contactés",
        "Un membre de l'équipe {product} examinera votre message et vous répondra.",
    ],
    greeting: "Bonjour {name},",
    reference: "Votre référence est {reference}. Indiquez-la si vous avez besoin d'un suivi.",
    ignore: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.",
};

/// Draft: Arabic (right to left).
const AR: Text = Text {
    lang: "ar",
    dir: "rtl",
    referral: [
        "شكرًا لترشيحك {product}",
        "شكرًا على التعريف",
        "سيراجع فريقنا الترشيح ويتواصل مع الشركة التي عرّفتنا بها. تحصل على مكافأتك بعد إتمام الصفقة. اذكر رقمك المرجعي لمتابعته مع فريق {product}.",
    ],
    waitlist: [
        "أنت على قائمة انتظار {product}",
        "أنت على قائمة انتظار {product}",
        "سنُعلمك فور إتاحة {product} للعملاء الأوائل. لا يلزمك فعل أي شيء آخر الآن.",
    ],
    early_access: [
        "طلبك للوصول المبكر إلى {product}",
        "استلمنا طلبك للوصول المبكر",
        "يراجع فريقنا طلبات الوصول المبكر على دفعات وسيتواصل معك بشأن الخطوات التالية.",
    ],
    demo: [
        "طلبك لعرض توضيحي لـ {product}",
        "شكرًا لاهتمامك بـ {product}",
        "سيتواصل معك أحد أعضاء فريقنا لترتيب عرض توضيحي في الوقت المناسب لك.",
    ],
    partnership: [
        "طلب الشراكة الخاص بك مع FigBud Global",
        "شكرًا لتواصلك معنا بشأن الشراكة",
        "سيراجع الشخص المناسب في فريقنا طلبك ويرد عليك.",
    ],
    contact_figbud: [
        "استلمنا رسالتك",
        "شكرًا لتواصلك معنا",
        "سيراجع أحد أعضاء فريقنا رسالتك ويرد عليك.",
    ],
    contact_product: [
        "استلمنا استفسارك بشأن {product}",
        "شكرًا لتواصلك معنا",
        "سيراجع أحد أعضاء فريق {product} رسالتك ويرد عليك.",
    ],
    greeting: "مرحبًا {name}،",
    reference: "رقمك المرجعي هو {reference}. اذكره إذا احتجت إلى المتابعة.",
    ignore: "إذا لم تُرسل هذا الطلب، فيمكنك تجاهل هذه الرسالة.",
};

/// Draft: Chinese (Simplified).
const ZH: Text = Text {
    lang: "zh-Hans",
    dir: "ltr",
    referral: [
        "感谢您推荐 {product}",
        "感谢您的引荐",
        "我们的团队将进行审核，并联系您引荐的企业。交易完成后您即可获得奖励。如需与 {product} 团队跟进，请提供您的参考编号。",
    ],
    waitlist: [
        "您已加入 {product} 候补名单",
        "您已加入 {product} 候补名单",
        "{product} 向首批客户开放时，我们会第一时间通知您。目前您无需进行任何其他操作。",
    ],
    early_access: [
        "您的 {product} 抢先体验申请",
        "我们已收到您的抢先体验申请",
        "我们的团队会分批审核抢先体验申请，并就后续步骤与您联系。",
    ],
    demo: [
        "您的 {product} 演示申请",
        "感谢您对 {product} 的关注",
        "我们的团队成员将与您联系，在您方便的时间安排演示。",
    ],
    partnership: [
        "您与 FigBud Global 的合作咨询",
        "感谢您就合作事宜与我们联系",
        "我们团队中的相关负责人将审核您的咨询并回复您。",
    ],
    contact_figbud: [
        "我们已收到您的留言",
        "感谢您与我们联系",
        "我们的团队成员将查看您的留言并回复您。",
    ],
    contact_product: [
        "我们已收到您关于 {product} 的咨询",
        "感谢您与我们联系",
        "{product} 团队成员将查看您的留言并回复您。",
    ],
    greeting: "{name}，您好：",
    reference: "您的参考编号是 {reference}。如需跟进，请提供此编号。",
    ignore: "如果您没有提交此申请，请忽略此邮件。",
};

/// The wording for a language code ("en", "sw", "fr", "ar", "zh"); English otherwise.
pub fn text(code: &str) -> &'static Text {
    match code {
        "sw" => &SW,
        "fr" => &FR,
        "ar" => &AR,
        "zh" => &ZH,
        _ => &EN,
    }
}

impl Text {
    /// (subject, headline, next steps) for an enquiry, with the product's name in place.
    pub fn for_enquiry(&self, kind: EnquiryKind, product: Product) -> [String; 3] {
        let parts = match (kind, product) {
            (EnquiryKind::Referral, _) => &self.referral,
            (EnquiryKind::Waitlist, _) => &self.waitlist,
            (EnquiryKind::EarlyAccess, _) => &self.early_access,
            (EnquiryKind::DemoRequest, _) => &self.demo,
            (EnquiryKind::Partnership, _) => &self.partnership,
            (EnquiryKind::Sales | EnquiryKind::Contact, Product::Figbud) => &self.contact_figbud,
            (EnquiryKind::Sales | EnquiryKind::Contact, _) => &self.contact_product,
        };
        parts.map(|p| p.replace("{product}", product.display_name()))
    }
}
