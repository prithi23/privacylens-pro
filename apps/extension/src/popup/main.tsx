import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';
import './styles.css';

class PopupBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main role="alert">
        <h1>The popup could not render.</h1>
        <p>Close and reopen it to reset the local view.</p>
        <button className="scan-button" onClick={() => location.reload()}>
          Reload popup
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupBoundary>
      <Popup />
    </PopupBoundary>
  </StrictMode>,
);
