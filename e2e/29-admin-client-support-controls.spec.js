// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/client-support, for admin and superadmin, on a real case: a client
// writes, another staff member replies, the client writes again (so the case is waiting).
// Checked: Client waiting marker, summary cards and filter tabs, search, who-said-what in the
// thread, reply with Enter (case moves to In Review, focus stays), Mark in review, Resolve,
// Reopen, the resolved-case hint, and Refresh reporting a failure.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);

const accounts = [['admin_test', 'superadmin_test'], ['superadmin_test', 'admin_test']];

for (const [username, colleague] of accounts) {
  test.describe(`Client support controls as ${username}`, () => {
    test.describe.configure({ timeout: 240000 });

    test(`29 - ${username}: every Client Support control works`, async ({ page, request }) => {
      const clientAuth = loadAuthStateFromBackend('client_test');
      const colleagueAuth = loadAuthStateFromBackend(colleague);
      const auth = loadAuthStateFromBackend(username);
      const as = (who) => ({ Authorization: `Token ${who.token}` });
      const stamp = Date.now();
      const subject = `E2E support ${username} ${stamp}`;

      // ── A real case: client, then a colleague, then the client again ──
      const createdResponse = await request.post('/api/messages/support-cases/', {
        headers: as(clientAuth), data: { subject, category: 'technical', priority: 'high' },
      });
      expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
      const supportCase = await createdResponse.json();
      const say = async (who, text) => {
        const response = await request.post('/api/messages/', {
          headers: as(who), multipart: { room_type: 'group', group_key: supportCase.group_key, text },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      };
      await say(clientAuth, 'My inverter shows error E21.');
      await say(colleagueAuth, 'Thanks, we are checking the error code.');
      await say(clientAuth, 'It is still showing this morning.');
      const caseState = async () => list(await (await request.get('/api/messages/support-cases/', { headers: as(auth) })).json())
        .find((entry) => entry.id === supportCase.id);
      const code = supportCase.case_code || `SUP-${String(supportCase.id).padStart(4, '0')}`;

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/client-support');
      const caseList = page.getByRole('complementary', { name: 'Support cases' });
      const caseButton = caseList.getByRole('button', { name: new RegExp(subject) });
      await expect(caseButton).toBeVisible({ timeout: 30000 });
      await expect(caseButton).toContainText('Client waiting');

      // ── Summary card and tabs filter; search ──
      const cards = page.getByRole('region', { name: 'Client support summary' });
      await cards.getByRole('button', { name: /^Waiting for reply/ }).click();
      await expect(cards.getByRole('button', { name: /^Waiting for reply/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(caseList.getByRole('button', { name: 'Waiting for reply', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(caseButton).toBeVisible();
      await caseList.getByRole('button', { name: 'Closed', exact: true }).click();
      await expect(caseButton).toHaveCount(0);
      await caseList.getByRole('button', { name: 'All', exact: true }).click();
      const search = caseList.getByRole('searchbox', { name: 'Search support cases' });
      await search.fill(subject);
      await expect(caseList.getByRole('heading', { name: /Cases/ })).toContainText('(1)');
      await search.fill('zz-no-such-case');
      await expect(caseList.getByText('No support case matches "zz-no-such-case".')).toBeVisible();
      await search.fill(subject);

      // ── The thread shows who said what ──
      await caseButton.click();
      await expect(caseButton).toHaveAttribute('aria-current', 'true');
      const thread = page.getByLabel(`Conversation with ${supportCase.client_name}`);
      await expect(thread.getByText(/\(staff\)$/)).toBeVisible();
      await expect(thread).toContainText('Thanks, we are checking the error code.');

      // ── Reply with Enter: case moves to In Review, focus stays, no longer waiting ──
      const reply = page.getByRole('textbox', { name: `Reply to ${supportCase.client_name}` });
      await reply.fill('Please restart the inverter; a technician will call you.');
      await reply.press('Enter');
      await expect(page.getByRole('status')).toContainText(`Reply sent to ${supportCase.client_name}. ${code} is now In Review.`);
      await expect(reply).toHaveValue('');
      await expect(reply).toBeFocused();
      await expect(thread.getByText('You', { exact: true }).last()).toBeVisible();
      await expect(caseButton).not.toContainText('Client waiting');
      await expect.poll(async () => (await caseState()).status).toBe('in_review');

      // ── Resolve, the closed-case hint, Reopen, Mark in review ──
      await page.getByRole('button', { name: 'Resolve', exact: true }).click();
      await expect(page.getByRole('status')).toContainText(`${code} marked Resolved.`);
      await expect.poll(async () => (await caseState()).status).toBe('resolved');
      await expect(page.getByText('This case is resolved. A reply keeps it that way; use Reopen if more work is needed.')).toBeVisible();
      await page.getByRole('button', { name: 'Reopen', exact: true }).click();
      await expect(page.getByRole('status')).toContainText(`${code} marked Open.`);
      await page.getByRole('button', { name: 'Mark in review', exact: true }).click();
      await expect(page.getByRole('status')).toContainText(`${code} marked In Review.`);
      await expect.poll(async () => (await caseState()).status).toBe('in_review');

      // ── Refresh reports a failure instead of hiding it ──
      await page.route('**/api/messages/support-cases/**', (route) => route.fulfill({ status: 500, json: { detail: 'Support service unavailable' } }));
      await page.getByRole('button', { name: 'Refresh client support' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
}
