import SelectIcon from '../assets/icons/select.svg?react'
import BackIcon from '../assets/icons/back.svg?react'

export function HeaderBar({ title, date, time, emergency = false }) {
  return (
    <header className={`app-header${emergency ? ' app-header--emergency' : ''}`}>
      {date && <span className="header-meta">{date}</span>}
      <h1>{title}</h1>
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
        {left}
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
      aria-label={`MedAboutYou：${title}`}
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
