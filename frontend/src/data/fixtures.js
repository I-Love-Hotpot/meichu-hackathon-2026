export const medicines = [
  {
    id: 'pressure',
    name: '降血壓藥',
    strength: '10 mg',
    dose: '1 錠',
    schedule: '每日 2 次',
    usage: '飯後',
    reminders: ['08:00', '20:00'],
  },
  {
    id: 'vitamin-d',
    name: '維生素 D',
    strength: '800 IU',
    dose: '1 粒',
    schedule: '每日 1 次',
    usage: '午餐後',
    reminders: ['12:00'],
  },
  {
    id: 'lipid',
    name: '降血脂藥',
    strength: '20 mg',
    dose: '1 錠',
    schedule: '每日 1 次',
    usage: '晚餐後',
    reminders: ['20:00'],
  },
]

export const todayDoses = [
  { id: 'pressure-am', medicine: '降血壓藥', detail: '08:00 · 1 錠', taken: true },
  { id: 'vitamin-d', medicine: '維生素 D', detail: '12:00 · 1 粒', taken: false },
  { id: 'lipid-pm', medicine: '降血脂藥', detail: '20:00 · 1 錠', taken: false },
]

export const historyDays = [
  { id: 'today', label: '09/19  今天 · 2/3', state: 'focus' },
  { id: 'yesterday', label: '09/18  昨天 · 3/3', state: 'success' },
  { id: 'thursday', label: '09/17  週四 · 2/3', state: 'default' },
]

