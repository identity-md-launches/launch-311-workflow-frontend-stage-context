import type { ReactNode } from 'react'

export type NoticeKind = 'info' | 'warning' | 'error' | 'success'

const GLYPH: Record<NoticeKind, string> = { info: 'i', warning: '!', error: '×', success: '✓' }
const WORD: Record<NoticeKind, string> = { info: 'Note', warning: 'Warning', error: 'Error', success: 'Done' }

/** Inline message with a text cue in addition to color. Pass `role` for live announcements. */
export function Notice({ kind, children, role }: { kind: NoticeKind; children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className={`notice notice-${kind}`} role={role}>
      <span className="notice-glyph" aria-hidden="true">
        {GLYPH[kind]}
      </span>
      <span className="sr-only">{WORD[kind]}: </span>
      <div className="notice-body">{children}</div>
    </div>
  )
}
