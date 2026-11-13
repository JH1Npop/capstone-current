// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Private (direct) staff messages, end to end: an admin writes to a technician from the Messages page,
// the technician sees it in the conversation with that admin (with a date divider), the reply comes
// back, another technician cannot see either message, and a private message is not lost behind more
// than ten newer group messages (the server's default page size).

const bubbleFor = (page, text) => page.getByText(text, { exact: true }).and(page.locator('p'));

test.describe('Private messages', () => {
  test.describe.configure({ timeout: 240000 });

  test('44 - a private message reaches only its receiver and is not lost', async ({ browser, request }) => {
    const stamp = Date.now();
    const adminAuth = loadAuthStateFromBackend('admin_test');
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const techAuth = loadAuthStateFromBackend('tech_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });

    // A second technician, who must not see the conversation.
    const otherName = `other${stamp}`.toLowerCase();
    const created = await request.post('/api/admin/technicians/', {
      headers: as(superAuth),
      data: {
        username: otherName, email: `${otherName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Other', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const otherAuth = loadAuthStateFromBackend(otherName);

    const participants = async (auth) => {
      const response = await request.get('/api/messages/participants/', { headers: as(auth) });
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    const techEntry = (await participants(adminAuth)).find((entry) => entry.id === techAuth.user.id);
    const adminEntry = (await participants(techAuth)).find((entry) => entry.id === adminAuth.user.id);
    expect(techEntry, 'the technician is listed for the admin').toBeTruthy();
    expect(adminEntry, 'the admin is listed for the technician').toBeTruthy();
    const techName = techEntry.name || techEntry.username;
    const adminName = adminEntry.name || adminEntry.username;

    const openPage = async (auth, path) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto(path);
      await expect(page.getByRole('textbox', { name: 'Message Staff Group Chat' })).toBeVisible({ timeout: 30000 });
      return { context, page };
    };
    // On a phone the page opens in the group chat; the room list is behind "Open message rooms".
    const findRoom = async (page, name) => {
      await page.getByRole('button', { name: 'Open message rooms' }).click();
      await page.getByRole('textbox', { name: 'Search message rooms' }).fill(name);
      return page.getByRole('button', { name: new RegExp(name) }).first();
    };

    // ── The admin writes privately to the technician ──
    const privateText = `Private note for the technician ${stamp}`;
    const admin = await openPage(adminAuth, '/admin/messages');
    await (await findRoom(admin.page, techName)).click();
    const adminComposer = admin.page.getByRole('textbox', { name: `Message ${techName}` });
    await adminComposer.fill(privateText);
    await adminComposer.press('Enter');
    await expect(admin.page.getByRole('status')).toContainText(`Message sent to ${techName}.`);
    await expect(bubbleFor(admin.page, privateText)).toBeVisible();

    // ── Twelve newer group messages: more than the server's default page of ten ──
    for (let index = 0; index < 12; index += 1) {
      const response = await request.post('/api/messages/', {
        headers: as(superAuth),
        data: { room_type: 'group', group_key: 'staff', text: `Group filler ${index} ${stamp}` },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    // ── The technician finds it in the conversation with the admin, and replies ──
    const tech = await openPage(techAuth, '/technician/messages');
    const adminRoom = await findRoom(tech.page, adminName);
    await expect(adminRoom).toContainText(privateText);
    await adminRoom.click();
    await expect(bubbleFor(tech.page, privateText)).toBeVisible();
    await expect(tech.page.getByRole('separator', { name: 'Today' })).toBeVisible();
    // It is a private conversation, not the group chat.
    await expect(bubbleFor(tech.page, `Group filler 0 ${stamp}`)).toHaveCount(0);
    const replyText = `Reply from the technician ${stamp}`;
    const techComposer = tech.page.getByRole('textbox', { name: `Message ${adminName}` });
    await techComposer.fill(replyText);
    await techComposer.press('Enter');
    await expect(tech.page.getByRole('status')).toContainText(`Message sent to ${adminName}.`);

    // ── The reply reaches the admin's conversation ──
    await admin.page.reload();
    await expect(admin.page.getByRole('textbox', { name: 'Message Staff Group Chat' })).toBeVisible({ timeout: 30000 });
    await (await findRoom(admin.page, techName)).click();
    await expect(bubbleFor(admin.page, replyText)).toBeVisible({ timeout: 30000 });
    await expect(bubbleFor(admin.page, privateText)).toBeVisible();

    // ── Another technician sees neither message ──
    const other = await openPage(otherAuth, '/technician/messages');
    await expect(bubbleFor(other.page, `Group filler 11 ${stamp}`)).toBeVisible();
    const otherList = await request.get('/api/messages/', { headers: as(otherAuth), params: { page_size: 500 } });
    const otherTexts = ((await otherList.json()).results || []).map((item) => item.text);
    expect(otherTexts).not.toContain(privateText);
    expect(otherTexts).not.toContain(replyText);
    await expect(other.page.getByText(privateText)).toHaveCount(0);
    await expect(other.page.getByText(replyText)).toHaveCount(0);

    await Promise.all([admin.context.close(), tech.context.close(), other.context.close()]);
  });
});
