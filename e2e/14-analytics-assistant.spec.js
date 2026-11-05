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
});
