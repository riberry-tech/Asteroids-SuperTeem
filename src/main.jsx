import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MpApp from './MpApp.jsx'

const mp = new URLSearchParams(window.location.search).has('mp')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {mp ? <MpApp /> : <App />}
  </StrictMode>,
)
