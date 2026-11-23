import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { runStartupChecks } from './services/recovery/startup'
import { RecoveryBoundary } from './features/recovery/RecoveryBoundary'

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Check (and if needed repair) saved data BEFORE any store reads it — see
// services/recovery/startup.ts. Only then load the app.
runStartupChecks()
  .catch(() => undefined)
  .then(() => import('./App'))
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <RecoveryBoundary area="STANLEY" variant="app">
          <App />
        </RecoveryBoundary>
      </React.StrictMode>,
    )
  })
  .catch((error: unknown) => {
    // The app itself couldn't load (e.g. a file failed to download) — still explain it plainly.
    const Thrower = () => {
      throw error
    }
    root.render(
      <RecoveryBoundary area="STANLEY" variant="app">
        <Thrower />
      </RecoveryBoundary>,
    )
  })
