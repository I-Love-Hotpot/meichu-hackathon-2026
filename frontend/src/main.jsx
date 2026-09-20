import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PhoneGate from './components/PhoneGate.jsx'
import './utils/i18n.js'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PhoneGate>
      <App />
    </PhoneGate>
  </StrictMode>,
)
