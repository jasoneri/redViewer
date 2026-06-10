import { createPortal } from 'react-dom'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ForwardedRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type RefObject,
  type SelectHTMLAttributes,
} from 'react'

export type NativeDropdownOption = {
  value: string
  label: string
  disabled?: boolean
}

type PopupMetrics = {
  left: number
  top: number
  width: number
  maxHeight: number
}

type MenuLayerProps = {
  activeIndex: number
  anchorRef: RefObject<HTMLElement | null>
  className?: string
  emptyLabel?: string
  id: string
  menuRef: RefObject<HTMLDivElement | null>
  onSelect: (value: string) => void
  open: boolean
  options: NativeDropdownOption[]
  value?: string
}

function assignForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  if (ref) (ref as { current: T | null }).current = value
}

function measurePopup(anchor: HTMLElement): PopupMetrics {
  const margin = 8
  const gap = 4
  const rect = anchor.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const preferredWidth = Math.min(260, viewportWidth - margin * 2)
  const width = Math.max(Math.ceil(rect.width), preferredWidth)
  const left = Math.min(Math.max(margin, rect.left), viewportWidth - margin - width)
  const belowSpace = viewportHeight - rect.bottom - gap - margin
  const aboveSpace = rect.top - gap - margin
  const openAbove = belowSpace < 120 && aboveSpace > belowSpace
  const maxHeight = Math.max(96, Math.floor(openAbove ? aboveSpace : belowSpace))

  return {
    left,
    top: openAbove ? Math.max(margin, Math.round(rect.top - gap - maxHeight)) : Math.round(rect.bottom + gap),
    width,
    maxHeight,
  }
}

function usePopupMetrics(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [metrics, setMetrics] = useState<PopupMetrics | null>(null)

  const updateMetrics = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    setMetrics(measurePopup(anchor))
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) {
      setMetrics(null)
      return
    }
    updateMetrics()
  }, [open, updateMetrics])

  useEffect(() => {
    if (!open) return undefined
    window.addEventListener('resize', updateMetrics)
    window.addEventListener('scroll', updateMetrics, true)
    return () => {
      window.removeEventListener('resize', updateMetrics)
      window.removeEventListener('scroll', updateMetrics, true)
    }
  }, [open, updateMetrics])

  return metrics
}

function MenuLayer({
  activeIndex,
  anchorRef,
  className = '',
  emptyLabel = '暂无选项',
  id,
  menuRef,
  onSelect,
  open,
  options,
  value,
}: MenuLayerProps) {
  const metrics = usePopupMetrics(open, anchorRef)
  if (!open || !metrics || typeof document === 'undefined') return null

  const style: CSSProperties = {
    left: metrics.left,
    top: metrics.top,
    width: metrics.width,
    maxHeight: metrics.maxHeight,
  }

  return createPortal(
    <div
      id={id}
      ref={menuRef}
      className={`rvui-dropdown-menu ${className}`.trim()}
      role="listbox"
      style={style}
      onPointerDown={(event) => event.preventDefault()}
    >
      {options.length ? options.map((option, index) => (
        <div
          key={`${option.value}-${option.label}`}
          className={[
            'rvui-dropdown-option',
            option.value === value ? 'is-selected' : '',
            index === activeIndex ? 'is-active' : '',
            option.disabled ? 'is-disabled' : '',
          ].filter(Boolean).join(' ')}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          title={option.label}
          onPointerDown={(event) => {
            event.preventDefault()
            if (!option.disabled) onSelect(option.value)
          }}
        >
          {option.label}
        </div>
      )) : <div className="rvui-dropdown-empty">{emptyLabel}</div>}
    </div>,
    document.body,
  )
}

function nextEnabledIndex(options: NativeDropdownOption[], start: number, direction: 1 | -1) {
  if (!options.length) return -1
  let index = start
  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index]?.disabled) return index
  }
  return -1
}

type NativeSelectMenuProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange'> & {
  menuClassName?: string
  onValueChange: (value: string) => void
  options: NativeDropdownOption[]
  value: string
}

export function NativeSelectMenu({
  disabled,
  menuClassName,
  onKeyDown,
  onValueChange,
  options,
  value,
  ...selectProps
}: NativeSelectMenuProps) {
  const menuId = useId()
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)

  const closeMenu = useCallback(() => setOpen(false), [])
  const openMenu = useCallback(() => {
    if (disabled || !options.length) return
    setActiveIndex(selectedIndex)
    setOpen(true)
  }, [disabled, options.length, selectedIndex])

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (selectRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [closeMenu, open])

  const selectValue = useCallback((nextValue: string) => {
    onValueChange(nextValue)
    closeMenu()
    selectRef.current?.focus()
  }, [closeMenu, onValueChange])

  const handleKeyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return

    if (event.key === 'Escape') {
      closeMenu()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openMenu()
      else setActiveIndex((current) => nextEnabledIndex(options, current, event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) openMenu()
      else {
        const option = options[activeIndex]
        if (option && !option.disabled) selectValue(option.value)
      }
    }
  }

  return (
    <>
      <select
        {...selectProps}
        ref={selectRef}
        value={value}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onChange={(event) => onValueChange(event.target.value)}
        onClick={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          if (disabled) return
          // RVUI003: keep the native trigger box; replace only the browser popup.
          event.preventDefault()
          selectRef.current?.focus()
          if (open) closeMenu()
          else openMenu()
        }}
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <MenuLayer
        id={menuId}
        open={open}
        anchorRef={selectRef}
        menuRef={menuRef}
        options={options}
        value={value}
        activeIndex={activeIndex}
        className={menuClassName}
        onSelect={selectValue}
      />
    </>
  )
}

type InputHistoryMenuProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'list' | 'onChange' | 'value'> & {
  menuClassName?: string
  onValueChange: (value: string) => void
  suggestions: string[]
  value: string
}

type InputPointerEvent = Parameters<NonNullable<InputHTMLAttributes<HTMLInputElement>['onPointerDown']>>[0]

export const InputHistoryMenu = forwardRef<HTMLInputElement, InputHistoryMenuProps>(function InputHistoryMenu({
  menuClassName,
  onFocus,
  onKeyDown,
  onPointerDown,
  onValueChange,
  suggestions,
  value,
  ...inputProps
}, forwardedRef) {
  const menuId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const normalizedValue = value.trim().toLowerCase()
  const options = suggestions
    .filter((suggestion) => !normalizedValue || suggestion.toLowerCase().includes(normalizedValue))
    .map((suggestion) => ({ value: suggestion, label: suggestion }))

  const closeMenu = useCallback(() => setOpen(false), [])
  const openMenu = useCallback(() => {
    if (!options.length) return
    setActiveIndex(0)
    setOpen(true)
  }, [options.length])

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (inputRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [closeMenu, open])

  const selectValue = useCallback((nextValue: string) => {
    onValueChange(nextValue)
    closeMenu()
    inputRef.current?.focus()
  }, [closeMenu, onValueChange])

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    onFocus?.(event)
    openMenu()
  }

  const handlePointerDown = (event: InputPointerEvent) => {
    onPointerDown?.(event)
    if (!event.defaultPrevented) openMenu()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      closeMenu()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openMenu()
      else setActiveIndex((current) => nextEnabledIndex(options, current, event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    onKeyDown?.(event)
    if (event.key === 'Enter') closeMenu()
  }

  return (
    <>
      <input
        {...inputProps}
        ref={(node) => {
          inputRef.current = node
          assignForwardedRef(forwardedRef, node)
        }}
        value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onChange={(event) => {
          onValueChange(event.target.value)
          openMenu()
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
      />
      <MenuLayer
        id={menuId}
        open={open}
        anchorRef={inputRef}
        menuRef={menuRef}
        options={options}
        value={value}
        activeIndex={activeIndex}
        className={menuClassName}
        onSelect={selectValue}
      />
    </>
  )
})
