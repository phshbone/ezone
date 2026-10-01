const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

function verificationPath(testInfo, name) {
  const dir = path.join('verification-artifacts', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
}

async function captureVerification(page, testInfo, name) {
  await page.screenshot({ path: verificationPath(testInfo, name), fullPage: false });
}

// Permanent cleanup-branch regression suite: product repairs, compact beta UI, toast layout, Help UI, and campaign incident marker.
test.describe('E-Zone branch harness smoke', () => {
  test('application shell loads cleanly', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    expect(response && response.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/E-Zone/i);
    await expect(page.locator('body')).toContainText(/E-Zone/i);

    await page.waitForTimeout(1200);
    expect(pageErrors).toEqual([]);
  });

  test('startup gate appears and app remains interactive', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    const agreement = page.locator('#agreement-overlay');
    const returning = page.locator('#returning-overlay');
    const visibleGate =
      (await agreement.isVisible().catch(() => false)) ||
      (await returning.isVisible().catch(() => false));

    expect(visibleGate).toBeTruthy();
    await captureVerification(page, testInfo, 'startup-gate');
  });

  test('feedback page loads', async ({ page }) => {
    const response = await page.goto('feedback.html', { waitUntil: 'domcontentloaded' });
    expect(response && response.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/E-Zone Beta Report/i);
    await expect(page.locator('body')).toContainText(/E-Zone/i);
  });

  test('short drag cannot lock the electioneering boundary', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      STATE.screen = 's3';
      STATE.dragging = true;
      STATE.arcLocked = false;
      STATE.arcData = { radiusM: 30, radiusPx: 50, openingAngleDeg: 0 };
      STATE.gpsPos = null;
      zoneDone = false;

      onDragEnd({});

      return {
        arcLocked: STATE.arcLocked,
        radiusM: STATE.arcData.radiusM,
        screen: STATE.screen,
        zoneDone,
      };
    });

    expect(result.arcLocked).toBe(false);
    expect(result.radiusM).toBe(30);
    expect(result.screen).toBe('s3');
    expect(result.zoneDone).toBe(false);
  });

  test('full 200-foot drag locks at the normalized legal radius', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      STATE.screen = 's3';
      STATE.dragging = true;
      STATE.arcLocked = false;
      STATE.arcData = {
        radiusM: CONFIG.defaultRadiusMeters,
        radiusPx: 100,
        openingAngleDeg: 0,
      };
      STATE.gpsPos = null;
      zoneDone = true;

      onDragEnd({});

      return {
        arcLocked: STATE.arcLocked,
        radiusM: STATE.arcData.radiusM,
        expectedRadiusM: CONFIG.defaultRadiusMeters,
      };
    });

    expect(result.arcLocked).toBe(true);
    expect(result.radiusM).toBe(result.expectedRadiusM);
    expect(result.radiusM).toBeCloseTo(60.96, 2);
  });

  test('compact mandatory beta gate avoids forced scrolling', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await expect(page.locator('#agreement-overlay')).toBeVisible();
    await expect(page.locator('#agreement-card')).toBeVisible();
    await expect(page.locator('#agree-scroll')).toHaveCount(0);
    await expect(page.locator('#agree-check')).toBeEnabled();
    await expect(page.locator('#agreement-card details summary')).toContainText(
      'View full beta terms',
    );
    await expect(page.locator('#agreement-card')).not.toContainText('Please scroll through');
  });

  test('status toast stays above the bottom action area', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const agreement = document.getElementById('agreement-overlay');
      const returning = document.getElementById('returning-overlay');
      const welcome = document.getElementById('welcome-overlay');
      if (agreement) agreement.style.display = 'none';
      if (returning) returning.style.display = 'none';
      if (welcome) welcome.style.display = 'none';

      const mapUi = document.getElementById('map-ui');
      mapUi.style.display = 'block';

      const bar = document.getElementById('bottom-bar');
      bar.innerHTML = '<div class="btn-row"><button class="app-btn btn-blue">Back</button></div>';
      showToast('GPS location saved', '#16a34a');
    });
    await page.waitForTimeout(100);
    const positions = await page.evaluate(() => {
      const toast = document.getElementById('toast').getBoundingClientRect();
      const bar = document.getElementById('bottom-bar').getBoundingClientRect();
      return { toastBottom: toast.bottom, barTop: bar.top };
    });
    expect(positions.toastBottom).toBeLessThan(positions.barTop);
    await captureVerification(page, testInfo, 'status-toast');
  });

  test('Help card is wide, current, and its close control stays inside the card', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      ['agreement-overlay', 'welcome-overlay', 'beta-splash-overlay', 'testing-tips-overlay'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.getElementById('instructions').classList.add('active');
      document.getElementById('instructions').style.display = 'flex';
    });

    await expect(page.locator('.instr-card')).toBeVisible();
    await expect(page.locator('.instr-card')).toContainText('Done adding incidents?');
    await expect(page.locator('.instr-card')).toContainText('Send pics to BOE?');
    await expect(page.locator('.instr-card img[alt="campaign sign"]')).toBeVisible();
    await expect(page.locator('.instr-stars-top')).toBeVisible();
    await expect(page.locator('.instr-stars-bottom')).toBeVisible();
    await expect(page.locator('.instr-locator-drag')).toBeVisible();
    await expect(page.locator('.instr-locator-return')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const card = document.querySelector('.instr-card').getBoundingClientRect();
      const close = document.querySelector('.instr-close').getBoundingClientRect();
      return {
        cardWidth: card.width,
        closeLeft: close.left,
        closeRight: close.right,
        closeTop: close.top,
        closeBottom: close.bottom,
        cardLeft: card.left,
        cardRight: card.right,
        cardTop: card.top,
        cardBottom: card.bottom,
      };
    });

    expect(geometry.cardWidth).toBeGreaterThan(350);
    expect(geometry.closeLeft).toBeGreaterThanOrEqual(geometry.cardLeft);
    expect(geometry.closeRight).toBeLessThanOrEqual(geometry.cardRight);
    expect(geometry.closeTop).toBeGreaterThanOrEqual(geometry.cardTop);
    expect(geometry.closeBottom).toBeLessThanOrEqual(geometry.cardBottom);
    await captureVerification(page, testInfo, 'help-screen');
  });

  test('Help bottom guidance clears the anchored close footer after scrolling', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      ['agreement-overlay', 'welcome-overlay', 'beta-splash-overlay', 'testing-tips-overlay'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      const instructions = document.getElementById('instructions');
      instructions.classList.add('active');
      instructions.style.display = 'flex';
      const scroll = document.querySelector('.instr-scroll');
      scroll.scrollTop = scroll.scrollHeight;
    });
    await page.waitForTimeout(100);

    const geometry = await page.evaluate(() => {
      const hint = document.querySelector('.instr-nav-hint').getBoundingClientRect();
      const footer = document.querySelector('.instr-close-wrap').getBoundingClientRect();
      const scroll = document.querySelector('.instr-scroll');
      return {
        hintTop: hint.top,
        hintBottom: hint.bottom,
        footerTop: footer.top,
        scrollTop: scroll.scrollTop,
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight,
        text: document.querySelector('.instr-nav-hint').innerText,
      };
    });

    expect(geometry.text).toContain('BACK');
    expect(geometry.text).toContain('RESET');
    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(geometry.scrollTop + geometry.clientHeight).toBeGreaterThanOrEqual(geometry.scrollHeight - 2);
    expect(geometry.hintBottom).toBeLessThanOrEqual(geometry.footerTop);
    await captureVerification(page, testInfo, 'help-screen-bottom');
  });

  test('DROP control uses the campaign sign icon', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      ['agreement-overlay', 'welcome-overlay', 'beta-splash-overlay', 'testing-tips-overlay'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      const mapUi = document.getElementById('map-ui');
      mapUi.style.display = 'block';
      const bar = document.getElementById('bottom-bar');
      bar.innerHTML = '';
      const button = document.createElement('button');
      button.className = 'app-btn btn-green';
      button.innerHTML = 'DROP ' + CAMPAIGN_BUTTON_ICON;
      bar.appendChild(button);
    });
    const icon = page.locator('#bottom-bar img[src="assets/campaign-sign-marker.svg"]');
    await expect(icon).toBeVisible();
    await captureVerification(page, testInfo, 'drop-campaign-icon');
  });

  test('campaign sign incident marker loads with stake-tip anchor and legacy fallback', async ({
    page,
  }, testInfo) => {
    const assetResponse = await page.goto('assets/campaign-sign-marker.svg');
    expect(assetResponse && assetResponse.ok()).toBeTruthy();
    await captureVerification(page, testInfo, 'campaign-sign-marker');

    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    const marker = await page.evaluate(() => {
      initIcons();
      return {
        activeUrl: INCIDENT_ICON?.options?.iconUrl,
        activeSize: INCIDENT_ICON?.options?.iconSize,
        activeAnchor: INCIDENT_ICON?.options?.iconAnchor,
        legacyExists: Boolean(LEGACY_INCIDENT_ICON),
        campaignIsActive: INCIDENT_ICON === CAMPAIGN_SIGN_ICON,
      };
    });

    expect(marker.activeUrl).toBe('assets/campaign-sign-marker.svg');
    expect(marker.activeSize).toEqual([46, 66]);
    expect(marker.activeAnchor).toEqual([23, 66]);
    expect(marker.legacyExists).toBe(true);
    expect(marker.campaignIsActive).toBe(true);
  });

  test('campaign sign export compositor paints a complete marker', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    const painted = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 60;
      c.height = 82;
      const ctx = c.getContext('2d');
      drawCampaignSignCanvas(ctx, 4, 4, 52, 74);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let alphaPixels = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) alphaPixels++;
      return alphaPixels;
    });
    expect(painted).toBeGreaterThan(800);
    await page.evaluate(() => {
      const instructions = document.getElementById('instructions');
      instructions.classList.add('active');
      instructions.style.display = 'flex';
    });
    await captureVerification(page, testInfo, 'campaign-export-compositor');
  });

  test('campaign export compositor places a complete sign at the live marker element coordinates', async ({ page }, testInfo) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(() => {
      ['agreement-overlay', 'welcome-overlay', 'beta-splash-overlay', 'testing-tips-overlay'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      const wrapper = document.getElementById('map-wrapper');
      wrapper.style.display = 'block';
      wrapper.style.position = 'relative';
      wrapper.style.width = '390px';
      wrapper.style.height = '700px';

      const fake = document.createElement('div');
      fake.id = 'fake-campaign-marker';
      fake.style.position = 'absolute';
      fake.style.left = '120px';
      fake.style.top = '180px';
      fake.style.width = '52px';
      fake.style.height = '74px';
      wrapper.appendChild(fake);

      STATE.incidentMarkers = [{ getElement: () => fake }];
      const c = document.createElement('canvas');
      c.width = 390;
      c.height = 700;
      compositeIncidentMarkers(c);

      const ctx = c.getContext('2d');
      const inside = ctx.getImageData(115, 175, 65, 85).data;
      const outside = ctx.getImageData(10, 10, 65, 85).data;
      let insideAlpha = 0;
      let outsideAlpha = 0;
      for (let i = 3; i < inside.length; i += 4) if (inside[i] > 0) insideAlpha++;
      for (let i = 3; i < outside.length; i += 4) if (outside[i] > 0) outsideAlpha++;

      c.id = 'positioned-campaign-canvas';
      c.style.position = 'fixed';
      c.style.inset = '0';
      c.style.zIndex = '999999';
      document.body.appendChild(c);
      return { insideAlpha, outsideAlpha };
    });

    expect(result.insideAlpha).toBeGreaterThan(800);
    expect(result.outsideAlpha).toBe(0);
    await captureVerification(page, testInfo, 'campaign-export-positioned');
  });

});
