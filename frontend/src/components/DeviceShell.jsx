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

export function SoftKeyBar({ left = '選擇', right = '返回', onLeft, onCenter, onRight }) {
  return (
    <footer className="softkey-bar">
      <button type="button" onClick={onLeft} disabled={!left} aria-label={left || '無左軟鍵'}>
        {left}
      </button>
      <button type="button" onClick={onCenter} aria-label="確認">
        <SelectIcon aria-hidden="true" />
      </button>
      <button type="button" onClick={onRight} disabled={!right} aria-label={right || '無右軟鍵'}>
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
        onLeft={onLeft}
        onCenter={onCenter}
        onRight={onRight}
      />
    </main>
  )
}
