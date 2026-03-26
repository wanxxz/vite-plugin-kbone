import React from 'react'
import { createRoot } from 'react-dom/client'

export default function createApp() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  root.render(<div className='text-red-900'>@</div>)
}

if (import.meta.env.MODE === 'web') createApp()
// @ts-ignore
if (import.meta.env.MODE === 'mp') window.createApp = createApp
