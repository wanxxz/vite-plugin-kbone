import { css } from '@linaria/core'
import React from 'react'
import { createRoot } from 'react-dom/client'

const className = css`color: red;`

export default function createApp() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  root.render(<div className={className}>@</div>)
}

if (import.meta.env.MODE === 'web') createApp()
// @ts-ignore
if (import.meta.env.MODE === 'mp') window.createApp = createApp
