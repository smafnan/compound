import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { bootstrapStorage } from './native'
import './styles.css'

// restore durable native storage (no-op on the web) before first render
bootstrapStorage().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
