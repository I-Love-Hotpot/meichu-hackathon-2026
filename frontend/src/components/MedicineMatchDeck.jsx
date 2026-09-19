import { useCallback, useEffect, useState } from 'react'

export default function MedicineMatchDeck({
  candidates,
  index,
  onChange,
  onActivate,
  scrollRef,
  labels,
  includeManual = true,
}) {
  const [canScrollDown, setCanScrollDown] = useState(false)
  const activeCandidate = candidates[index]
  const cardCount = candidates.length + (includeManual ? 1 : 0)

  const updateScrollHint = useCallback(() => {
    const element = scrollRef.current
    if (!element) {
      setCanScrollDown(false)
      return
    }

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    setCanScrollDown(remaining > 2)
  }, [scrollRef])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = 0
    const frame = window.requestAnimationFrame(updateScrollHint)
    return () => window.cancelAnimationFrame(frame)
  }, [index, scrollRef, updateScrollHint])

  return (
    <div className="match-deck" aria-live="polite">
      <div className="match-deck-stage">
        {index > 0 && <span className="match-card-peek match-card-peek--left" aria-hidden="true" />}

        <article
          className={`match-card${activeCandidate ? '' : ' match-card--manual'}`}
          role="button"
          aria-label={activeCandidate?.name || labels.manualTitle}
          onClick={onActivate}
        >
          {activeCandidate ? (
            <>
              <div className="match-card-scroll" ref={scrollRef} onScroll={updateScrollHint}>
                {activeCandidate.image && (
                  <img src={activeCandidate.image} alt={activeCandidate.imageAlt || ''} />
                )}
                <div className="match-card-copy">
                  <span className="match-card-position">{index + 1} / {cardCount}</span>
                  <h2>{activeCandidate.genericName}</h2>
                  <dl>
                    {(activeCandidate.details || [
                      { label: labels.primaryEffect, value: activeCandidate.primaryEffect },
                      { label: labels.sideEffects, value: activeCandidate.sideEffects },
                      { label: labels.indications, value: activeCandidate.indications },
                    ]).map((detail) => (
                      <div key={detail.label}>
                        <dt>{detail.label}</dt>
                        <dd>{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              {canScrollDown && <span className="match-scroll-hint" aria-hidden="true" />}
            </>
          ) : includeManual ? (
            <div className="match-manual-content">
              <span className="match-plus" aria-hidden="true">+</span>
              <strong>{labels.manualTitle}</strong>
              <small>{labels.manualHelp}</small>
            </div>
          ) : null}
        </article>

        {index < cardCount - 1 && <span className="match-card-peek match-card-peek--right" aria-hidden="true" />}
      </div>

      <div className="match-deck-footer" aria-label={`${index + 1} / ${cardCount}`}>
        <span aria-hidden="true">‹</span>
        <div className="match-dots">
          {Array.from({ length: cardCount }, (_, dotIndex) => (
            <button
              type="button"
              key={dotIndex}
              className={dotIndex === index ? 'is-active' : ''}
              aria-label={`${dotIndex + 1} / ${cardCount}`}
              aria-current={dotIndex === index ? 'true' : undefined}
              tabIndex={-1}
              onClick={() => onChange(dotIndex)}
            />
          ))}
        </div>
        <span aria-hidden="true">›</span>
      </div>
    </div>
  )
}
