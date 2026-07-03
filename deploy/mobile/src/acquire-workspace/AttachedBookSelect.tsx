import { ChevronDown, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { CustomIcon } from '../icons/CustomIcon'
import type { CgsAttachedBook } from './acquireTypes'

export type AttachedBookSelectMode = 'single' | 'multi'

export type AttachedBookSelectProps = {
  books: CgsAttachedBook[]
  mode: AttachedBookSelectMode
  selectedIds: string[]
  onSelect: (book: CgsAttachedBook) => void
  onRemove?: (attachBookId: string) => void
  ariaLabel: string
  className?: string
  showSelectedOptionStyle?: boolean
  triggerClassName?: string
}

function attachedBookKey(book: CgsAttachedBook): string {
  return book.attach_book_id || book.id
}

function attachedBookTitle(book: CgsAttachedBook): string {
  return book.book || book.title || '附加书籍'
}

function selectedLabel(books: CgsAttachedBook[], selectedIds: Set<string>, mode: AttachedBookSelectMode): string {
  const selectedBooks = books.filter((book) => selectedIds.has(book.attach_book_id) || selectedIds.has(book.id))
  if (!selectedBooks.length) return mode === 'multi' ? '未选择附加书籍' : '选择附加书籍'
  if (mode === 'single') return attachedBookTitle(selectedBooks[0])
  return `附着 Book: ${selectedBooks.length}`
}

function renderTriggerText(label: string, selectedCount: number, mode: AttachedBookSelectMode) {
  if (mode !== 'multi' || selectedCount <= 0) return label
  return (
    <>
      附着 Book: <span className="attached-book-select-count-inline">{selectedCount}</span>
    </>
  )
}

export function AttachedBookSelect({ books, mode, selectedIds, onSelect, onRemove, ariaLabel, className = '', showSelectedOptionStyle = true, triggerClassName = '' }: AttachedBookSelectProps) {
  const [open, setOpen] = useState(false)
  const listboxId = useId()
  const selectedIdSet = useMemo(() => new Set(selectedIds.filter(Boolean)), [selectedIds])
  const selectedBooks = books.filter((book) => selectedIdSet.has(book.attach_book_id) || selectedIdSet.has(book.id))
  const label = selectedLabel(books, selectedIdSet, mode)
  const selectedCount = selectedBooks.length
  const triggerSource = mode === 'single' && selectedCount === 1 ? selectedBooks[0]?.source : null
  const selectKind = mode === 'multi' ? 'multi' : 'single'

  const hasBooks = books.length > 0
  if (!hasBooks) return null

  return (
    <div className={`attached-book-select attached-book-select-${selectKind} ${className}`.trim()}>
      <button
        type="button"
        className={`attached-book-select-trigger ${triggerClassName}`.trim()}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
      >
        <CustomIcon name="detailSearch" size={15} />
        <span className="attached-book-select-trigger-text">{renderTriggerText(label, selectedCount, mode)}</span>
        {triggerSource && <span className="cgs-search-source-badge attached-book-select-trigger-badge" aria-label={`源站：${triggerSource}`}>{triggerSource}</span>}
        <ChevronDown className={`attached-book-select-chevron${open ? ' is-open' : ''}`} size={14} aria-hidden />
      </button>

      {open && (
        <div
          id={listboxId}
          className="attached-book-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable={mode === 'multi' ? true : undefined}
        >
          {books.map((book) => {
            const key = attachedBookKey(book)
            const title = attachedBookTitle(book)
            const selected = selectedIdSet.has(book.attach_book_id) || selectedIdSet.has(book.id)
            return (
              <div
                key={key}
                className={['rvui-dropdown-option', 'attached-book-select-option', showSelectedOptionStyle && selected ? 'is-selected' : ''].filter(Boolean).join(' ')}
                role="option"
                aria-selected={selected}
              >
                <button
                  type="button"
                  className="attached-book-select-option-main"
                  onClick={() => {
                    onSelect(book)
                    if (mode === 'single') setOpen(false)
                  }}
                  aria-label={title}
                >
                  <span className="cgs-search-source-name">{title}</span>
                  {book.source && <span className="cgs-search-source-badge" aria-label={`源站：${book.source}`}>{book.source}</span>}
                </button>
                {mode === 'multi' && onRemove && book.attach_book_id && (
                  <button
                    type="button"
                    className="icon-only rv-agent-attached-book-remove attached-book-select-remove"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemove(book.attach_book_id)
                    }}
                    aria-label={`移除附加书籍：${title}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
