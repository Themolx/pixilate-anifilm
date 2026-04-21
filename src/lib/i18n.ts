type Lang = 'cs' | 'en'

const lang: Lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('cs')
  ? 'cs'
  : 'en'

const dict = {
  en: {
    // Onboarding
    tagline: 'Exquisite corpse, stop-motion.',
    festival: 'Anifilm 2026.',
    intro: 'One shared animation for the whole festival. Add a frame, watch it live as others add theirs.',
    start: 'Start',
    nameQuestion: 'What should we call you?',
    nameHint: 'Shown next to frames you capture. Optional.',
    namePlaceholder: 'Your name',
    continue: 'Continue',
    liveAnimation: 'Live animation',
    latestAnimation: 'The latest animation',
    latestAnimationSub: 'Watch what everyone made so far',
    loadingPreview: 'Loading preview…',
    previewFailed: 'Could not load preview:',
    readyNext: 'Ready for next step…',
    cameraAccess: 'Camera access required',
    cameraAccessBody: 'Pixilate needs your camera to capture frames. Photos go into the shared festival timeline.',
    cameraDenied: "Couldn't access the camera.",
    cameraHint: 'iOS: Settings → Safari → Camera → Allow. Desktop: click the camera icon in the address bar and allow.',
    tryAgain: 'Try again',
    allowCamera: 'Allow camera',
    // Camera statuses
    capturing: 'Capturing…',
    checking: 'Checking…',
    saved: 'Saved',
    cameraNotReady: 'Camera not ready',
    slowDown: 'Slow down! (12 frames/min max)',
    frameCapReached: 'Festival frame cap reached',
    dailyTopicLabel: "Today's topic",
    dailyTopicIntro: "Today's topic",
    dailyTopicHint: 'Try to work this into your next frame.',
    dailyTopicGotIt: 'Got it',
  },
  cs: {
    tagline: 'Kolektivní animace po políčkách.',
    festival: 'Anifilm 2026.',
    intro: 'Jedna sdílená animace pro celý festival. Přidej políčko a sleduj, jak ostatní přidávají svoje.',
    start: 'Začít',
    nameQuestion: 'Jak ti máme říkat?',
    nameHint: 'Zobrazí se u políček, která nafotíš. Nepovinné.',
    namePlaceholder: 'Tvoje jméno',
    continue: 'Pokračovat',
    liveAnimation: 'Živá animace',
    latestAnimation: 'Poslední animace',
    latestAnimationSub: 'Podívej se, co už ostatní nafotili',
    loadingPreview: 'Načítám ukázku…',
    previewFailed: 'Nepodařilo se načíst ukázku:',
    readyNext: 'Připraveno…',
    cameraAccess: 'Potřebujeme přístup ke kameře',
    cameraAccessBody: 'Pixilate potřebuje tvoji kameru k focení políček. Fotky jdou do sdílené festivalové animace.',
    cameraDenied: 'Nepodařilo se otevřít kameru.',
    cameraHint: 'iOS: Nastavení → Safari → Kamera → Povolit. Desktop: klikni na ikonu kamery v adresním řádku a povol přístup.',
    tryAgain: 'Zkusit znovu',
    allowCamera: 'Povolit kameru',
    capturing: 'Focení…',
    checking: 'Kontroluji…',
    saved: 'Uloženo',
    cameraNotReady: 'Kamera není připravená',
    slowDown: 'Pomaleji! (max 12 políček/min)',
    frameCapReached: 'Limit festivalu vyčerpán',
    dailyTopicLabel: 'Dnešní téma',
    dailyTopicIntro: 'Dnešní téma',
    dailyTopicHint: 'Zkus to dostat do dalšího políčka.',
    dailyTopicGotIt: 'Beru',
  },
} as const

export type TKey = keyof typeof dict['en']
export function t(key: TKey): string {
  return dict[lang][key]
}
export function getLang(): Lang {
  return lang
}
