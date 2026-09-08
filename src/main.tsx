import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Kidboard } from './Kidboard'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ height: '100vh', padding: 10, boxSizing: 'border-box' }}>
      <Kidboard />
    </div>
  </StrictMode>,
)
