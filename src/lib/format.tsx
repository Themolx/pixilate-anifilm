import { Fragment, type ReactNode } from 'react'

// Renders a string with **word** turned into <strong>word</strong>.
// Used in i18n bodies so translators can emphasise key phrases inline.
export function rt(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}
