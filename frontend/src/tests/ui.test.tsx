import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Toggle, Segmented } from '../components/ui';
import { useSettings, resolvedTheme } from '../stores/settings';

describe('UI controls', () => {
  it('Toggle exposes switch semantics and flips state', async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Toggle on={on} onChange={setOn} label="Wi-Fi" />;
    }
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: 'Wi-Fi' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
  it('Segmented reports the selected option', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        value="light"
        onChange={onChange}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Light' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('settings store', () => {
  it('appearance changes resolve to a concrete theme', () => {
    useSettings.getState().patch('appearance', 'dark');
    expect(resolvedTheme(useSettings.getState().appearance)).toBe('dark');
    useSettings.getState().patch('appearance', 'light');
    expect(resolvedTheme(useSettings.getState().appearance)).toBe('light');
  });
});
