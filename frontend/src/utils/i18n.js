import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import translationENUS from '../assets/locales/en-US/translation.json'
import translationZHTW from '../assets/locales/zh-TW/translation.json'

const resources = {
  'zh-TW': {
    translation: translationZHTW,
  },
  'en-US': {
    translation: translationENUS,
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['zh-TW', 'en-US'],
    fallbackLng: 'zh-TW',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'medaboutyou-language',
      convertDetectedLanguage: (language) => (
        language?.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en-US'
      ),
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
