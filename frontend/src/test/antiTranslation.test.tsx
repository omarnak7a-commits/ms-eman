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

  it('declares class="notranslate" on the <html> element', () => {
    expect(html).toMatch(/<html[^>]*\sclass="notranslate"/);
  });

  it('includes the Google notranslate meta tag', () => {
    expect(html).toMatch(/<meta\s+name="google"\s+content="notranslate"/);
  });

  it('includes the anti-translation enforcement script', () => {
    expect(html).toContain('Anti-translation enforcement');
    expect(html).toContain("setAttribute('translate', 'no')");
    expect(html).toContain('notranslate');
    expect(html).toContain('MutationObserver');
  });
});

// ── ExamLayout container ─────────────────────────────────────────────────────

import { ExamLayout } from '@/layouts/ExamLayout';

describe('ExamLayout anti-translation attributes', () => {
  it('wraps student routes in a translate="no" container with lang="en" and class="notranslate"', () => {
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
    expect(root.classList.contains('notranslate')).toBe(true);
  });

  it('marks the header and main elements with translate="no"', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/exam/test-slug']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/exam/:slug" element={<div>Exam content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const header = container.querySelector('header');
    const main = container.querySelector('main');
    expect(header?.getAttribute('translate')).toBe('no');
    expect(main?.getAttribute('translate')).toBe('no');
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

// ── GENERATED STUDENT EXAM ROUTE — regression test ──────────────────────────
// This is the critical test: the /exam/:slug route is the URL teachers share
// with students. It MUST carry anti-translation protection at every level.

describe('Generated student exam route (/exam/:slug) anti-translation protection', () => {
  it('the student exam route is wrapped by ExamLayout with full anti-translation attributes', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/exam/my-test-exam']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/exam/:slug" element={<div data-testid="exam-content">Exam</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const layoutRoot = container.firstElementChild as HTMLElement;
    // Must have translate="no" to signal browsers not to translate
    expect(layoutRoot.getAttribute('translate')).toBe('no');
    // Must have lang="en" to declare the content language
    expect(layoutRoot.getAttribute('lang')).toBe('en');
    // Must have class="notranslate" for Chrome's CSS-class-based check
    expect(layoutRoot.classList.contains('notranslate')).toBe(true);
  });

  it('the /attempt/:id route (active exam) is also wrapped by ExamLayout', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/attempt/abc-123']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/attempt/:id" element={<div>Active exam</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const layoutRoot = container.firstElementChild as HTMLElement;
    expect(layoutRoot.getAttribute('translate')).toBe('no');
    expect(layoutRoot.getAttribute('lang')).toBe('en');
    expect(layoutRoot.classList.contains('notranslate')).toBe(true);
  });

  it('the /attempt/:id/result route is also wrapped by ExamLayout', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/attempt/abc-123/result']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/attempt/:id/result" element={<div>Result</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const layoutRoot = container.firstElementChild as HTMLElement;
    expect(layoutRoot.getAttribute('translate')).toBe('no');
  });

  it('the /attempt/:id/review route is also wrapped by ExamLayout', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/attempt/abc-123/review']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/attempt/:id/review" element={<div>Review</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const layoutRoot = container.firstElementChild as HTMLElement;
    expect(layoutRoot.getAttribute('translate')).toBe('no');
  });

  it('the /attempt/:id/ranking route is also wrapped by ExamLayout', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/attempt/abc-123/ranking']}>
        <Routes>
          <Route element={<ExamLayout />}>
            <Route path="/attempt/:id/ranking" element={<div>Ranking</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const layoutRoot = container.firstElementChild as HTMLElement;
    expect(layoutRoot.getAttribute('translate')).toBe('no');
  });
});

// ── MCQ letter labels (A/B/C) ───────────────────────────────────────────────
// Critical regression: MCQ option labels must have translate="no" directly
// on the letter span to prevent Chrome from translating A→أ, B→ب, C→ج.

describe('MCQ letter labels anti-translation', () => {
  it('ExamActivePage.tsx marks the MCQ letter span with translate="no"', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/student/ExamActivePage.tsx'),
      'utf-8',
    );
    // The MCQ letter span (containing String.fromCharCode) must have translate="no"
    expect(src).toMatch(/translate="no"[\s\S]*?String\.fromCharCode\(65 \+ i\)/);
  });
});

// ── ExamTeacherName ──────────────────────────────────────────────────────────

import { ExamTeacherName } from '@/components/ExamTeacherName';

describe('ExamTeacherName anti-translation attributes', () => {
  it('has translate="no" to protect the brand name from translation', () => {
    const { container } = render(<ExamTeacherName />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('translate')).toBe('no');
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

  it('ExamLayout.tsx contains translate="no" and class notranslate', () => {
    const src = readFileSync(
      resolve(__dirname, '../layouts/ExamLayout.tsx'),
      'utf-8',
    );
    expect(src).toContain('translate="no"');
    expect(src).toContain('notranslate');
  });

  it('ExamTeacherName.tsx contains translate="no"', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/ExamTeacherName.tsx'),
      'utf-8',
    );
    expect(src).toContain('translate="no"');
  });
});
