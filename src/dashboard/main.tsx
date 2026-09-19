import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/theme.css'

function Dashboard() {
  return (
    <div style={{ maxWidth: 620, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Dashboard coming in a later phase</h1>
      <p style={{ color: 'var(--tg-text-dim)', fontSize: 14, lineHeight: 1.6 }}>
        This is where the visual map lands: every group as a planet, sized by how many tabs it
        holds, expanding into its tabs when you click through.
      </p>
    </div>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Dashboard />
    </StrictMode>,
  )
}
