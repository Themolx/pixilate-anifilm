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
    tagline: 'Exquisite corpse, stop-motion.',
    festival: 'Anifilm 2026.',
    intro: 'One shared animation for the whole festival. Add a frame, watch it live as others add theirs. Tip: move something a little between frames. Your hand, an object, yourself.',
    limitsHint: ' ',
    start: 'Start',

    // -------- Onboarding: name screen ----------
    nameQuestion: 'What should we call you?',
    nameHint: 'Shown next to frames you capture.',
    nameHintOptional: 'Optional.',
    namePlaceholder: 'Your name',
    continue: 'Continue',

    // -------- Onboarding: latest-animation preview ----------
    latestAnimation: 'The latest animation',
    latestAnimationSub: 'Watch what everyone made so far. Final screening location announced in the festival program.',
    loadingPreview: 'Loading preview...',

    // -------- Onboarding: camera permission (last screen) ----------
    cameraAccess: 'Camera access required',
    cameraAccessBody: 'Pixilate needs your camera to capture frames. Photos go into the shared festival timeline.',
    publicNotice: 'Photos are public, shown with your name, and stay in the festival timeline.',
    cameraDenied: "Couldn't access the camera.",
    cameraHint: 'iOS: Settings > Safari > Camera > Allow. Desktop: click the camera icon in the address bar and allow.',
    tryAgain: 'Try again',
    allowCamera: 'Allow camera',

    // -------- Camera view: status messages (shown only on errors) ----------
    capturing: 'Capturing...',
    checking: 'Checking...',
    saved: 'Saved',
    cameraNotReady: 'Camera not ready',
    slowDown: 'Slow down! (40 frames/min max)',
    frameCapReached: 'Festival frame cap reached',
    cameraErrorPrefix: 'Camera error:',

    // -------- Daily topic modal ----------
    dailyTopicLabel: "Today's topic",
    dailyTopicIntro: "Today's topic",
    dailyTopicHint: 'Optional. Try to work this into your next frame if you like.',
    dailyTopicGotIt: 'Got it',

    // -------- Landscape lock (shown when phone is rotated) ----------
    landscapeTitle: 'Please rotate to portrait',
    landscapeBody: 'Pixilate is designed for vertical use. Rotate your device to continue.',
  },

  cs: {
    // -------- Onboarding: úvodní obrazovka ----------
    tagline: 'PIXILACE! PIXILACE?! PIXILACE!!',
    festival: 'Anifilm 2026.',
    intro: 'Jedna sdílená animace pro celý festival. Vyfoť frame a sleduj, jak ostatní přidávají svoje.',
    limitsHint: ' ',
    start: 'Začít',

    // -------- Onboarding: jméno ----------
    nameQuestion: 'Jak ti máme říkat?',
    nameHint: 'Zobrazí se u políček, která nafotíš.',
    nameHintOptional: 'Nepovinné.',
    namePlaceholder: 'jméno',
    continue: 'Pokračovat',

    // -------- Onboarding: ukázka poslední animace ----------
    latestAnimation: 'Poslední 2s',
    latestAnimationSub: 'Podívej se, co už ostatní nafotili. Finální projekce bude tady! "papir"',
    loadingPreview: 'Načítám ukázku...',

    // -------- Onboarding: přístup ke kameře (poslední obrazovka) ----------
    cameraAccess: 'Potřebujeme přístup ke kameře',
    cameraAccessBody: 'Fotky jdou do sdílené festivalové animace.',
    publicNotice: 'Fotky jsou veřejné, zobrazí se se tvým jménem a zůstávají ve festivalové animaci.',
    cameraDenied: 'Nepodařilo se otevřít kameru.',
    cameraHint: ' ',
    tryAgain: 'Zkusit znovu',
    allowCamera: 'Povolit kameru',

    // -------- Kamera: statusové zprávy (jen při chybě) ----------
    capturing: 'Focení...',
    checking: 'Kontroluji...',
    saved: 'Uloženo',
    cameraNotReady: 'Kamera není připravená',
    slowDown: 'Pomaleji! :( (max 40 políček/min)',
    frameCapReached: 'Limit festivalu vyčerpán',
    cameraErrorPrefix: 'Chyba kamery:',

    // -------- Denní téma ----------
    dailyTopicLabel: 'Dnešní téma',
    dailyTopicIntro: 'Dnešní téma',
    dailyTopicHint: 'Nepovinné.',
    dailyTopicGotIt: 'Juchů',

    // -------- Zámek na výšku (když je mobil natočen na šířku) ----------
    landscapeTitle: 'Otoč telefon na výšku',
    landscapeBody: 'Pixilate je dělaný na výšku. Otoč telefon a pokračuj.',
  },
} as const

export type TKey = keyof typeof dict['en']
export function t(key: TKey): string {
  return dict[lang][key]
}
export function getLang(): Lang {
  return lang
}
