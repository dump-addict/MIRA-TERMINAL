import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'
import { platform } from './platform'

// styles that depend on the platform (the title bar) read it from here
document.documentElement.dataset.platform = platform

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
