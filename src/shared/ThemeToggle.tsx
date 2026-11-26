import { Icon } from '../editor/components/Icon'

export type AppTheme = 'light' | 'dark'

type ThemeToggleProps = {
  theme: AppTheme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const targetTheme = theme === 'dark' ? 'light' : 'dark'
  const label = targetTheme === 'dark' ? 'Modo oscuro' : 'Modo claro'

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Cambiar a ${label.toLowerCase()}`}
      title={`Cambiar a ${label.toLowerCase()}`}
      onClick={onToggle}
    >
      <Icon name={targetTheme === 'dark' ? 'moon' : 'sun'} size={17} />
      <span>{label}</span>
    </button>
  )
}
