/* Shared building blocks : every screen uses these, so the design stays the same everywhere (see DESIGN.md) */
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; size?: 'sm' | 'md' }

export function PrimaryButton({ icon, size = 'md', className = '', children, ...p }: Btn) {
  return (
    <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-sm bg-accent px-3 text-body font-medium text-accent-text hover:bg-accent-hover disabled:bg-surface-2 disabled:text-text-3 ${size === 'sm' ? 'h-6' : 'h-7'} ${className}`}>
      {icon}{children}
    </button>
  )
}

export function SecondaryButton({ icon, size = 'md', className = '', children, ...p }: Btn) {
  return (
    <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-sm border border-line-strong px-3 text-body text-text hover:bg-surface-2 disabled:text-text-3 ${size === 'sm' ? 'h-6' : 'h-7'} ${className}`}>
      {icon}{children}
    </button>
  )
}

export function IconButton({ className = '', children, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} className={`nodrag inline-grid h-6 w-6 place-items-center rounded-sm text-text-2 hover:bg-surface-2 hover:text-text disabled:text-text-3 ${className}`}>
      {children}
    </button>
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`mira-label ${className}`}>{children}</span>
}

export function Row({ active, icon, hint, children, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: ReactNode; hint?: ReactNode }) {
  // sidebar row : white text, roomy, the active one sits on a soft fill
  return (
    <button {...p} className={`flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-body text-text ${active ? 'bg-surface-2' : 'hover:bg-surface-1'} ${className}`}>
      {icon && <span className={`shrink-0 ${active ? 'text-text' : 'text-text-2'}`}>{icon}</span>}
      <span className="truncate">{children}</span>
      {/* a count (open tasks, pull requests) in white ; a shortcut stays grey */}
      {hint && <span className={`ml-auto shrink-0 text-meta tnum ${typeof hint === 'number' ? 'text-text' : 'text-text-3'}`}>{hint}</span>}
    </button>
  )
}

export const ICON = 14
