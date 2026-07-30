import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// i18n → identity, so we assert on stable keys.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

const sendControlAction = vi.fn();
vi.mock('../../store/chat-store', () => ({
  useUI: () => ({ loading: false }),
  useChatActions: () => ({ sendControlAction }),
}));

import ReviewTable from '../ReviewTable.jsx';

const REVIEW = {
  title: 'Extension of Appointment & Assignment',
  groups: [
    {
      section: 'staffMemberInformation', label: 'Staff Member Information',
      rows: [
        { slotId: 'indexNumber', label: 'Index Number', display: '12345678', editable: true },
        { slotId: 'grade', label: 'Grade', display: 'P-4', editable: false },
      ],
    },
    {
      section: 'fundingInformation', label: 'Funding Information',
      rows: [{ slotId: 'wbseFundCode', label: 'WBSE / Fund Code', display: 'S-1234-5678', editable: true }],
    },
  ],
};

beforeEach(() => { sendControlAction.mockReset(); });

describe('ReviewTable', () => {
  it('renders groups with section headings, field labels and values', () => {
    render(<ReviewTable review={REVIEW} />);
    expect(screen.getByText('Staff Member Information')).toBeTruthy();
    expect(screen.getByText('Funding Information')).toBeTruthy();
    expect(screen.getByText('Index Number')).toBeTruthy();
    expect(screen.getByText('12345678')).toBeTruthy();
    expect(screen.getByText('WBSE / Fund Code')).toBeTruthy();
  });

  it('shows an edit button only for editable rows', () => {
    render(<ReviewTable review={REVIEW} />);
    // indexNumber + wbseFundCode editable → 2 edit buttons; grade is reference-derived → none
    const editButtons = screen.getAllByRole('button');
    expect(editButtons).toHaveLength(2);
  });

  it('clicking ✎ sends an edit controlAction for that slot', () => {
    render(<ReviewTable review={REVIEW} />);
    fireEvent.click(screen.getAllByLabelText('review.editField')[0]); // first editable row (index number)
    expect(sendControlAction).toHaveBeenCalledTimes(1);
    expect(sendControlAction.mock.calls[0][0]).toMatchObject({ slotId: 'indexNumber', action: 'edit' });
  });

  it('is read-only (no edit buttons) when interactive=false', () => {
    render(<ReviewTable review={REVIEW} interactive={false} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders nothing for an empty review', () => {
    const { container } = render(<ReviewTable review={{ title: 'x', groups: [] }} />);
    expect(container.firstChild).toBeNull();
  });
});
