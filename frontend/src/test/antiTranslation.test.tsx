/**
 * Anti-translation attribute tests — verify that the student exam interface
 * carries the correct signals to discourage browsers and translation tools
 * from translating English exam content into other languages.
 *
 * These tests do NOT require the backend; they render the components in jsdom
 * with stub props and inspect the resulting DOM.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── index.html static checks ─────────────────────────────────────────────────

describe('index.html anti-translation declarations', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');

  it('declares lang="en" on the <html> element', () => {
    expect(html).toMatch(/<html[^>]*\slang="en"/);
  });

  it('declares translate="no" on the <html> element', () => {
    expect(html).toMatch(/<html[^>]*\stranslate="no"/);
  });

  it('includes the Google notranslate meta tag', () => {
    expect(html).toMatch(/<meta\s+name="google"\s+content="notranslate"/);
  });
});

// ── ExamLayout container ─────────────────────────────────────────────────────

import { ExamLayout } from '@/layouts/ExamLayout';

describe('ExamLayout anti-translation attributes', () => {
  it('wraps student routes in a translate="no" container with lang="en"', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/exam/test-slug']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/exam/:slug" element={<div data-testid="inner">Exam content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('translate')).toBe('no');
    expect(root.getAttribute('lang')).toBe('en');
  });
});

// ── QuestionPrompt ───────────────────────────────────────────────────────────

import { QuestionPrompt } from '@/components/QuestionPrompt';

describe('QuestionPrompt anti-translation attributes', () => {
  it('marks rendered question text with translate="no"', () => {
    const { container } = render(
      <QuestionPrompt type="multiple_choice" text="Choose the correct verb form." />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThan(0);
    paragraphs.forEach(p => {
      expect(p.getAttribute('translate')).toBe('no');
    });
  });

  it('marks ordering question body text with translate="no"', () => {
    const { container } = render(
      <QuestionPrompt
        type="ordering"
        text="Header | Arrange the words to form a correct sentence."
      />,
    );
    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach(p => {
      expect(p.getAttribute('translate')).toBe('no');
    });
  });
});

// ── ExamStartPage ────────────────────────────────────────────────────────────

import { ExamStartPage } from '@/pages/student/ExamStartPage';

describe('ExamStartPage anti-translation attributes', () => {
  it('outer container has translate="no" when exam info is unavailable (empty state)', () => {
    // ExamStartPage fetches from the API; without a backend the load will
    // fail and it will render the "Exam Not Available" fallback. We can still
    // verify that the ExamLayout wrapper (tested above) provides translate="no"
    // for the whole student area.
    const { container } = render(
      <MemoryRouter initialEntries={['/exam/test']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/exam/:slug" element={<ExamStartPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    // The ExamLayout root always carries translate="no".
    const layoutRoot = container.firstElementChild as HTMLElement;
    expect(layoutRoot.getAttribute('translate')).toBe('no');
  });
});

// ── Student page static source checks ───────────────────────────────────────
// Verify that the source files contain translate="no" on the key content
// wrappers. This catches regressions where someone removes the attribute.

describe('Student page source files carry translate="no"', () => {
  const pages = [
    'ExamActivePage.tsx',
    'ExamStartPage.tsx',
    'ResultPage.tsx',
    'ReviewPage.tsx',
    'RankingPage.tsx',
  ];

  for (const page of pages) {
    it(`${page} contains translate="no"`, () => {
      const src = readFileSync(
        resolve(__dirname, `../pages/student/${page}`),
        'utf-8',
      );
      expect(src).toContain('translate="no"');
    });
  }

  it('QuestionPrompt.tsx contains translate="no"', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/QuestionPrompt.tsx'),
      'utf-8',
    );
    expect(src).toContain('translate="no"');
  });

  it('ExamActivePage.tsx marks MCQ option text with translate="no"', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/student/ExamActivePage.tsx'),
      'utf-8',
    );
    // The MCQ option text span must carry translate="no".
    expect(src).toMatch(/translate="no"[^>]*>\{opt\.text\}/);
  });

  it('ExamActivePage.tsx marks ordering tokens with translate="no"', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/student/ExamActivePage.tsx'),
      'utf-8',
    );
    // Ordering available token button has translate="no".
    expect(src).toMatch(/translate="no"[\s\S]*?\{tok\.text\}/);
  });

  it('ExamActivePage.tsx marks brackets sentence with translate="no"', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/student/ExamActivePage.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/data-testid="brackets-sentence"[\s\S]*?translate="no"/);
  });
});
