import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 挂载节点')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
