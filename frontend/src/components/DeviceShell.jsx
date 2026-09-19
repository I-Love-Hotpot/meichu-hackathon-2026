import { useEffect, useRef } from 'react'
import SelectIcon from '../assets/icons/select.svg?react'
import BackIcon from '../assets/icons/back.svg?react'

export function HeaderBar({ title, date, time, emergency = false }) {
  const titleViewportRef = useRef(null)
  const titleTrackRef = useRef(null)

  useEffect(() => {
    const viewport = titleViewportRef.current
    const track = titleTrackRef.current
    if (!viewport || !track) return undefined

    let animation = null
    let frame = null
    let disposed = false
    const updateMarquee = () => {
      animation?.cancel()
      animation = null
      track.style.transform = 'translateX(0)'
      viewport.classList.remove('is-marquee')

      const distance = Math.ceil(track.scrollWidth - viewport.clientWidth)
      const reduceMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches
      if (distance <= 1 || reduceMotion || typeof track.animate !== 'function') {
        return
      }

      viewport.classList.add('is-marquee')
      const travelMs = Math.max(3000, (distance / 12) * 1000)
      const pauseMs = 2000
      const totalMs = travelMs + pauseMs
      animation = track.animate(
        [
          { transform: 'translateX(0)', offset: 0 },
          {
            transform: `translateX(-${distance}px)`,
            offset: travelMs / totalMs,
          },
          { transform: `translateX(-${distance}px)`, offset: 1 },
        ],
        {
          duration: totalMs,
          iterations: Infinity,
          easing: 'linear',
        },
      )
    }

    const scheduleUpdate = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateMarquee)
    }
    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(scheduleUpdate)
        : null
    resizeObserver?.observe(viewport)
    window.addEventListener('resize', scheduleUpdate)
    document.fonts?.ready?.then(() => {
      if (!disposed) scheduleUpdate()
    })
    scheduleUpdate()

    return () => {
      disposed = true
      if (frame !== null) window.cancelAnimationFrame(frame)
      animation?.cancel()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [title])

  return (
    <header
      className={`app-header${emergency ? ' app-header--emergency' : ''}${date || time ? ' app-header--with-meta' : ''}`}
    >
      {date && <span className="header-meta">{date}</span>}
      <h1 ref={titleViewportRef} className="app-header__title" title={title}>
        <span ref={titleTrackRef} className="app-header__title-track">
          {title}
        </span>
      </h1>
      {time && <span className="header-meta">{time}</span>}
    </header>
  )
}

export function SoftKeyBar({
  left = 'Select',
  right = 'Back',
  centerLabel = 'Confirm',
  noLeftLabel = 'No left soft-key action',
  noRightLabel = 'No right soft-key action',
  onLeft,
  onCenter,
  onRight,
}) {
  return (
    <footer className="softkey-bar">
      <button type="button" onClick={onLeft} disabled={!left} aria-label={left || noLeftLabel}>
        <span>{left}</span>
      </button>
      <button type="button" onClick={onCenter} aria-label={centerLabel}>
        <SelectIcon aria-hidden="true" />
      </button>
      <button type="button" onClick={onRight} disabled={!right} aria-label={right || noRightLabel}>
        <BackIcon aria-hidden="true" />
        <span>{right}</span>
      </button>
    </footer>
  )
}

export default function DeviceShell({
  title,
  children,
  date,
  time,
  emergency = false,
  left,
  right,
  onLeft,
  onCenter,
  onRight,
  centerLabel,
  noLeftLabel,
  noRightLabel,
  onKeyDown,
  screenRef,
}) {
  return (
    <main
      className="device-shell"
      aria-label={`MedAboutYou: ${title}`}
      tabIndex={0}
      ref={screenRef}
      onKeyDown={onKeyDown}
    >
      <HeaderBar title={title} date={date} time={time} emergency={emergency} />
      <section className="screen-content">{children}</section>
      <SoftKeyBar
        left={left}
        right={right}
        centerLabel={centerLabel}
        noLeftLabel={noLeftLabel}
        noRightLabel={noRightLabel}
        onLeft={onLeft}
        onCenter={onCenter}
        onRight={onRight}
      />
    </main>
  )
}
