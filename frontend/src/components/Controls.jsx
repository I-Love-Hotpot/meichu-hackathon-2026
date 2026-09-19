import { useEffect, useRef } from 'react'

export function ListRow({ label, selected = false, state = 'default', onClick, trailing = '›' }) {
  return (
    <button
      type="button"
      className={`list-row list-row--${state}${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      tabIndex={-1}
      aria-current={selected ? 'true' : undefined}
    >
      <span>{label}</span>
      <span aria-hidden="true">{trailing}</span>
    </button>
  )
}

export function FocusableField({
  id,
  label,
  value,
  placeholder,
  selected = false,
  editing = false,
  multiline = false,
  required = false,
  disabled = false,
  maxLength,
  rows,
  focusId,
  className = '',
  onSelect,
  onEditingChange,
  onChange,
}) {
  const fieldRef = useRef(null)
  const Field = multiline ? 'textarea' : 'input'

  useEffect(() => {
    if (!editing) return
    const frame = window.requestAnimationFrame(() => {
      const field = fieldRef.current
      field?.focus()
      if (field && typeof field.setSelectionRange === 'function') {
        const end = field.value.length
        field.setSelectionRange(end, end)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editing])

  const enterInputMode = () => {
    onSelect()
    onEditingChange(true)
  }

  const leaveInputMode = () => {
    fieldRef.current?.blur()
    onEditingChange(false)
  }

  const syncValue = (event) => {
    onChange?.(event)
  }

  return (
    <div
      className={`focusable-field${className ? ` ${className}` : ''}${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
      aria-current={selected ? 'true' : undefined}
    >
      <label htmlFor={id}>{label}</label>
      <Field
        ref={fieldRef}
        id={id}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        rows={multiline ? rows : undefined}
        data-chat-focus={focusId || undefined}
        tabIndex={editing ? 0 : -1}
        onInput={syncValue}
        onChange={syncValue}
        onCompositionEnd={syncValue}
        onClick={enterInputMode}
        onFocus={onSelect}
        onBlur={(event) => {
          syncValue(event)
          onEditingChange(false)
        }}
        onKeyDown={(event) => {
          if (
            event.key !== 'Enter' ||
            event.nativeEvent?.isComposing ||
            event.keyCode === 229 ||
            (multiline && event.shiftKey)
          ) return
          event.preventDefault()
          event.stopPropagation()
          leaveInputMode()
        }}
      />
    </div>
  )
}

export function MedicineRow({ medicine, detail, selected = false, checked = false, onClick }) {
  return (
    <button
      type="button"
      className={`medicine-row${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      tabIndex={-1}
      aria-pressed={checked}
    >
      <span className={`checkmark${checked ? ' is-checked' : ''}`} aria-hidden="true">
        {checked ? '✓' : '○'}
      </span>
      <span className="medicine-copy">
        <strong>{medicine}</strong>
        <small>{detail}</small>
      </span>
    </button>
  )
}

export function Decision({ selected = 0, left = 'Yes', right = 'No', onSelect, ariaLabel = 'Choice' }) {
  return (
    <div className="decision" role="radiogroup" aria-label={ariaLabel}>
      {[left, right].map((label, index) => (
        <button
          type="button"
          role="radio"
          aria-checked={selected === index}
          className={selected === index ? 'is-selected' : ''}
          onClick={() => onSelect(index)}
          tabIndex={-1}
          key={label}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function QuantityPicker({
  value,
  selected = true,
  onChange,
  valueLabel = String(value),
  decreaseLabel = 'Decrease',
  increaseLabel = 'Increase',
}) {
  return (
    <div className={`quantity-picker${selected ? ' is-selected' : ''}`} aria-label={valueLabel}>
      <button type="button" tabIndex={-1} onClick={() => onChange(-0.5)} aria-label={decreaseLabel}>−</button>
      <strong>{valueLabel}</strong>
      <button type="button" tabIndex={-1} onClick={() => onChange(0.5)} aria-label={increaseLabel}>＋</button>
    </div>
  )
}

export function FeedbackCard({ danger = false, title, children }) {
  return (
    <div className={`feedback-card${danger ? ' feedback-card--danger' : ''}`} role="status">
      <span className="feedback-mark" aria-hidden="true">{danger ? '!' : '✓'}</span>
      <strong>{title}</strong>
      {children}
    </div>
  )
}
