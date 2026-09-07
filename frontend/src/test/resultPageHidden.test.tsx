/**
 * H1 UI regression: when the exam's result_visibility is OFF the backend
 * refuses the student result call (403). The result page must render a
 * friendly, information-safe "no results shown" state instead of an error blob
 * or an accidental score leak.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/api/attempts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/attempts')>();
  return {
    ...actual,
    getAttemptToken: () => 'stored-token',
    attemptsApi: {
      ...actual.attemptsApi,
      result: vi.fn().mockRejectedValue({
        message: 'Result visibility is disabled for this exam.',
      }),
    },
  };
});

import { ResultPage } from '@/pages/student/ResultPage';

function renderResultPage() {
  render(
    <MemoryRouter initialEntries={['/attempt/abc/result']}>
      <Routes>
        <Route path="/attempt/:id/result" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Result page when the teacher hides results (H1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a graceful submitted-confirmation instead of the score or an error', async () => {
    renderResultPage();
    await screen.findByText('Exam Submitted', undefined, { timeout: 5000 });
    expect(screen.getByText(/does not show results to students/i)).toBeTruthy();
    // No numeric score is ever rendered.
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
