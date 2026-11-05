// @ts-check
// Button-by-button checks for the admin Calendar and Documents pages: the controls the older specs do not exercise
// (stage switching, ticket-gated actions, Reset, row add/remove, zoom, paper size, Print, Save specs, Clear filters,
// Include completed, month navigation, day and job dialogs, and the unsaved-availability confirmation).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState, visitWorkspacePage } from './helpers';

const STAGES = [
  'TDS - Technical Data Sheet',
  'Quotation Proposal',
  'Solar Installation Contract',
  'PV Solar Site Commissioning Checklist',
  'Turnover / Acceptance Form',
  'Field Service Report',
];

// Reads word/document.xml out of a .docx buffer (zip central directory + raw deflate), so a test can check the text
// that the backend really wrote into a generated Word file.
function docxText(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === 'word/document.xml') {
      const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(start, start + compressedSize);
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
      return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('word/document.xml not found in the downloaded file');
}

let adminAuthState;

test.describe('Admin Documents and Calendar - controls', () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeAll(() => {
    adminAuthState = loadAuthStateFromBackend('superadmin_test');
  });

  test.beforeEach(async ({ page }) => {
    await seedAuthState(page, adminAuthState);
    // Park the movable assistant button top-left so it never covers the controls under test.
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
  });

  async function pickFirstTicket(page) {
    await page.getByPlaceholder(/search ticket by id/i).click();
    const first = page.getByRole('button', { name: /TKT-\d+/ }).first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
  }

  const monthLabel = (page) => page.getByRole('heading', { level: 3, name: /^[A-Z][a-z]+ 20\d\d$/ });
  const showing = (page) => page.getByText(/^Showing \d+ of \d+ events?$/);

  // ------------------------------------------------------------------ Documents

  test('12.1 - Every document stage button switches the editor', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    for (const stage of STAGES) {
      await page.getByRole('button', { name: stage, exact: true }).click();
      await expect(page.getByRole('button', { name: stage, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    // Only one stage is active at a time.
    await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: /TDS|Quotation|Contract|Commissioning|Turnover|Service Report/ })).toHaveCount(1);
  });

  test('12.2 - Save draft, Save specs and Generate stay disabled until a ticket is chosen, then enable', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    const saveDraft = page.getByRole('button', { name: 'Save draft' });
    const saveSpecs = page.getByRole('button', { name: 'Save specs to ticket' });
    const generate = page.getByRole('button', { name: 'Generate active design' });
    await expect(saveDraft).toBeDisabled();
    await expect(saveSpecs).toBeDisabled();
    await expect(generate).toBeDisabled();
    await pickFirstTicket(page);
    await expect(saveDraft).toBeEnabled();
    await expect(saveSpecs).toBeEnabled();
    await expect(generate).toBeEnabled();
  });

  test('12.3 - Save draft, Save specs to ticket and Generate work on the Service Report', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    await pickFirstTicket(page);

    const draftResponse = page.waitForResponse((r) => r.url().includes('/document-draft/') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await draftResponse).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toContainText(/draft saved/i);

    await page.getByRole('button', { name: 'Save specs to ticket' }).click();
    await expect(page.getByRole('status')).toContainText(/Project specifications permanently saved|No project specifications are filled in/);

    const generated = page.waitForResponse((r) => r.url().includes('/generate-document/') && r.request().method() === 'POST');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate active design' }).click();
    expect((await generated).ok()).toBeTruthy();
    expect((await download).suggestedFilename()).toMatch(/\.docx$/i);
    expect(errors).toEqual([]);
  });

  test('12.4 - Reset puts the ticket-filled values back', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    await pickFirstTicket(page);
    const client = page.locator('label:has(> span:text-is("Client")) textarea').first();
    await expect(client).toBeVisible();
    const original = await client.inputValue();
    await client.fill('E2E changed client name');
    await expect(client).toHaveValue('E2E changed client name');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(client).toHaveValue(original);
  });

  test('12.5 - Add row and Remove row change the table', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    const removeButtons = page.getByRole('button', { name: 'Remove row' });
    const before = await removeButtons.count();
    expect(before).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Add row' }).first().click();
    await expect(removeButtons).toHaveCount(before + 1);
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(before);
  });

  test('12.6 - Zoom out, Zoom in and Fit change the preview size; paper size can be changed', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    const zoom = page.getByRole('group', { name: 'Preview zoom' });
    const percent = async () => Number((await zoom.innerText()).match(/(\d+)%/)?.[1]);
    const fitPercent = await percent();
    await zoom.getByRole('button', { name: 'Zoom out' }).click();
    const smaller = await percent();
    expect(smaller).toBeLessThan(fitPercent);
    await zoom.getByRole('button', { name: 'Zoom in' }).click();
    await zoom.getByRole('button', { name: 'Zoom in' }).click();
    expect(await percent()).toBeGreaterThan(smaller);
    await zoom.getByRole('button', { name: 'Fit to width' }).click();
    await expect(zoom).toContainText('Fit');
    for (const paper of ['a4', 'long', 'letter']) {
      await page.getByLabel('Paper').selectOption(paper);
      await expect(page.getByLabel('Paper')).toHaveValue(paper);
      await expect(page.getByText('Editor preview')).toBeVisible();
    }
  });

  test('12.7 - Print opens the printable document', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveTitle('AFN Document');
    await expect(popup.locator('body')).toContainText('Field Service Report');
  });

  test('12.8 - Fill template, Replace design and Template library open and close', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    for (const [opener, dialogName, closer, closesOnEscape] of [
      ['Fill template', 'Fill a document', 'Close document filling', true],
      // The replacement wizard has no Escape handler (the other two dialogs do), so only its Close button is tested.
      ['Replace design', 'Use a new Word or PDF design', 'Close replacement wizard', false],
      ['Template library', 'Document templates', 'Close template manager', true],
    ]) {
      await page.getByRole('button', { name: opener, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: dialogName });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: closer }).click();
      await expect(dialog).toBeHidden();
      await page.getByRole('button', { name: opener, exact: true }).click();
      await expect(dialog).toBeVisible();
      if (closesOnEscape) {
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } else {
        await dialog.getByRole('button', { name: closer }).click();
        await expect(dialog).toBeHidden();
      }
    }
  });

  test('12.8b - A ticket with saved service reports lists them in Service Report Source without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/services/service-tickets/*/document-prefill/', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.field_service_reports = [{ id: 9001, created_at: '2026-11-05T01:00:00Z' }, { id: 9002 }];
      await route.fulfill({ response, json: payload });
    });
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    await pickFirstTicket(page);
    const source = page.getByLabel('Service Report Source');
    await expect(source).toBeVisible();
    await expect(source.locator('option').nth(1)).toHaveText(/^Report 1 - \d{4}-\d{2}-\d{2}$/);
    await expect(source.locator('option').nth(2)).toHaveText('Report 2');
    expect(errors).toEqual([]);
  });


  test('12.16 - A new document template made with the buttons becomes a document and generates a real Word file', async ({ page }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visitWorkspacePage(page, '/admin/documents');
    const stageRail = page.getByRole('navigation', { name: 'Document templates' });
    await expect(stageRail.getByRole('button', { name: /E2E Maintenance Certificate/ })).toHaveCount(0);

    // 1. Register a new document type in the template library.
    await page.getByRole('button', { name: 'Template library' }).click();
    const manager = page.getByRole('dialog', { name: 'Document templates' });
    await expect(manager).toBeVisible();
    await manager.getByRole('button', { name: 'New document type' }).click();
    const registration = manager.locator('form').filter({ hasText: 'AFN record used to fill it' });
    await registration.getByLabel('Document name').fill('E2E Maintenance Certificate');
    await registration.getByLabel('Description').fill('Made by the browser test.');
    await registration.getByRole('button', { name: 'Create document type' }).click();
    await expect(manager.getByRole('status')).toContainText('Custom document registered as inactive');
    await page.screenshot({ path: 'test-results/screenshots/12-template-1-registered.png' });

    // 2. Upload a Word design written with plain names ([Client Name], [E2E Note]) and save it.
    await manager.getByLabel('Design name').fill('E2E Certificate Design');
    await manager.locator('input[type="file"]').setInputFiles('e2e/fixtures/e2e-maintenance-certificate.docx');
    await manager.getByRole('button', { name: 'Save new design' }).click();
    await expect(manager.getByRole('status')).toContainText('Template saved');

    // 3. The checklist says in plain words what was found and offers the one new field with one click.
    const checklist = manager.getByRole('region', { name: 'Design checklist' });
    await expect(checklist).toContainText('1 field(s) found');
    await expect(checklist).toContainText('New fields to add');
    await expect(checklist).toContainText('E2E Note');
    await page.screenshot({ path: 'test-results/screenshots/12-template-2-checklist.png' });
    await checklist.getByRole('button', { name: 'Add as fields' }).click();
    await expect(manager.getByRole('status')).toContainText('Fields added');
    await expect(checklist).toContainText('This design is ready to use');
    await expect(checklist).not.toContainText('New fields to add');
    await page.screenshot({ path: 'test-results/screenshots/12-template-2b-fields-added.png' });

    // 4. One click makes it the design in use and switches the document on.
    await manager.getByRole('button', { name: 'Use this design' }).click();
    await expect(manager.getByRole('status')).toContainText('is now the design in use');
    await expect(manager.getByText('enabled', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/12-template-3-activated.png' });
    await manager.getByRole('button', { name: 'Close template manager' }).click();
    await expect(manager).toBeHidden();

    // 5. The new document now sits next to the six built-in ones.
    const newStage = stageRail.getByRole('button', { name: /E2E Maintenance Certificate/ });
    await expect(newStage).toBeVisible();
    await pickFirstTicket(page);
    await newStage.click();
    const workspace = page.getByRole('dialog', { name: 'Fill a document' });
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('combobox').first()).toContainText('E2E Maintenance Certificate');
    await expect(workspace.getByRole('combobox').nth(1)).toContainText('E2E Certificate Design');
    await workspace.getByLabel('E2E note').fill('Certified by the E2E suite');
    await page.screenshot({ path: 'test-results/screenshots/12-template-4-fill.png' });

    // 6. Save the draft, then generate the Word file and read it.
    await workspace.getByRole('button', { name: 'Save draft' }).click();
    await expect(workspace.getByRole('status')).toContainText(/saved/i);
    const download = page.waitForEvent('download');
    await workspace.getByRole('button', { name: /^Generate/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.docx$/i);
    const target = 'test-results/screenshots/12-template-generated.docx';
    await file.saveAs(target);
    const text = docxText(fs.readFileSync(target));
    expect(text).toContain('Certified by the E2E suite');
    expect(text).toContain('Test Client');
    expect(text).not.toContain('{{');
    expect(errors).toEqual([]);
  });

  // ------------------------------------------------------------------ Calendar

  test('12.9 - Previous, Next and Today move through the months', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar');
    const label = monthLabel(page);
    const current = await label.innerText();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(label).not.toHaveText(current);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(label).toHaveText(current);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(label).not.toHaveText(current);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(label).toHaveText(current);
  });

  test('12.17 - The fields list copies plain names and the design and starter files download', async ({ page, context }) => {
    test.setTimeout(120000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Template library' }).click();
    const manager = page.getByRole('dialog', { name: 'Document templates' });
    await expect(manager).toBeVisible();

    // A built-in document: plain names with Copy, repeating tables listed apart, a download of the design in use, no blank starter.
    const fields = manager.getByRole('region', { name: 'Fields you can use' });
    await expect(fields).toBeVisible();
    await expect(fields).toContainText('[Client Name]');
    await expect(fields.getByRole('button', { name: 'Download a blank starter file' })).toHaveCount(0);
    await fields.getByRole('button', { name: 'Copy [Client Name]' }).click();
    await expect(manager.getByRole('status')).toContainText('Copied [Client Name]');
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '[Client Name]');
    expect(copied).toBe('[Client Name]');
    // A built-in document offers its design in use, or AFN's original design while it still uses the built-in layout.
    const designDownload = fields.getByRole('button', { name: /^Download the (design in use|original design)$/ });
    await expect(designDownload).toHaveCount(1);
    const [download] = await Promise.all([page.waitForEvent('download'), designDownload.click()]);
    expect(download.suggestedFilename()).toMatch(/\.docx$/i);

    // A new document type gets a blank starter that lists its fields in plain form.
    await manager.getByRole('button', { name: 'New document type' }).click();
    const registration = manager.locator('form').filter({ hasText: 'AFN record used to fill it' });
    await registration.getByLabel('Document name').fill('E2E Starter Document');
    await registration.getByLabel('Description').fill('Starter file test.');
    await registration.getByRole('button', { name: 'Create document type' }).click();
    await expect(manager.getByRole('status')).toContainText('Custom document registered as inactive');
    await manager.getByLabel('Design name').fill('E2E Starter Design');
    await manager.locator('input[type="file"]').setInputFiles('e2e/fixtures/e2e-maintenance-certificate.docx');
    await manager.getByRole('button', { name: 'Save new design' }).click();
    await expect(manager.getByRole('status')).toContainText('Template saved');
    const starterButton = manager.getByRole('region', { name: 'Fields you can use' }).getByRole('button', { name: 'Download a blank starter file' });
    await expect(starterButton).toBeVisible();
    const [starter] = await Promise.all([page.waitForEvent('download'), starterButton.click()]);
    expect(starter.suggestedFilename()).toMatch(/starter\.docx$/i);
    await page.screenshot({ path: 'test-results/screenshots/12-template-4-fields-you-can-use.png' });
    expect(errors).toEqual([]);
  });

  test('12.18 - A finished Word design with blank lines becomes fields with one click and keeps the original', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Template library' }).click();
    const manager = page.getByRole('dialog', { name: 'Document templates' });
    await manager.getByRole('button', { name: 'New document type' }).click();
    const registration = manager.locator('form').filter({ hasText: 'AFN record used to fill it' });
    await registration.getByLabel('Document name').fill('E2E Finished Certificate');
    await registration.getByLabel('Description').fill('Blank lines test.');
    await registration.getByRole('button', { name: 'Create document type' }).click();
    await expect(manager.getByRole('status')).toContainText('Custom document registered as inactive');
    await manager.getByLabel('Design name').fill('E2E Finished Design');
    await manager.locator('input[type="file"]').setInputFiles('e2e/fixtures/e2e-finished-certificate.docx');
    await manager.getByRole('button', { name: 'Save new design' }).click();
    await expect(manager.getByRole('status')).toContainText('Template saved');

    const offer = manager.getByRole('region', { name: 'Design checklist' });
    await expect(offer).toContainText('Blanks that can become fields');
    await expect(offer).toContainText('Client Name');
    await expect(offer).toContainText('Ticket Number');
    await expect(offer).not.toContainText('Remarks');
    await page.screenshot({ path: 'test-results/screenshots/12-template-5-blanks-offered.png' });
    await offer.getByRole('button', { name: 'Fill these blanks' }).click();
    await expect(manager.getByRole('status')).toContainText('Blanks filled');

    // The original stays; the new version has the fields and is ready to use.
    await expect(manager.locator('article')).toHaveCount(2);
    const filled = manager.locator('article').filter({ hasText: 'Filled blanks from version 1' });
    await expect(filled).toContainText('This design is ready to use');
    await filled.getByRole('button', { name: 'Use this design' }).click();
    await expect(manager.getByRole('status')).toContainText('is now the design in use');
    await page.screenshot({ path: 'test-results/screenshots/12-template-6-blanks-filled.png' });
    expect(errors).toEqual([]);
  });

  test('12.19 - A text PDF gets fields placed after its labels with one click and can be used', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Template library' }).click();
    const manager = page.getByRole('dialog', { name: 'Document templates' });
    await manager.getByRole('button', { name: 'New document type' }).click();
    const registration = manager.locator('form').filter({ hasText: 'AFN record used to fill it' });
    await registration.getByLabel('Document name').fill('E2E PDF Site Form');
    await registration.getByLabel('Description').fill('PDF suggestions test.');
    await registration.getByRole('button', { name: 'Create document type' }).click();
    await expect(manager.getByRole('status')).toContainText('Custom document registered as inactive');
    await manager.getByLabel('Design name').fill('E2E PDF Design');
    await manager.locator('input[type="file"]').setInputFiles('e2e/fixtures/e2e-blank-form.pdf');
    await manager.getByRole('button', { name: 'Save new design' }).click();
    await expect(manager.getByRole('status')).toContainText('Template saved');

    const offer = manager.getByRole('region', { name: 'Design checklist' });
    await expect(offer).toContainText('Fields AFN can place for you');
    await expect(offer).toContainText('Client Name');
    await expect(offer).toContainText('Ticket Number');
    await expect(offer).not.toContainText('Remarks');
    await offer.getByRole('button', { name: 'Place these fields' }).click();
    await expect(manager.getByRole('status')).toContainText('Fields placed');

    // The boxes can be checked and moved in the field editor.
    await manager.getByRole('button', { name: 'Set up fields' }).click();
    const editor = page.getByRole('dialog', { name: /Set up fields/ });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Fields on this page')).toContainText('2 fields on page');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/screenshots/12-template-7-pdf-fields-placed.png' });
    await editor.getByRole('button', { name: 'Close field setup' }).click();
    await expect(editor).toBeHidden();

    await manager.getByRole('button', { name: 'Use this design' }).click();
    await expect(manager.getByRole('status')).toContainText('is now the design in use');
    expect(errors).toEqual([]);
  });

  test('12.20 - An unused document type can be deleted and disappears from the library', async ({ page }) => {
    test.setTimeout(90000);
    await visitWorkspacePage(page, '/admin/documents');
    await page.getByRole('button', { name: 'Template library' }).click();
    const manager = page.getByRole('dialog', { name: 'Document templates' });
    await manager.getByRole('button', { name: 'New document type' }).click();
    const registration = manager.locator('form').filter({ hasText: 'AFN record used to fill it' });
    await registration.getByLabel('Document name').fill('E2E Disposable Type');
    await registration.getByLabel('Description').fill('Delete test.');
    await registration.getByRole('button', { name: 'Create document type' }).click();
    await expect(manager.getByRole('status')).toContainText('Custom document registered as inactive');

    await manager.getByRole('button', { name: 'Delete document type' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete this document type?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Dismiss' }).click();
    await expect(confirm).toBeHidden();
    await expect(manager.getByLabel('Document type').locator('option', { hasText: 'E2E Disposable Type' })).toHaveCount(1);

    await manager.getByRole('button', { name: 'Delete document type' }).click();
    await page.getByRole('dialog', { name: 'Delete this document type?' }).getByRole('button', { name: 'Delete document type' }).click();
    await expect(manager.getByRole('status')).toContainText('Document type deleted');
    await expect(manager.getByLabel('Document type').locator('option', { hasText: 'E2E Disposable Type' })).toHaveCount(0);
  });

  test('12.21 - A custom document tab without a ticket asks for one, then opens as soon as a ticket is picked', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // A ready custom document, set up through the API: register, upload its own starter file, use it.
    const headers = { Authorization: `Token ${adminAuthState.token}` };
    const name = `E2E Ticket First ${Date.now()}`;
    const definition = await (await page.request.post('/api/services/document-definitions/', { headers, data: { name, description: 'Ticket-first test.', data_source: 'ticket', display_order: 140 } })).json();
    const design = await (await page.request.post('/api/services/document-templates/', { headers, data: { definition: definition.id, name: 'Standard', is_default: true } })).json();
    const starter = await (await page.request.get(`/api/services/document-definitions/${definition.id}/starter/`, { headers })).body();
    const version = await (await page.request.post('/api/services/document-template-versions/', {
      headers, multipart: { template: String(design.id), file: { name: 'starter.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: starter } },
    })).json();
    const used = await page.request.post(`/api/services/document-template-versions/${version.id}/use-design/`, { headers });
    expect(used.ok(), await used.text()).toBeTruthy();

    await visitWorkspacePage(page, '/admin/documents');
    const stageRail = page.getByRole('navigation', { name: 'Document templates' });
    const tab = stageRail.getByRole('button', { name: new RegExp(name) });
    const fillWindow = page.getByRole('dialog', { name: 'Fill a document' });

    // 1. No ticket: no empty window, a note instead, and the ticket search is ready to type in.
    await tab.click();
    await expect(fillWindow).toHaveCount(0);
    const note = page.getByRole('status').filter({ hasText: 'Choose a ticket above to fill' });
    await expect(note).toContainText(name);
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByPlaceholder(/search ticket by id/i)).toBeFocused();
    await page.screenshot({ path: 'test-results/screenshots/12-custom-tab-needs-ticket.png' });

    // Cancel clears the note and the tab.
    await note.getByRole('button', { name: 'Cancel' }).click();
    await expect(note).toHaveCount(0);
    await expect(tab).toHaveAttribute('aria-pressed', 'false');

    // 2. Pick a ticket after choosing the tab: the Fill window opens on its own.
    await tab.click();
    await page.getByRole('button', { name: /TKT-\d+/ }).first().click();
    await expect(fillWindow).toBeVisible({ timeout: 15000 });
    await expect(fillWindow).toContainText(name);
    await expect(fillWindow).not.toContainText('Select a ticket on the Documents page first');
    await page.keyboard.press('Escape');
    await expect(fillWindow).toBeHidden();
    await expect(note).toHaveCount(0);

    // 3. With a ticket already chosen the tab opens the window straight away.
    await tab.click();
    await expect(fillWindow).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(fillWindow).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('12.10 - Each filter narrows the schedule and Clear filters brings everything back', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar');
    await expect(showing(page)).toBeVisible();
    const initial = await showing(page).innerText();
    const filters = ['Filter by workflow', 'Filter by service', 'Filter by technician', 'Filter by status'];
    for (const name of filters) {
      const select = page.getByLabel(name);
      const values = await select.locator('option').evaluateAll((options) => options.map((o) => o.value));
      for (const value of values) {
        await select.selectOption(value);
        await expect(select).toHaveValue(value);
        await expect(showing(page)).toBeVisible();
      }
      await select.selectOption('all');
    }
    await page.getByLabel('Filter by technician').selectOption('unassigned');
    await page.getByLabel('Filter by status').selectOption('scheduled');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    for (const name of filters) await expect(page.getByLabel(name)).toHaveValue('all');
    await expect(showing(page)).toHaveText(initial);
  });

  test('12.11 - Include completed toggles and the service colours legend opens and hides', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar');
    const includeCompleted = page.getByLabel('Include completed');
    await expect(includeCompleted).not.toBeChecked();
    await includeCompleted.check();
    await expect(includeCompleted).toBeChecked();
    await expect(showing(page)).toBeVisible();
    await includeCompleted.uncheck();
    await expect(includeCompleted).not.toBeChecked();

    const legendToggle = page.getByRole('button', { name: /Service colors|Hide service colors/ });
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');
    await legendToggle.click();
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'true');
    await legendToggle.click();
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('12.12 - A day opens its appointments and closes with the button or Escape', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar');
    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const dayButton = page.getByRole('button', { name: new RegExp(`^${todayLabel},`) }).last();
    await dayButton.click({ position: { x: 12, y: 12 } });
    const agenda = page.getByRole('dialog', { name: /Appointments for/ });
    await expect(agenda).toBeVisible();
    await agenda.getByRole('button', { name: 'Close selected day appointments' }).click();
    await expect(agenda).toBeHidden();
    await dayButton.click({ position: { x: 12, y: 12 } });
    await expect(agenda).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(agenda).toBeHidden();
  });

  test('12.13 - A job opens its details and links to the ticket queue and the dispatch board', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar');
    const job = page.getByRole('button', { name: /E2E .* (scheduled|inspect)/i }).first();
    await expect(job).toBeVisible();
    await job.click();
    const details = page.getByRole('dialog').filter({ hasText: /TKT-\d+/ });
    await expect(details).toBeVisible();
    // The day list stays open behind the job details, so use the top-most dialog's button.
    await page.getByRole('button', { name: 'Open ticket queue' }).last().click();
    await expect(page).toHaveURL(/\/admin\/service-tickets/);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/calendar/);
    await expect(page.getByRole('heading', { name: 'Service Calendar', exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    // Coming back, the calendar may restore the job details on its own; open the job only if it did not.
    const dispatch = page.getByRole('button', { name: 'Open dispatch' });
    if (!(await dispatch.last().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /E2E .* (scheduled|inspect)/i }).first().click();
    }
    await dispatch.last().click();
    await expect(page).toHaveURL(/\/admin\/dispatch/);
  });

  test('12.14 - Closing the availability panel with unsaved edits asks before discarding', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar');
    await page.getByRole('button', { name: 'Configure Availability' }).click();
    const todayLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    await page.getByRole('button', { name: new RegExp(`^${todayLabel},.*open availability configuration$`) }).last()
      .click({ position: { x: 12, y: 12 } });
    const panel = page.getByRole('dialog', { name: /Configure availability for/ });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Bulk Edit' }).click();
    await expect(panel.getByRole('button', { name: 'Bulk Edit' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Close availability configuration' }).click();
    const confirm = page.getByRole('dialog', { name: 'Discard availability changes?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Keep configuring' }).click();
    await expect(confirm).toBeHidden();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Close availability configuration' }).click();
    await page.getByRole('dialog', { name: 'Discard availability changes?' }).getByRole('button', { name: 'Discard changes' }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'Done Configuring' })).toBeVisible();
    await page.getByRole('button', { name: 'Done Configuring' }).click();
    await expect(page.getByRole('button', { name: 'Configure Availability' })).toHaveAttribute('aria-pressed', 'false');
  });
});
