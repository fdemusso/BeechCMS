// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClientiTestPage } from './examples/ClientiTestPage.js'
import './styles/beech-form.css'

function App() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '32px 16px' }}>
      <ClientiTestPage />
    </main>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
