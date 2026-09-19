export const medicines = [
  {
    id: 'pressure',
    strength: '10 mg',
    amount: 1,
    unit: 'unitPill',
    reminders: ['08:00', '20:00'],
  },
  {
    id: 'vitamin-d',
    strength: '800 IU',
    amount: 1,
    unit: 'unitCapsule',
    reminders: ['12:00'],
  },
  {
    id: 'lipid',
    strength: '20 mg',
    amount: 1,
    unit: 'unitPill',
    reminders: ['20:00'],
  },
]

export const todayDoses = [
  { id: 'pressure-am', medicineId: 'pressure', time: '08:00', amount: 1, unit: 'unitPill', taken: true },
  { id: 'vitamin-d', medicineId: 'vitamin-d', time: '12:00', amount: 1, unit: 'unitCapsule', taken: false },
  { id: 'lipid-pm', medicineId: 'lipid', time: '20:00', amount: 1, unit: 'unitPill', taken: false },
]

export const demoDoseDays = [
  {
    date: '2026-09-19',
    updatedAt: '2026-09-19T01:41:00.000Z',
    doses: [
      { id: 'pressure-am', medicineId: 'pressure', time: '08:00', amount: 1, unit: 'unitPill', taken: true },
      { id: 'vitamin-d', medicineId: 'vitamin-d', time: '12:00', amount: 1, unit: 'unitCapsule', taken: true },
      { id: 'lipid-pm', medicineId: 'lipid', time: '20:00', amount: 1, unit: 'unitPill', taken: false },
    ],
  },
  {
    date: '2026-09-18',
    updatedAt: '2026-09-18T12:02:00.000Z',
    doses: [
      { id: 'pressure-am', medicineId: 'pressure', time: '08:00', amount: 1, unit: 'unitPill', taken: true },
      { id: 'vitamin-d', medicineId: 'vitamin-d', time: '12:00', amount: 1, unit: 'unitCapsule', taken: true },
      { id: 'lipid-pm', medicineId: 'lipid', time: '20:00', amount: 1, unit: 'unitPill', taken: true },
    ],
  },
  {
    date: '2026-09-17',
    updatedAt: '2026-09-17T12:02:00.000Z',
    doses: [
      { id: 'pressure-am', medicineId: 'pressure', time: '08:00', amount: 1, unit: 'unitPill', taken: true },
      { id: 'vitamin-d', medicineId: 'vitamin-d', time: '12:00', amount: 1, unit: 'unitCapsule', taken: true },
      { id: 'lipid-pm', medicineId: 'lipid', time: '20:00', amount: 1, unit: 'unitPill', taken: false },
    ],
  },
]

// Matches the planned API response shape. Replace this fixture with search results.
export const medicineCandidates = [
  { id: 'amlodipine5', strength: '5 mg', confidence: 94, image: amlodipine5Image },
  { id: 'norvasc5', strength: '5 mg', confidence: 87, image: norvasc5Image },
  { id: 'amlodipine10', strength: '10 mg', confidence: 72, image: amlodipine10Image },
]
import amlodipine5Image from '../assets/medicine/amlodipine-5.svg'
import amlodipine10Image from '../assets/medicine/amlodipine-10.svg'
import norvasc5Image from '../assets/medicine/norvasc-5.svg'
