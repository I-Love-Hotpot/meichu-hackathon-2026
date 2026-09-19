import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import translationENUS from '../assets/locales/en-US/translation.json'

const resources = {
  'en-US': {
    translation: translationENUS,
  },
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en-US',
    supportedLngs: ['en-US'],
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
