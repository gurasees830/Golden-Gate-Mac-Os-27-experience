import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  appName: string;
  onClose?: () => void;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Keeps one crashing app from taking down the whole desktop. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.appName}] crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center app-surface">
        <AlertTriangle size={40} className="text-[#ff9f0a]" />
        <div className="text-[15px] font-semibold">{this.props.appName} quit unexpectedly.</div>
        <div className="text-[12px] muted max-w-[360px] selectable">{this.state.error.message}</div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Reopen
          </button>
          {this.props.onClose && (
            <button className="btn primary" onClick={this.props.onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }
}
