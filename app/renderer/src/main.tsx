import { runtimeErrorCode } from '@shared/runtimeLogging'
import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as StrataApp } from './screens/App'
import './styles/theme.css'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  error_message: string | null
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { error_message: null }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error_message: runtimeErrorCode(error) }
  }

  componentDidCatch(error: Error) {
    console.error('Renderer boundary caught error:', runtimeErrorCode(error))
  }

  render() {
    if (this.state.error_message) {
      return (
        <div
          style={{
            padding: 20,
            color: '#e6e9ec',
            background: '#0e1113',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            whiteSpace: 'pre-wrap',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Strata failed to render</h2>
          <p>Restart Strata to reopen the workspace.</p>
          <p>Error code: {this.state.error_message}</p>
        </div>
      )
    }

    return this.props.children
  }
}

const root_element = document.getElementById('root')

if (!root_element) {
  throw new Error('Renderer root element "#root" was not found.')
}

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
  console.error('Unhandled promise rejection in renderer:', runtimeErrorCode(event.reason))
})

window.addEventListener('error', (event) => {
  event.preventDefault()
  console.error('Global renderer error:', runtimeErrorCode(event.error))
})

createRoot(root_element, {
  onCaughtError: () => {}, // The boundary records a sanitized failure.
  onUncaughtError: (error) => console.error('Uncaught renderer error:', runtimeErrorCode(error)),
  onRecoverableError: (error) => console.warn('Recoverable renderer error:', runtimeErrorCode(error)),
}).render(
  <RootErrorBoundary>
    <StrataApp />
  </RootErrorBoundary>,
)
