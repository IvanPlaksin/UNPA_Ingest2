import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// i18n → identity, so we assert on stable keys.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

// Store hooks are mocked; we assert the controlAction the renderer emits.
const sendControlAction = vi.fn();
vi.mock('../../store/chat-store', () => ({
  useUI: () => ({ loading: false }),
  useChatActions: () => ({ sendControlAction }),
}));

// Deterministic directory endpoint for AutocompleteControl.
vi.mock('../../../../config/api.config', () => ({ API_BASE_URL: 'http://test/api/v1' }));

import ControlRenderer from '../ControlRenderer.jsx';

beforeEach(() => { sendControlAction.mockReset(); });

describe('FE-001 ControlRenderer', () => {
  it('renders a choice control and emits a select controlAction', () => {
    const controls = [{
      id: 'ctrl-urgency', type: 'choice', slotId: 'urgency', label: 'How urgent?',
      options: [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }],
    }];
    render(<ControlRenderer controls={controls} />);
    expect(screen.getByText('How urgent?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('High'));
    expect(sendControlAction).toHaveBeenCalledWith(
      { controlId: 'ctrl-urgency', slotId: 'urgency', action: 'select', value: 'high' }, 'High');
  });

  it('renders the I-2c service disambiguation (a choice over serviceIds)', () => {
    const controls = [{
      id: 'ctrl-serviceDisambiguation', type: 'choice', slotId: '__service__', label: 'Which service do you need?',
      options: [
        { value: 'EO-HR-SP-PD-RMCU', label: 'Record Marriage / Civil Union' },
        { value: 'EO-HR-SP-PD-RD', label: 'Record Divorce' },
      ],
    }];
    render(<ControlRenderer controls={controls} />);
    fireEvent.click(screen.getByText('Record Marriage / Civil Union'));
    expect(sendControlAction).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: '__service__', action: 'select', value: 'EO-HR-SP-PD-RMCU' }),
      'Record Marriage / Civil Union');
  });

  it('confirm control emits a confirm controlAction, and reveals the search child on demand', () => {
    const controls = [{
      id: 'ctrl-beneficiary', type: 'confirm', slotId: 'beneficiary', label: 'For you?',
      defaultValue: { userId: 'U001', name: 'Me' },
      options: [{ value: 'U002', label: 'Ivanova' }],
      showChildrenOn: '_search',
      children: [{ id: 'ctrl-beneficiary-search', type: 'autocomplete', slotId: 'beneficiary', source: { directory: 'user', endpoint: '/api/v1/flowdesk/directory/user', minChars: 2 } }],
    }];
    render(<ControlRenderer controls={controls} />);
    fireEvent.click(screen.getByText('choice.yes'));
    expect(sendControlAction).toHaveBeenCalledWith(
      { controlId: 'ctrl-beneficiary', slotId: 'beneficiary', action: 'confirm', value: undefined }, 'choice.yes');
    // search child hidden until the Search trigger is clicked
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByText('choice.search'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('autocomplete debounces, fetches the directory, and a pick emits a submit controlAction', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => ({ results: [{ value: 'U005', label: 'Sidorov', sublabel: 's@un.org', meta: { email: 's@un.org' } }] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const controls = [{ id: 'ctrl-ac', type: 'autocomplete', slotId: 'beneficiary', source: { directory: 'user', endpoint: '/api/v1/flowdesk/directory/user', minChars: 2 } }];
    render(<ControlRenderer controls={controls} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sid' } });
    // Flush the 300ms debounce + the async fetch + the state update under fake timers.
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/flowdesk/directory/user?q=sid&limit=8'));

    const item = screen.getByText(/Sidorov/); // synchronous — results already rendered
    fireEvent.click(item);
    expect(sendControlAction).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: 'beneficiary', action: 'submit', value: { userId: 'U005', name: 'Sidorov', email: 's@un.org' } }),
      'Sidorov');
    vi.useRealTimers();
  });

  it('renders nothing for empty controls', () => {
    const { container } = render(<ControlRenderer controls={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
