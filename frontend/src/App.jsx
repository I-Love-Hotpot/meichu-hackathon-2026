import { useEffect, useMemo, useRef, useState } from 'react'
import DeviceShell from './components/DeviceShell.jsx'
import {
  Decision,
  FeedbackCard,
  ListRow,
  MedicineRow,
  QuantityPicker,
} from './components/Controls.jsx'
import { historyDays, medicines, todayDoses as initialDoses } from './data/fixtures.js'
import './app.css'

const SCREEN = {
  HOME: 'home',
  ADD_METHOD: 'add-method',
  UPLOAD: 'upload',
  MANUAL: 'manual',
  RECOGNIZING: 'recognizing',
  CONFIRM: 'confirm',
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
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function useStoredDoses() {
  const [doses, setDoses] = useState(() => {
    try {
      const saved = localStorage.getItem('medaboutyou-today-doses')
      return saved ? JSON.parse(saved) : initialDoses
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
  const [screen, setScreen] = useState(SCREEN.HOME)
  const [, setHistory] = useState([])
  const [focus, setFocus] = useState(0)
  const [decision, setDecision] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [manualName, setManualName] = useState('')
  const [selectedMedicine, setSelectedMedicine] = useState(medicines[0])
  const [uploadedName, setUploadedName] = useState('')
  const [doses, setDoses] = useStoredDoses()
  const fileInputRef = useRef(null)
  const shellRef = useRef(null)

  const navigate = (next) => {
    setHistory((items) => [...items, screen])
    setScreen(next)
    setFocus(0)
  }

  const replace = (next) => {
    setScreen(next)
    setFocus(0)
  }

  const goBack = () => {
    setHistory((items) => {
      if (!items.length) {
        setScreen(SCREEN.HOME)
        return []
      }
      const next = [...items]
      setScreen(next.pop())
      setFocus(0)
      return next
    })
  }

  useEffect(() => {
    shellRef.current?.focus()
  }, [screen])

  useEffect(() => {
    if (screen !== SCREEN.RECOGNIZING) return undefined
    const timer = window.setTimeout(() => {
      setScreen(SCREEN.CONFIRM)
      setFocus(0)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [screen])

  const adjustQuantity = (amount) => {
    setQuantity((current) => clamp(current + amount, 0.5, 5))
  }

  const toggleDose = (index) => {
    setDoses((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, taken: !item.taken } : item
    )))
  }

  const homeItems = useMemo(() => [
    { label: '記錄今日服藥', target: SCREEN.RECORD_TODAY },
    { label: '歷史紀錄', target: SCREEN.HISTORY },
    { label: '我的藥品', target: SCREEN.MEDICINES },
    { label: '緊急資訊', target: SCREEN.EMERGENCY, state: 'danger' },
  ], [])

  const move = (delta, count) => setFocus((current) => (current + delta + count) % count)

  const screenConfig = (() => {
    switch (screen) {
      case SCREEN.HOME:
        return {
          title: '主選單',
          left: '選擇',
          right: '離開',
          count: homeItems.length,
          onEnter: () => navigate(homeItems[focus].target),
          onRight: () => setFocus(0),
          content: homeItems.map((item, index) => (
            <ListRow
              key={item.label}
              label={`${index + 1}  ${item.label}`}
              state={item.state}
              selected={focus === index}
              onClick={() => navigate(item.target)}
            />
          )),
        }

      case SCREEN.ADD_METHOD:
        return {
          title: '新增藥品', count: 2, left: '選擇', right: '返回', onRight: goBack,
          onEnter: () => navigate(focus === 0 ? SCREEN.UPLOAD : SCREEN.MANUAL),
          content: <>
            <p className="prompt">選擇新增方式</p>
            <ListRow label="拍照或選擇照片" selected={focus === 0} onClick={() => navigate(SCREEN.UPLOAD)} />
            <ListRow label="鍵盤輸入" selected={focus === 1} onClick={() => navigate(SCREEN.MANUAL)} />
            <p className="helper">方向鍵移動，Enter 確認</p>
          </>,
        }

      case SCREEN.UPLOAD:
        return {
          title: '上傳藥袋照片', count: 1, left: '選擇', right: '返回', onRight: goBack,
          onEnter: () => fileInputRef.current?.click(),
          content: <>
            <p className="prompt">新增藥袋照片</p>
            <ListRow label="拍照或選擇照片" selected onClick={() => fileInputRef.current?.click()} />
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
            <p className="helper">開啟系統相機／照片選擇器<br />選取後直接上傳，不顯示預覽</p>
          </>,
        }

      case SCREEN.MANUAL:
        return {
          title: '鍵盤輸入', count: 1, left: '確認', right: '返回', onRight: goBack,
          onEnter: () => {
            if (manualName.trim()) navigate(SCREEN.CONFIRM)
          },
          content: <form className="manual-form" onSubmit={(event) => {
            event.preventDefault()
            if (manualName.trim()) navigate(SCREEN.CONFIRM)
          }}>
            <label htmlFor="medicine-name">輸入藥品名稱</label>
            <input
              id="medicine-name"
              value={manualName}
              placeholder="例如：降血壓藥"
              onChange={(event) => setManualName(event.target.value)}
              autoFocus
            />
            <p className="helper">可使用數字鍵輸入<br />Enter 確認</p>
          </form>,
        }

      case SCREEN.RECOGNIZING:
        return {
          title: '資訊辨識', count: 0, left: '', right: '取消', onRight: goBack,
          content: <div className="processing" aria-live="polite">
            <p className="prompt">正在辨識藥品資訊…</p>
            <div className="progress" aria-label="辨識進度"><span /></div>
            <p className="helper">{uploadedName || '辨識藥名、劑量與用法'}</p>
          </div>,
        }

      case SCREEN.CONFIRM:
        return {
          title: '確認藥品資訊', count: 3, left: '確認', right: '返回', onRight: goBack,
          onEnter: () => navigate(SCREEN.DAILY),
          content: <>
            <MedicineRow medicine={manualName || '降血壓藥'} detail="10 mg · 1 錠" selected={focus === 0} />
            <ListRow label="用法：飯後" selected={focus === 1} />
            <ListRow label="頻率：每日 2 次" selected={focus === 2} />
          </>,
        }

      case SCREEN.DAILY:
        return {
          title: '每日服用', count: 2, left: '確認', right: '返回', onRight: goBack,
          horizontal: true,
          onEnter: () => navigate(decision === 0 ? SCREEN.REMINDER_SETUP : SCREEN.ADD_COMPLETE),
          content: <>
            <p className="prompt">這個藥每天都要服用嗎？</p>
            <Decision selected={decision} onSelect={setDecision} />
            <p className="helper">← → 選擇，Enter 確認</p>
          </>,
        }

      case SCREEN.REMINDER_SETUP:
        return {
          title: '設定提醒', count: 3, left: '完成', right: '返回', onRight: goBack,
          onEnter: () => navigate(SCREEN.ADD_COMPLETE),
          content: <>
            <p className="prompt">選擇提醒時間</p>
            {['08:00  早餐後', '20:00  晚餐後', '＋ 新增提醒'].map((label, index) => (
              <ListRow key={label} label={label} selected={focus === index} onClick={() => setFocus(index)} />
            ))}
          </>,
        }

      case SCREEN.ADD_COMPLETE:
        return {
          title: '新增完成', count: 1, left: '回藥品', right: '主選單',
          onEnter: () => replace(SCREEN.MEDICINES), onRight: () => replace(SCREEN.HOME),
          content: <>
            <FeedbackCard title="藥品已新增" />
            <p className="helper centered">下一次提醒：今天 20:00</p>
          </>,
        }

      case SCREEN.REMINDER_ALERT:
        return {
          title: '用藥提醒', date: '09/19', time: '08:00', count: 2, left: '記錄', right: '稍後',
          onRight: () => replace(SCREEN.HOME), onEnter: () => navigate(SCREEN.RECORD_COMPLETE),
          content: <>
            <MedicineRow medicine="降血壓藥" detail="1 錠 · 飯後" selected={focus === 0} />
            <QuantityPicker value={quantity} selected={focus === 1} onChange={adjustQuantity} />
            <p className="helper">Enter 記錄已服用</p>
          </>,
        }

      case SCREEN.RECORD_TODAY:
        return {
          title: '記錄今日服藥', date: '09/19', time: '現在', count: doses.length,
          left: '完成', right: '返回', onRight: goBack,
          onLeft: () => navigate(SCREEN.RECORD_COMPLETE),
          onEnter: () => toggleDose(focus),
          content: doses.map((dose, index) => (
            <MedicineRow
              key={dose.id}
              medicine={dose.medicine}
              detail={dose.detail}
              checked={dose.taken}
              selected={focus === index}
              onClick={() => toggleDose(index)}
            />
          )),
        }

      case SCREEN.RECORD_COMPLETE:
        return {
          title: '記錄完成', count: 1, left: '主選單', right: '返回',
          onRight: goBack, onEnter: () => replace(SCREEN.HOME),
          content: <>
            <FeedbackCard title="今日用藥已記錄" />
            <p className="helper centered">已完成 {doses.filter((dose) => dose.taken).length} / {doses.length} 項</p>
          </>,
        }

      case SCREEN.HISTORY:
        return {
          title: '歷史紀錄', date: '09/19', time: '', count: historyDays.length,
          left: '開啟', right: '返回', onRight: goBack, onEnter: () => navigate(SCREEN.HISTORY_DETAIL),
          content: historyDays.map((day, index) => (
            <ListRow key={day.id} label={day.label} state={day.state} selected={focus === index} onClick={() => navigate(SCREEN.HISTORY_DETAIL)} />
          )),
        }

      case SCREEN.HISTORY_DETAIL:
        return {
          title: '紀錄詳情', count: 2, left: '更新', right: '返回', onRight: goBack,
          onLeft: () => navigate(SCREEN.UPDATE_RECORD), onEnter: () => navigate(SCREEN.UPDATE_RECORD),
          content: <>
            <p className="prompt">2026/09/19</p>
            <MedicineRow medicine="降血壓藥" detail="08:05 · 1 錠" checked selected={focus === 0} />
            <MedicineRow medicine="維生素 D" detail="12:10 · 1 粒" checked selected={focus === 1} />
          </>,
        }

      case SCREEN.UPDATE_RECORD:
        return {
          title: '更新紀錄', count: 2, left: '儲存', right: '返回', onRight: goBack,
          horizontal: true, onEnter: () => navigate(decision === 0 ? SCREEN.QUANTITY : SCREEN.HISTORY_DETAIL),
          content: <>
            <MedicineRow medicine="維生素 D" detail="12:10 · 1 粒" checked selected />
            <p className="prompt">是否修改服用數量？</p>
            <Decision selected={decision} onSelect={setDecision} />
          </>,
        }

      case SCREEN.QUANTITY:
        return {
          title: '修改數量', count: 1, left: '儲存', right: '返回', onRight: goBack,
          horizontal: true, onEnter: () => replace(SCREEN.HISTORY_DETAIL),
          content: <>
            <p className="prompt">調整本次服用數量</p>
            <QuantityPicker value={quantity} onChange={adjustQuantity} />
            <p className="helper">每次調整 0.5 錠<br />← → 調整</p>
          </>,
        }

      case SCREEN.MEDICINES:
        return {
          title: '我的藥品', count: medicines.length + 1, left: '開啟', right: '返回', onRight: goBack,
          onEnter: () => {
            if (focus === medicines.length) navigate(SCREEN.ADD_METHOD)
            else {
              setSelectedMedicine(medicines[focus])
              navigate(SCREEN.MEDICINE_DETAIL)
            }
          },
          content: <>
            {medicines.map((medicine, index) => (
              <MedicineRow
                key={medicine.id}
                medicine={medicine.name}
                detail={medicine.schedule}
                selected={focus === index}
                onClick={() => {
                  setSelectedMedicine(medicine)
                  navigate(SCREEN.MEDICINE_DETAIL)
                }}
              />
            ))}
            <ListRow label="＋ 新增藥品" selected={focus === medicines.length} onClick={() => navigate(SCREEN.ADD_METHOD)} />
          </>,
        }

      case SCREEN.MEDICINE_DETAIL:
        return {
          title: '藥品詳情', count: 3, left: '修改', right: '返回', onRight: goBack,
          onLeft: () => navigate(SCREEN.QUANTITY), onEnter: () => navigate(SCREEN.QUANTITY),
          content: <>
            <MedicineRow medicine={selectedMedicine.name} detail={selectedMedicine.strength} selected={focus === 0} />
            <ListRow label={`用法：${selectedMedicine.usage}`} selected={focus === 1} />
            <ListRow label={`提醒：${selectedMedicine.reminders.join('、')}`} selected={focus === 2} />
          </>,
        }

      case SCREEN.EMERGENCY:
        return {
          title: '緊急資訊', count: 1, left: '求助說明', right: '關閉', onRight: goBack,
          emergency: true,
          onEnter: () => undefined,
          content: <>
            <FeedbackCard danger title="用藥緊急資訊" />
            <p className="emergency-line"><strong>過敏：</strong>盤尼西林</p>
            <p className="helper">目前用藥：降血壓藥 10 mg</p>
          </>,
        }

      default:
        return { title: 'MedAboutYou', count: 0, content: null }
    }
  })()

  const onLeft = screenConfig.onLeft || screenConfig.onEnter
  const onCenter = screenConfig.onEnter
  const onRight = screenConfig.onRight || goBack

  const handleKeyDown = (event) => {
    const isTextInput = event.target instanceof HTMLInputElement && event.target.type !== 'file'
    if (isTextInput && event.key !== 'Enter' && event.key !== 'Escape') return

    if (event.key >= '1' && event.key <= '4' && screen === SCREEN.HOME) {
      event.preventDefault()
      navigate(homeItems[Number(event.key) - 1].target)
      return
    }
    if (event.key === '9' && screen === SCREEN.HOME) {
      event.preventDefault()
      navigate(SCREEN.REMINDER_ALERT)
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
      case 'Backspace':
      case 'SoftRight':
        if (!isTextInput) onRight?.()
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
      onKeyDown={handleKeyDown}
      screenRef={shellRef}
    >
      {screenConfig.content}
    </DeviceShell>
  )
}
