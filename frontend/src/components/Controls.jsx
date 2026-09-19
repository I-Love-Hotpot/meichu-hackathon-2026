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
