import KioskEntryShell from "./KioskEntryShell.jsx";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <KioskEntryShell />
  </StrictMode>,
)
