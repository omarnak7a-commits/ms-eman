import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { APP_BUILD } from './lib/version'

// eslint-disable-next-line no-console
console.log('[EXAM DEBUG] App build', APP_BUILD)

const container = document.getElementById('root')

if (!container) {
  // Cannot happen with the shipped index.html, but a non-null assertion here
  // used to turn any mismatch into an unexplained blank page. Fail loudly.
  throw new Error('Mount point #root was not found in the document')
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
