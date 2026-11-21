import { ImagePlus } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { formatBytes } from '@/lib/format'
import { DEFAULT_ACCEPT, DEFAULT_MAX_BYTES, validateImageFile } from '@/lib/upload'
import { cn } from '@/lib/utils'

interface UploadDropzoneProps {
  onFile: (file: File) => void
  accept?: readonly string[]
  maxBytes?: number
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
  /** External error (e.g. a 422 from the API), shown under the zone. */
  error?: string | null
  /** Listen for images pasted anywhere on the page while mounted. */
  listenToPaste?: boolean
  className?: string
}

export function UploadDropzone({
  onFile,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  disabled = false,
  loading = false,
  loadingLabel = 'Identifying…',
  error,
  listenToPaste = false,
  className,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const [dragActive, setDragActive] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inactive = disabled || loading

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      const file = files?.[0]
      if (!file || inactive) return
      const problem = validateImageFile(file, accept, maxBytes)
      setLocalError(problem)
      if (!problem) onFile(file)
    },
    [accept, maxBytes, inactive, onFile],
  )

  useEffect(() => {
    if (!listenToPaste) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) {
        e.preventDefault()
        handleFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [listenToPaste, handleFiles])

  const open = () => !inactive && inputRef.current?.click()
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }
  const onDrag = (e: DragEvent, active: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    if (!inactive) setDragActive(active)
  }
  const onDrop = (e: DragEvent) => {
    onDrag(e, false)
    handleFiles(e.dataTransfer.files)
  }

  const message = error ?? localError
  const types = accept.map((t) => t.replace('image/', '').toUpperCase()).join(', ')

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={inactive ? -1 : 0}
        aria-disabled={inactive}
        aria-busy={loading}
        aria-describedby={`${id}-hint${message ? ` ${id}-error` : ''}`}
        onClick={open}
        onKeyDown={onKeyDown}
        onDragEnter={(e) => onDrag(e, true)}
        onDragOver={(e) => onDrag(e, true)}
        onDragLeave={(e) => onDrag(e, false)}
        onDrop={onDrop}
        className={cn(
          'group relative flex min-h-64 flex-col items-center justify-center rounded border border-dashed px-10 py-12 text-center transition-colors duration-200',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          inactive ? 'cursor-not-allowed' : 'cursor-pointer',
          dragActive
            ? 'border-accent bg-accent-subtle'
            : message
              ? 'border-danger/60 bg-surface'
              : 'border-border-strong bg-surface hover:border-fg-muted hover:bg-surface-raised',
          disabled && 'opacity-55',
        )}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <Spinner label={loadingLabel} />
            <p className="text-small text-fg-secondary">{loadingLabel}</p>
          </div>
        ) : (
          <>
            <ImagePlus
              className={cn('mb-5 size-8 text-fg-muted transition-colors', dragActive && 'text-accent-text')}
              strokeWidth={1}
              aria-hidden="true"
            />
            <p className="font-serif text-h4 text-fg">
              {dragActive ? 'Release to upload' : 'Drop a photograph here'}
            </p>
            <p id={`${id}-hint`} className="mt-2 text-small text-fg-muted">
              or{' '}
              <span className="text-fg underline decoration-border-strong underline-offset-4 group-hover:decoration-accent">
                browse files
              </span>
              {listenToPaste && ' · paste from clipboard'}
            </p>
            <p className="type-mono mt-6">
              {types} · up to {formatBytes(maxBytes)}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a photograph to upload"
          disabled={inactive}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {message && (
        <p id={`${id}-error`} role="alert" className="mt-3 text-small text-danger">
          {message}
        </p>
      )}
    </div>
  )
}
