import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DeviceShell from './components/DeviceShell.jsx'
import {
  Decision,
  FeedbackCard,
  ListRow,
  MedicineRow,
  QuantityPicker,
} from './components/Controls.jsx'
import {
  historyDays,
  medicineCandidates,
  medicines,
  todayDoses as initialDoses,
} from './data/fixtures.js'
import './app.css'

const SCREEN = {
  HOME: 'home',
  ADD_METHOD: 'add-method',
  UPLOAD: 'upload',
  MANUAL: 'manual',
  RECOGNIZING: 'recognizing',
  MATCHES: 'matches',
  DAILY: 'daily',
  REMINDER_SETUP: 'reminder-setup',
  ADD_COMPLETE: 'add-complete',
  REMINDER_ALERT: 'reminder-alert',
  RECORD_TODAY: 'record-today',
  RECORD_COMPLETE: 'record-complete',
  HISTORY: 'history',
  HISTORY_DETAIL: 'history-detail',
  UPDATE_RECORD: 'update-record',
  QUANTITY: 'quantity',
  MEDICINES: 'medicines',
  MEDICINE_DETAIL: 'medicine-detail',
  EMERGENCY: 'emergency',
  LANGUAGE: 'language',
}

const HISTORY_KEY = 'medaboutyou'
const SCREEN_VALUES = new Set(Object.values(SCREEN))
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function useStoredDoses() {
  const [doses, setDoses] = useState(() => {
    try {
      const saved = localStorage.getItem('medaboutyou-today-doses')
      const parsed = saved ? JSON.parse(saved) : null
      const isCurrentSchema = Array.isArray(parsed)
        && parsed.every((dose) => dose.medicineId && dose.time && dose.unit)
      return isCurrentSchema ? parsed : initialDoses
    } catch {
      return initialDoses
    }
  })

  useEffect(() => {
    localStorage.setItem('medaboutyou-today-doses', JSON.stringify(doses))
  }, [doses])

  return [doses, setDoses]
}

export default function App() {
  const { t, i18n } = useTranslation()
  const [screen, setScreen] = useState(SCREEN.HOME)
  const [focus, setFocus] = useState(0)
  const [decision, setDecision] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [manualName, setManualName] = useState('')
  const [selectedMedicine, setSelectedMedicine] = useState(medicines[0])
  const [selectedCandidate, setSelectedCandidate] = useState(medicineCandidates[0])
  const [uploadedName, setUploadedName] = useState('')
  const [doses, setDoses] = useStoredDoses()
  const fileInputRef = useRef(null)
  const shellRef = useRef(null)
  const quantityBufferRef = useRef('')
  const quantityTimerRef = useRef(null)

  const currentLanguage = i18n.resolvedLanguage || i18n.language
  const medicineName = (id) => t(`medicines.${id}.name`)
  const medicineSchedule = (id) => t(`medicines.${id}.schedule`)
  const medicineUsage = (id) => t(`medicines.${id}.usage`)
  const doseDetail = ({ time, amount, unit }) => t('dose.detail', {
    time,
    amount,
    unit: t(`dose.${unit}`),
  })
  const quantityLabels = {
    valueLabel: t('dose.quantityValue', { value: quantity.toFixed(1) }),
    decreaseLabel: t('dose.decrease'),
    increaseLabel: t('dose.increase'),
  }

  const navigate = (next) => {
    window.history.pushState({ [HISTORY_KEY]: true, screen: next }, '')
    setScreen(next)
    setFocus(0)
  }

  const replace = (next) => {
    window.history.replaceState({ [HISTORY_KEY]: true, screen: next }, '')
    setScreen(next)
    setFocus(0)
  }

  const goBack = () => {
    window.history.back()
  }

  useEffect(() => {
    const entry = window.history.state

    if (entry?.[HISTORY_KEY] && SCREEN_VALUES.has(entry.screen)) {
      setScreen(entry.screen)
    } else {
      window.history.replaceState({ [HISTORY_KEY]: true, screen: SCREEN.HOME }, '')
    }

    const handlePopState = (event) => {
      if (!event.state?.[HISTORY_KEY] || !SCREEN_VALUES.has(event.state.screen)) return
      setScreen(event.state.screen)
      setFocus(0)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    shellRef.current?.focus()
    quantityBufferRef.current = ''
    window.clearTimeout(quantityTimerRef.current)
  }, [screen])

  useEffect(() => {
    document.documentElement.lang = currentLanguage
  }, [currentLanguage])

  useEffect(() => () => window.clearTimeout(quantityTimerRef.current), [])

  useEffect(() => {
    if (screen !== SCREEN.RECOGNIZING) return undefined
    const timer = window.setTimeout(() => {
      window.history.replaceState({ [HISTORY_KEY]: true, screen: SCREEN.MATCHES }, '')
      setScreen(SCREEN.MATCHES)
      setFocus(0)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [screen])

  const adjustQuantity = (amount) => {
    quantityBufferRef.current = ''
    setQuantity((current) => clamp(current + amount, 0.5, 99.5))
  }

  const enterQuantityDigit = (key) => {
    const character = key === '*' ? '.' : key
    let next = quantityBufferRef.current

    if (character === '.') {
      if (next.includes('.')) return
      next = `${next || '0'}.`
    } else {
      next = next === '0' ? character : `${next}${character}`
    }

    next = next.slice(0, 4)
    const parsed = Number(next)
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 99.5) {
      setQuantity(Math.round(parsed * 10) / 10)
    }

    quantityBufferRef.current = next
    window.clearTimeout(quantityTimerRef.current)
    quantityTimerRef.current = window.setTimeout(() => {
      quantityBufferRef.current = ''
    }, 1200)
  }

  const toggleDose = (index) => {
    setDoses((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, taken: !item.taken } : item
    )))
  }

  const homeItems = useMemo(() => [
    { label: t('home.recordToday'), target: SCREEN.RECORD_TODAY },
    { label: t('home.history'), target: SCREEN.HISTORY },
    { label: t('home.myMedicines'), target: SCREEN.MEDICINES },
    { label: t('home.emergency'), target: SCREEN.EMERGENCY, state: 'danger' },
    { label: t('home.language'), target: SCREEN.LANGUAGE },
  ], [t])

  const move = (delta, count) => setFocus((current) => (current + delta + count) % count)

  const screenConfig = (() => {
    switch (screen) {
      case SCREEN.HOME:
        return {
          title: t('home.title'),
          left: t('common.select'),
          right: t('common.exit'),
          count: homeItems.length,
          onEnter: () => navigate(homeItems[focus].target),
          onNumber: (number) => {
            if (number === 9) {
              navigate(SCREEN.REMINDER_ALERT)
              return
            }
            if (homeItems[number - 1]) navigate(homeItems[number - 1].target)
          },
          content: <div className="dense-list">
            {homeItems.map((item, index) => (
              <ListRow
                key={item.label}
                label={`${index + 1}  ${item.label}`}
                state={item.state}
                selected={focus === index}
                onClick={() => navigate(item.target)}
              />
            ))}
          </div>,
        }

      case SCREEN.ADD_METHOD:
        return {
          title: t('add.title'), count: 2, left: t('common.select'), right: t('common.back'),
          onEnter: () => navigate(focus === 0 ? SCREEN.UPLOAD : SCREEN.MANUAL),
          onNumber: (number) => {
            if (number === 1) navigate(SCREEN.UPLOAD)
            if (number === 2) navigate(SCREEN.MANUAL)
          },
          content: <>
            <p className="prompt">{t('add.chooseMethod')}</p>
            <ListRow label={`1  ${t('add.photo')}`} selected={focus === 0} onClick={() => navigate(SCREEN.UPLOAD)} />
            <ListRow label={`2  ${t('add.keyboard')}`} selected={focus === 1} onClick={() => navigate(SCREEN.MANUAL)} />
            <p className="helper">{t('add.navigationHelp')}</p>
          </>,
        }

      case SCREEN.UPLOAD:
        return {
          title: t('add.uploadTitle'), count: 1, left: t('common.select'), right: t('common.back'),
          onEnter: () => fileInputRef.current?.click(),
          content: <>
            <p className="prompt">{t('add.newPhoto')}</p>
            <ListRow label={t('add.photo')} selected onClick={() => fileInputRef.current?.click()} />
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const [file] = event.target.files
                if (!file) return
                setUploadedName(file.name)
                navigate(SCREEN.RECOGNIZING)
                event.target.value = ''
              }}
            />
            <p className="helper">{t('add.pickerHelp')}<br />{t('add.noPreview')}</p>
          </>,
        }

      case SCREEN.MANUAL:
        return {
          title: t('add.manualTitle'), count: 1, left: t('common.confirm'), right: t('common.back'),
          onEnter: () => {
            if (manualName.trim()) navigate(SCREEN.RECOGNIZING)
          },
          content: <form className="manual-form" onSubmit={(event) => {
            event.preventDefault()
            if (manualName.trim()) navigate(SCREEN.RECOGNIZING)
          }}>
            <label htmlFor="medicine-name">{t('add.medicineName')}</label>
            <input
              id="medicine-name"
              value={manualName}
              placeholder={t('add.medicinePlaceholder')}
              onChange={(event) => setManualName(event.target.value)}
              autoFocus
            />
            <p className="helper">{t('add.manualHelp')}<br />Enter</p>
          </form>,
        }

      case SCREEN.RECOGNIZING:
        return {
          title: t('add.recognizingTitle'), count: 0, left: '', right: t('common.cancel'),
          content: <div className="processing" aria-live="polite">
            <p className="prompt">{t('add.recognizing')}</p>
            <div className="progress" aria-label={t('add.recognizingTitle')}><span /></div>
            <p className="helper">{uploadedName || manualName || t('add.recognizingHelp')}</p>
          </div>,
        }

      case SCREEN.MATCHES:
        return {
          title: t('add.matchesTitle'), count: medicineCandidates.length,
          left: t('common.confirm'), right: t('common.back'),
          onEnter: () => {
            setSelectedCandidate(medicineCandidates[focus])
            navigate(SCREEN.DAILY)
          },
          onNumber: (number) => {
            const candidate = medicineCandidates[number - 1]
            if (!candidate) return
            setSelectedCandidate(candidate)
            navigate(SCREEN.DAILY)
          },
          content: <>
            {medicineCandidates.map((candidate, index) => (
              <MedicineRow
                key={candidate.id}
                medicine={`${index + 1}  ${t(`candidates.${candidate.id}`)}`}
                detail={`${candidate.strength} · ${t('add.confidence', { value: candidate.confidence })}`}
                selected={focus === index}
                onClick={() => {
                  setSelectedCandidate(candidate)
                  navigate(SCREEN.DAILY)
                }}
              />
            ))}
            <p className="helper">{t('add.matchesHelp')}</p>
          </>,
        }

      case SCREEN.DAILY:
        return {
          title: t('add.dailyTitle'), count: 2, left: t('common.confirm'), right: t('common.back'),
          horizontal: true,
          onEnter: () => navigate(decision === 0 ? SCREEN.REMINDER_SETUP : SCREEN.ADD_COMPLETE),
          content: <>
            <p className="prompt">{t('add.dailyQuestion')}</p>
            <Decision
              selected={decision}
              left={t('add.yes')}
              right={t('add.no')}
              onSelect={setDecision}
              ariaLabel={t('common.select')}
            />
            <p className="helper">{t('add.binaryHelp')}</p>
          </>,
        }

      case SCREEN.REMINDER_SETUP:
        return {
          title: t('add.reminderTitle'), count: 3, left: t('common.finish'), right: t('common.back'),
          onEnter: () => navigate(SCREEN.ADD_COMPLETE),
          onNumber: (number) => {
            if (number >= 1 && number <= 3) setFocus(number - 1)
          },
          content: <>
            <p className="prompt">{t('add.chooseReminder')}</p>
            {[t('add.breakfast'), t('add.dinner'), t('add.addReminder')].map((label, index) => (
              <ListRow key={label} label={`${index + 1}  ${label}`} selected={focus === index} onClick={() => setFocus(index)} />
            ))}
          </>,
        }

      case SCREEN.ADD_COMPLETE:
        return {
          title: t('add.completeTitle'), count: 1,
          left: t('common.medicines'), right: t('common.back'),
          onEnter: () => replace(SCREEN.MEDICINES),
          content: <>
            <FeedbackCard title={t('add.added')}>
              <span>{t(`candidates.${selectedCandidate.id}`)}</span>
            </FeedbackCard>
            <p className="helper centered">{t('add.nextReminder')}</p>
          </>,
        }

      case SCREEN.REMINDER_ALERT:
        return {
          title: t('dose.reminderTitle'), date: '09/19', time: '08:00', count: 2,
          left: t('common.record'), right: t('common.later'),
          onEnter: () => navigate(SCREEN.RECORD_COMPLETE),
          content: <>
            <MedicineRow
              medicine={medicineName('pressure')}
              detail={`1 ${t('dose.unitPill')} · ${medicineUsage('pressure')}`}
              selected={focus === 0}
            />
            <QuantityPicker
              value={quantity}
              selected={focus === 1}
              onChange={adjustQuantity}
              {...quantityLabels}
            />
            <p className="helper">{t('dose.enterToRecord')}</p>
          </>,
        }

      case SCREEN.RECORD_TODAY:
        return {
          title: t('dose.recordTodayTitle'), date: '09/19', time: t('common.now'), count: doses.length,
          left: t('common.finish'), right: t('common.back'),
          onLeft: () => navigate(SCREEN.RECORD_COMPLETE),
          onEnter: () => toggleDose(focus),
          onNumber: (number) => {
            if (doses[number - 1]) toggleDose(number - 1)
          },
          content: doses.map((dose, index) => (
            <MedicineRow
              key={dose.id}
              medicine={`${index + 1}  ${medicineName(dose.medicineId)}`}
              detail={doseDetail(dose)}
              checked={dose.taken}
              selected={focus === index}
              onClick={() => toggleDose(index)}
            />
          )),
        }

      case SCREEN.RECORD_COMPLETE:
        return {
          title: t('dose.completeTitle'), count: 1,
          left: t('common.mainMenu'), right: t('common.back'),
          onEnter: () => replace(SCREEN.HOME),
          content: <>
            <FeedbackCard title={t('dose.recorded')} />
            <p className="helper centered">{t('dose.progress', {
              done: doses.filter((dose) => dose.taken).length,
              total: doses.length,
            })}</p>
          </>,
        }

      case SCREEN.HISTORY:
        return {
          title: t('history.title'), date: '09/19', time: '', count: historyDays.length,
          left: t('common.open'), right: t('common.back'),
          onEnter: () => navigate(SCREEN.HISTORY_DETAIL),
          onNumber: (number) => {
            if (historyDays[number - 1]) navigate(SCREEN.HISTORY_DETAIL)
          },
          content: historyDays.map((day, index) => (
            <ListRow
              key={day.id}
              label={`${index + 1}  ${t('history.dayLabel', {
                date: day.date,
                relative: t(`history.${day.relative}`),
                done: day.done,
                total: day.total,
              })}`}
              state={day.state}
              selected={focus === index}
              onClick={() => navigate(SCREEN.HISTORY_DETAIL)}
            />
          )),
        }

      case SCREEN.HISTORY_DETAIL:
        return {
          title: t('history.detailTitle'), count: 2,
          left: t('common.update'), right: t('common.back'),
          onLeft: () => navigate(SCREEN.UPDATE_RECORD), onEnter: () => navigate(SCREEN.UPDATE_RECORD),
          onNumber: (number) => {
            if (number >= 1 && number <= 2) setFocus(number - 1)
          },
          content: <>
            <p className="prompt">2026/09/19</p>
            <MedicineRow medicine={`1  ${medicineName('pressure')}`} detail={doseDetail({ time: '08:05', amount: 1, unit: 'unitPill' })} checked selected={focus === 0} />
            <MedicineRow medicine={`2  ${medicineName('vitamin-d')}`} detail={doseDetail({ time: '12:10', amount: 1, unit: 'unitCapsule' })} checked selected={focus === 1} />
          </>,
        }

      case SCREEN.UPDATE_RECORD:
        return {
          title: t('history.updateTitle'), count: 2,
          left: t('common.save'), right: t('common.back'),
          horizontal: true, onEnter: () => navigate(decision === 0 ? SCREEN.QUANTITY : SCREEN.HISTORY_DETAIL),
          content: <>
            <MedicineRow medicine={medicineName('vitamin-d')} detail={doseDetail({ time: '12:10', amount: 1, unit: 'unitCapsule' })} checked selected />
            <p className="prompt">{t('history.changeQuantity')}</p>
            <Decision
              selected={decision}
              left={t('add.yes')}
              right={t('add.no')}
              onSelect={setDecision}
              ariaLabel={t('common.select')}
            />
          </>,
        }

      case SCREEN.QUANTITY:
        return {
          title: t('dose.quantityTitle'), count: 1,
          left: t('common.save'), right: t('common.back'),
          horizontal: true, onEnter: () => replace(SCREEN.HISTORY_DETAIL),
          content: <>
            <p className="prompt">{t('dose.quantityPrompt')}</p>
            <QuantityPicker value={quantity} onChange={adjustQuantity} {...quantityLabels} />
            <p className="helper">{t('dose.quantityHelp')}</p>
          </>,
        }

      case SCREEN.MEDICINES:
        return {
          title: t('medicines.title'), count: medicines.length + 1,
          left: t('common.open'), right: t('common.back'),
          onEnter: () => {
            if (focus === medicines.length) navigate(SCREEN.ADD_METHOD)
            else {
              setSelectedMedicine(medicines[focus])
              navigate(SCREEN.MEDICINE_DETAIL)
            }
          },
          onNumber: (number) => {
            if (number === medicines.length + 1) {
              navigate(SCREEN.ADD_METHOD)
              return
            }
            const medicine = medicines[number - 1]
            if (!medicine) return
            setSelectedMedicine(medicine)
            navigate(SCREEN.MEDICINE_DETAIL)
          },
          content: <div className="medicine-list">
            {medicines.map((medicine, index) => (
              <MedicineRow
                key={medicine.id}
                medicine={`${index + 1}  ${medicineName(medicine.id)}`}
                detail={medicineSchedule(medicine.id)}
                selected={focus === index}
                onClick={() => {
                  setSelectedMedicine(medicine)
                  navigate(SCREEN.MEDICINE_DETAIL)
                }}
              />
            ))}
            <ListRow label={`${medicines.length + 1}  ${t('medicines.add')}`} selected={focus === medicines.length} onClick={() => navigate(SCREEN.ADD_METHOD)} />
          </div>,
        }

      case SCREEN.MEDICINE_DETAIL:
        return {
          title: t('medicines.detailTitle'), count: 3,
          left: t('common.update'), right: t('common.back'),
          onLeft: () => navigate(SCREEN.QUANTITY), onEnter: () => navigate(SCREEN.QUANTITY),
          content: <>
            <MedicineRow medicine={medicineName(selectedMedicine.id)} detail={selectedMedicine.strength} selected={focus === 0} />
            <ListRow label={t('medicines.usage', { usage: medicineUsage(selectedMedicine.id) })} selected={focus === 1} />
            <ListRow label={t('medicines.reminders', { times: selectedMedicine.reminders.join(' / ') })} selected={focus === 2} />
          </>,
        }

      case SCREEN.EMERGENCY:
        return {
          title: t('emergency.title'), count: 1,
          left: t('emergency.help'), right: t('common.close'),
          emergency: true,
          onEnter: () => undefined,
          content: <>
            <FeedbackCard danger title={t('emergency.cardTitle')} />
            <p className="emergency-line"><strong>{t('emergency.allergy')}</strong>{t('emergency.allergyValue')}</p>
            <p className="helper">{t('emergency.currentMedicine')}</p>
          </>,
        }

      case SCREEN.LANGUAGE: {
        const languages = [
          { code: 'zh-TW', label: t('language.zhTW') },
          { code: 'en-US', label: t('language.enUS') },
        ]
        const selectLanguage = (index) => {
          const language = languages[index]
          if (!language) return
          i18n.changeLanguage(language.code)
          setFocus(index)
        }

        return {
          title: t('language.title'), count: languages.length,
          left: t('common.select'), right: t('common.back'),
          onEnter: () => selectLanguage(focus),
          onNumber: (number) => selectLanguage(number - 1),
          content: <>
            <p className="prompt">{t('language.prompt')}</p>
            {languages.map((language, index) => (
              <ListRow
                key={language.code}
                label={`${index + 1}  ${language.label}`}
                trailing={currentLanguage === language.code ? '✓' : '›'}
                selected={focus === index}
                onClick={() => selectLanguage(index)}
              />
            ))}
            <p className="helper">{t('language.current', {
              language: currentLanguage === 'zh-TW' ? t('language.zhTW') : t('language.enUS'),
            })}</p>
          </>,
        }
      }

      default:
        return { title: 'MedAboutYou', count: 0, content: null }
    }
  })()

  const onLeft = screenConfig.onLeft || screenConfig.onEnter
  const onCenter = screenConfig.onEnter
  const onRight = goBack

  const handleKeyDown = (event) => {
    const isTextInput = event.target instanceof HTMLInputElement && event.target.type !== 'file'
    if (isTextInput && event.key !== 'Enter' && event.key !== 'Escape') return

    const isQuantityEntry = screen === SCREEN.QUANTITY
      || (screen === SCREEN.REMINDER_ALERT && focus === 1)

    if (isQuantityEntry && (/^[0-9]$/.test(event.key) || event.key === '*')) {
      event.preventDefault()
      enterQuantityDigit(event.key)
      return
    }

    if (/^[1-9]$/.test(event.key) && screenConfig.onNumber) {
      event.preventDefault()
      screenConfig.onNumber(Number(event.key))
      return
    }

    switch (event.key) {
      case 'ArrowUp':
        if (!screenConfig.horizontal && screenConfig.count > 1) move(-1, screenConfig.count)
        break
      case 'ArrowDown':
        if (!screenConfig.horizontal && screenConfig.count > 1) move(1, screenConfig.count)
        break
      case 'ArrowLeft':
        if (screen === SCREEN.QUANTITY || (screen === SCREEN.REMINDER_ALERT && focus === 1)) adjustQuantity(-0.5)
        else if (screenConfig.horizontal) setDecision(0)
        break
      case 'ArrowRight':
        if (screen === SCREEN.QUANTITY || (screen === SCREEN.REMINDER_ALERT && focus === 1)) adjustQuantity(0.5)
        else if (screenConfig.horizontal) setDecision(1)
        break
      case 'Enter':
        onCenter?.()
        break
      case 'Escape':
      case 'SoftLeft':
        onLeft?.()
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <DeviceShell
      title={screenConfig.title}
      date={screenConfig.date}
      time={screenConfig.time}
      emergency={screenConfig.emergency}
      left={screenConfig.left}
      right={screenConfig.right}
      onLeft={onLeft}
      onCenter={onCenter}
      onRight={onRight}
      centerLabel={t('common.confirm')}
      noLeftLabel={t('common.noLeftAction')}
      noRightLabel={t('common.noRightAction')}
      onKeyDown={handleKeyDown}
      screenRef={shellRef}
    >
      {screenConfig.content}
    </DeviceShell>
  )
}
