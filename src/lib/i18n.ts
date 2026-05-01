// ===========================================================================
// All user-facing text for Pixilate.
// Edit the strings in the `en` and `cs` objects below. Everything the user
// sees comes from this file. Device language (navigator.language) picks which
// dictionary is used at runtime: anything starting with "cs" => Czech, else EN.
// ===========================================================================

type Lang = 'cs' | 'en'

const lang: Lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('cs')
    ? 'cs'
    : 'en'

const dict = {
    en: {
        // -------- Onboarding: start screen ----------
        tagline: 'PIXILATION! pixilation? PIXILATION!!',
        festival: 'Anifilm 2026.',
        intro: 'One **shared animation** for the whole festival. **Add a frame** and watch it live as others add theirs.',
        limitsHint: ' ',
        start: 'Start',

        // -------- Onboarding: name screen ----------
        nameQuestion: 'What should we call you?',
        nameHint: 'Shown **next to frames** you capture.',
        nameHintOptional: 'Optional.',
        namePlaceholder: 'Your name',
        continue: 'Continue',

        // -------- Onboarding: latest-animation preview ----------
        latestAnimation: 'The latest animation',
        latestAnimationSub: 'Watch what **everyone made** so far. Final screening location announced in the festival program.',
        loadingPreview: 'Loading preview...',
        previewTapContinue: 'Tap to continue',
        previewAddMore: 'You can **add more frames!**',
        previewIntroTitle: 'The latest animation',
        previewIntroSub: "Here are the **last two seconds** others made. You'll add the next one! :D",

        // -------- Onboarding: camera permission (last screen) ----------
        cameraAccess: 'Camera access required :0',
        cameraAccessBody: 'Pixilate needs your camera to capture frames. Photos go into the shared festival timeline.',
        publicNotice: '**Photos are public**, shown with your name, and stay they in the festival timeline.',
        cameraDenied: "Couldn't access the camera.",
        cameraHint: 'iOS: Settings > Safari > Camera > Allow. Desktop: click the camera icon in the address bar and allow.',
        tryAgain: 'Try again',
        allowCamera: 'Allow camera',

        // -------- Camera view: status messages (shown only on errors) ----------
        capturing: 'Capturing...',
        checking: 'Checking...',
        preparingFilter: 'Preparing safety filter...',
        saved: 'Saved',
        cameraNotReady: 'Camera not ready',
        slowDown: 'Slow down! (40 frames/min max)',
        frameCapReached: 'Festival frame cap reached, we are now broke. ://',
        cameraErrorPrefix: 'Camera error:',

        // -------- Daily topic modal ----------
        dailyTopicLabel: "Today's topic",
        dailyTopicIntro: "Today's topic",
        dailyTopicHint: 'Optional. Try to work this into your next frame if you like.',
        dailyTopicGotIt: 'Got it',

        // -------- Landscape lock (shown when phone is rotated) ----------
        landscapeTitle: 'Please rotate to portrait',
        landscapeBody: 'Pixilate is designed for vertical use. Rotate your device to continue.',
        landscapeLockTip: 'Tip: **lock rotation** in your phone settings so this does not happen mid-capture.',

        // -------- Instagram follow ----------
        followUs: 'Follow',
        instagramHandle: '@anifilmpixilace',

        // -------- Camera bottom-bar labels ----------
        labelLast2s: 'Last 2s',
        labelCamera: 'Camera',
        lastFrameBy: 'last frame by',

        // -------- Info modal (top-right (i) button) ----------
        infoTitle: 'How it works',
        infoBody1: 'Pixilate is **one shared stop-motion animation** for the whole festival.',
        infoBody2: 'Press a button to take a frame. The **onion skin overlay** shows the previous frame, use it to match objects or animate movements.',
        infoBody3: 'Tap **Last 2s** in the corner to rewind. See what others did and try to expand it!',
        infoFooter: 'Made for Anifilm 2026.',
        infoFramesSoFar: 'frames so far',
        infoClose: 'Got it',
    },

    cs: {
        // -------- Onboarding: úvodní obrazovka ----------
        tagline: 'PIXILACE! PIXILACE?! PIXILACE!!',
        festival: 'Anifilm 2026.',
        intro: 'Jedna **sdílená animace** pro celý festival. **Vyfoť frame a nebo pět** a sleduj, jak ostatní přidávají ty svoje!!',
        limitsHint: ' ',
        start: 'ANIFIIILM',

        // -------- Onboarding: jméno ----------
        nameQuestion: 'animátorksé jméno?',
        nameHint: 'abychom pak věděli co jste nafotili',
        nameHintOptional: 'Nepotřebujem to.',
        namePlaceholder: 'jméno',
        continue: 'ANIFIIIIIILM',

        // -------- Onboarding: ukázka poslední animace ----------
        latestAnimation: 'Poslední 2s',
        latestAnimationSub: 'Koukni na poslední dvě sekundy animace, zkus na to třeba navázat!',
        loadingPreview: 'Načítám...',
        previewTapContinue: 'Klikni pro pokračování',
        previewAddMore: 'Můžeš **přidat další framy!! Klidně milion:)**',
        previewIntroTitle: 'Poslední animace',
        previewIntroSub: 'Teď uvidíš **poslední dvě sekundy** toho, co ostatní naanimovali!!.',

        // -------- Onboarding: přístup ke kameře (poslední obrazovka) ----------
        cameraAccess: 'Potřebujeme přístup ke kameře',
        cameraAccessBody: 'Fotky jdou do sdílené festivalové animace. Ok?',
        publicNotice: '**Fotky jsou veřejné**, zobrazí se se tvým jménem a zůstávají ve festivalové animaci.',
        cameraDenied: 'Nepodařilo se otevřít kameru.',
        cameraHint: ' ',
        tryAgain: 'Zkusit znovu',
        allowCamera: 'Povolit kameru',

        // -------- Kamera: statusové zprávy (jen při chybě) ----------
        capturing: 'Focení...',
        checking: 'Kontroluji...',
        preparingFilter: 'Připravuji bezpečnostní filtr...',
        saved: 'Uloženo',
        cameraNotReady: 'Kamera není připravená',
        slowDown: 'Pomaleji! :/ (max 40 políček/min)',
        frameCapReached: 'Limit festivalu vyčerpán, teď jsme broke :DD',
        cameraErrorPrefix: 'Chyba kamery:',

        // -------- Denní téma ----------
        dailyTopicLabel: 'Dnešní téma',
        dailyTopicIntro: 'Dnešní téma',
        dailyTopicHint: 'jdi a animuj! ^^',
        dailyTopicGotIt: 'Juchů!',

        // -------- Zámek na výšku (když je mobil natočen na šířku) ----------
        landscapeTitle: 'Otoč telefon na výšku',
        landscapeBody: 'Pixilate je dělaný na výšku. Otoč telefon a pokračuj.',
        landscapeLockTip: 'Tip: v nastavení telefonu si **zamkni rotaci obrazovky**, ať se ti to nestane uprostřed focení.',

        // -------- Instagram ----------
        followUs: 'Sleduj',
        instagramHandle: '@anifilmpixilace',

        // -------- Popisky tlačítek na hlavní obrazovce ----------
        labelLast2s: 'Poslední 2s',
        labelCamera: 'Kamera',
        lastFrameBy: 'poslední frame od',

        // -------- Info modal (tlačítko (i) v pravém horním rohu) ----------
        infoTitle: 'Jak to funguje',
        infoBody1: 'Pixilate je **jedna sdílená stop-motion animace** pro celý festival.',
        infoBody2: 'Zkus přidat vlastní framy animace, navaž na kamrády, a nebo začni uplně novou.',
        infoBody3: 'V rohu klepni na **Poslední 2s** pro přetočení dozadu. Všechno, co kdo nafotí, jde do festivalové animace.  Celou animaci si pak spolu pustíme!',
        infoFooter: 'Vyrobeno pro Anifilm 2026.',
        infoFramesSoFar: 'políček zatím',
        infoClose: 'Beru',
    },
} as const

export type TKey = keyof typeof dict['en']
export function t(key: TKey): string {
    return dict[lang][key]
}
export function getLang(): Lang {
    return lang
}
