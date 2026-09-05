import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { APP_BUILD } from './lib/version'

// eslint-disable-next-line no-console
console.log('[EXAM DEBUG] App build', APP_BUILD)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
