import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as StrataApp } from './screens/App'
import './styles/theme.css'

interface RootErrorBoundaryProps {
	children: ReactNode
}

interface RootErrorBoundaryState {
	error_message: string | null
	error_stack: string | null
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
	state: RootErrorBoundaryState = { error_message: null, error_stack: null }

	static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
		return { error_message: error.message || 'Unknown renderer error', error_stack: error.stack || null }
	}

	componentDidCatch(error: Error) {
		console.error('Renderer boundary caught error:', error)
	}

	render() {
		if (this.state.error_message) {
			return (
				<div style={{ padding: 20, color: '#e6e9ec', background: '#0e1113', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', whiteSpace: 'pre-wrap' }}>
					<h2 style={{ marginTop: 0 }}>Strata failed to render</h2>
					<p>{this.state.error_message}</p>
					{this.state.error_stack && <pre style={{ marginTop: 16, fontSize: 12, overflowX: 'auto' }}>{this.state.error_stack}</pre>}
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
	console.error('Unhandled promise rejection in renderer:', event.reason)
})

window.addEventListener('error', (event) => {
	console.error('Global renderer error:', event.error || event.message)
})

createRoot(root_element).render(
	<StrictMode>
		<RootErrorBoundary>
			<StrataApp />
		</RootErrorBoundary>
	</StrictMode>,
)
