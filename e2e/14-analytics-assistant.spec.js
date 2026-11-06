// @ts-check
// The analytics assistant must answer questions typed in plain words, not only its suggestion buttons.
// The AI summary endpoint is answered with a fixed reply that echoes the question, so the test is fast and offline.
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

const TYPED_QUESTIONS = [
  'How many requests did we get this month?',
  'How many tickets are pending?',
  'Which service is requested the most?',
  'Who is the best technician?',
  'What is our total revenue?',
  'How many clients do we have?',
];

test.describe('Analytics assistant - typed questions', () => {
  test.describe.configure({ timeout: 180000 });

  test('14.1 - Everyday business questions are answered; greetings get help; unrelated requests are refused', async ({ page }) => {
    await seedAuthState(page, loadAuthStateFromBackend('superadmin_test'));
    await page.addInitScript(() => window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 })));
    const asked = [];
    await page.route('**/api/admin/analytics/ai-summary/**', async (route) => {
      const question = new URL(route.request().url()).searchParams.get('question') || '';
      asked.push(question);
      await route.fulfill({ json: { summary: `Answer about ${question}`, source: 'gemini', configured: true, analytics: {} } });
    });

    await page.goto('/admin/analytics');
    await page.getByRole('button', { name: 'Open analytics assistant' }).click();
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Analytics Assistant' }) });
    await expect(panel.getByRole('button', { name: 'Refresh assistant data' })).toBeEnabled({ timeout: 60000 });
    const input = panel.getByPlaceholder('Ask about analytics or forecasts...');
    await expect(input).toHaveAttribute('maxlength', '500');
    const send = async (text) => {
      await input.fill(text);
      await panel.getByRole('button', { name: 'Ask analytics assistant' }).click();
    };

    for (const question of TYPED_QUESTIONS) {
      await send(question);
      await expect(panel.getByText(`Answer about ${question}`)).toBeVisible();
    }
    expect(asked).toEqual(TYPED_QUESTIONS);

    await send('hello');
    await expect(panel.getByText(/Hello! Ask me about your AFN data/)).toBeVisible();
    await send('write me a poem about cats');
    await expect(panel.getByText(/I only answer from loaded analytics and dashboard data/).last()).toBeVisible();
    expect(asked).toEqual(TYPED_QUESTIONS); // neither the greeting nor the unrelated request reached the AI
    await page.screenshot({ path: 'test-results/screenshots/14-assistant-typed-questions.png' });
  });
  test('14.2 - Without the AI service the same questions still get real built-in answers', async ({ page }) => {
    await seedAuthState(page, loadAuthStateFromBackend('superadmin_test'));
    await page.addInitScript(() => window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 })));
    // The server answers the way it does when no Gemini key is set or the AI does not respond.
    await page.route('**/api/admin/analytics/ai-summary/**', (route) => route.fulfill({ json: { summary: 'local', source: 'local', configured: false, analytics: {} } }));
    await page.goto('/admin/analytics');
    await page.getByRole('button', { name: 'Open analytics assistant' }).click();
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Analytics Assistant' }) });
    await expect(panel.getByRole('button', { name: 'Refresh assistant data' })).toBeEnabled({ timeout: 60000 });
    const input = panel.getByPlaceholder('Ask about analytics or forecasts...');
    const expected = [
      ['How many requests did we get this month?', /service requests? in the selected period/],
      ['How many tickets are pending?', /active tickets? right now/],
      ['Which service is requested the most?', /requests?/],
      ['Who is the best technician?', /top performer|technician/i],
      ['What is our total revenue?', /confirmed sales?|No confirmed sales/],
      ['How many clients do we have?', /new clients? in the selected period/],
    ];
    for (const [question, answer] of expected) {
      await input.fill(question);
      await panel.getByRole('button', { name: 'Ask analytics assistant' }).click();
      await expect(panel.getByText('Reading the latest analytics and generating an answer...')).toHaveCount(0, { timeout: 30000 });
      const last = panel.locator('.bg-slate-50 > div').last();
      await expect(last).toContainText(answer);
      await expect(last).not.toContainText('I only answer from loaded analytics');
      await expect(last).not.toContainText('I do not have a prepared answer');
    }
    await page.screenshot({ path: 'test-results/screenshots/14-assistant-built-in-answers.png' });
  });
  test('14.3 - On every Analytics tab the assistant reads that tab and answers a question about it', async ({ page }) => {
    test.setTimeout(420000);
    const TABS = [
      ['overview', 'Overview', 'How many requests did we get this month?'],
      ['technicians', 'Technicians', 'Who is the best technician?'],
      ['demand', 'Demand', 'Which service is requested the most?'],
      ['sales', 'Sales', 'What is our total revenue?'],
      ['inventory', 'Inventory', 'Which inventory items are used the most?'],
      ['after_sales', 'After-Sales & Maintenance', 'How many open after-sales cases are there?'],
      ['forecasting', 'Forecasting', 'Is forecasting ready?'],
    ];
    await seedAuthState(page, loadAuthStateFromBackend('superadmin_test'));
    await page.addInitScript(() => window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 })));
    const aiCalls = [];
    await page.route('**/api/admin/analytics/ai-summary/**', async (route) => {
      const params = new URL(route.request().url()).searchParams;
      aiCalls.push({ workspace: params.get('workspace'), question: params.get('question') });
      await route.fulfill({ json: { summary: `Reply from the ${params.get('workspace')} workspace`, source: 'gemini', configured: true, analytics: {} } });
    });

    await page.goto('/admin/analytics');
    for (const [workspace, label, question] of TABS) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');

      // Opening the assistant on this tab loads this tab's analytics.
      const tabData = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname.endsWith('/api/admin/analytics/') && url.searchParams.get('workspace') === workspace;
      });
      await page.getByRole('button', { name: 'Open analytics assistant' }).click();
      await tabData;
      const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Analytics Assistant' }) });
      await expect(panel.getByText(`Reading: ${label} view`)).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Refresh assistant data' })).toBeEnabled({ timeout: 60000 });

      await panel.getByPlaceholder('Ask about analytics or forecasts...').fill(question);
      await panel.getByRole('button', { name: 'Ask analytics assistant' }).click();
      await expect(panel.getByText(`Reply from the ${workspace} workspace`)).toBeVisible();
      expect(aiCalls.at(-1)).toEqual({ workspace, question });
      await page.getByRole('button', { name: 'Close system assistant' }).click();
    }
    expect(aiCalls.map((call) => call.workspace)).toEqual(TABS.map(([workspace]) => workspace));
  });
  test('14.4 - On every Analytics tab the built-in answers work when the AI is unavailable', async ({ page }) => {
    test.setTimeout(420000);
    const TABS = [
      ['Overview', 'How many requests did we get this month?', /service requests? in the selected period/],
      ['Technicians', 'Who is the best technician?', /top performer|technician/i],
      ['Demand', 'Which service is requested the most?', /requests?/],
      ['Sales', 'What is our total revenue?', /confirmed sales?|No confirmed sales/],
      ['Inventory', 'Which inventory items are used the most?', /consumption|issued|item/i],
      ['After-Sales & Maintenance', 'How many open after-sales cases are there?', /after-sales status|open cases?|maintenance status/i],
      ['Forecasting', 'Is forecasting ready?', /forecast|history|requests? are needed/i],
    ];
    await seedAuthState(page, loadAuthStateFromBackend('superadmin_test'));
    await page.addInitScript(() => window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 })));
    await page.route('**/api/admin/analytics/ai-summary/**', (route) => route.fulfill({ json: { summary: 'local', source: 'local', configured: false, analytics: {} } }));
    await page.goto('/admin/analytics');
    for (const [label, question, answer] of TABS) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await page.getByRole('button', { name: 'Open analytics assistant' }).click();
      const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Analytics Assistant' }) });
      await expect(panel.getByRole('button', { name: 'Refresh assistant data' })).toBeEnabled({ timeout: 60000 });
      await panel.getByPlaceholder('Ask about analytics or forecasts...').fill(question);
      await panel.getByRole('button', { name: 'Ask analytics assistant' }).click();
      await expect(panel.getByText('Reading the latest analytics and generating an answer...')).toHaveCount(0, { timeout: 30000 });
      const last = panel.locator('.bg-slate-50 > div').last();
      await expect(last, label).toContainText(answer);
      await expect(last, label).not.toContainText('I only answer from loaded analytics');
      await expect(last, label).not.toContainText('I do not have a prepared answer');
      await page.getByRole('button', { name: 'Close system assistant' }).click();
    }
  });
});
