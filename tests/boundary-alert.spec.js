const { test, expect } = require('@playwright/test');

async function prep(page, radiusM = 60.96) {
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((radiusM) => {
    hideStartupOverlays();
    document.getElementById('map-wrapper').style.display = 'flex';
    if (!STATE.mapReady) initMap();
    STATE.lockedPos = { lat: 0, lng: 0 };
    STATE.gpsPos = { lat: 0, lng: 0 };
    STATE.arcLocked = true;
    STATE.arcData = { radiusM, openingAngleDeg: 90 };
    map.setView([0, 0], 18, { animate: false });
    wasInsideZone = null;
    boundaryAlertTime = 0;
    window.alertEvidence = { tones: [], vibrations: [] };
    playTone = (...args) => alertEvidence.tones.push(args);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: p => { alertEvidence.vibrations.push(p); return true; } });
    window.sampleDistance = (metres, direction = 1) => {
      STATE.gpsPos = { lat: direction * metres / 6371000 * 180 / Math.PI, lng: 0 };
      checkBoundary();
    };
  }, radiusM);
}

test('skipped samples cross in both directions with one double ding and priority haptics', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    sampleDistance(196 * 0.3048);
    alertEvidence.tones = []; alertEvidence.vibrations = [];
    boundaryAlertTime = 0;
    sampleDistance(204 * 0.3048);
    const outward = structuredClone(alertEvidence);
    sampleDistance(205 * 0.3048);
    const repeated = alertEvidence.tones.length;
    sampleDistance(196 * 0.3048);
    return { outward, repeated, final: alertEvidence };
  });
  expect(result.outward.tones).toEqual([[520, 0, 0.18, 0.30], [520, 0.26, 0.18, 0.30]]);
  expect(result.outward.vibrations).toEqual([[200, 100, 200, 100, 200]]);
  expect(result.repeated).toBe(2);
  expect(result.final.tones).toHaveLength(4);
  expect(result.final.vibrations).toHaveLength(2);
});

test('edge jitter and silent proximity retain a stable side and visual highlight', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    sampleDistance(180 * 0.3048);
    const far = STATE.nearBoundary;
    for (const feet of [196, 199, 201, 200, 198, 202, 199, 201]) sampleDistance(feet * 0.3048);
    const near = { flag: STATE.nearBoundary, stroke: document.querySelector('[data-zone-boundary]').getAttribute('stroke') };
    const before = alertEvidence.tones.length;
    sampleDistance(204 * 0.3048);
    for (const feet of [201, 199, 200, 202, 198]) sampleDistance(feet * 0.3048);
    const after = alertEvidence.tones.length;
    sampleDistance(220 * 0.3048);
    return { far, near, before, after, farAgain: STATE.nearBoundary, vibrations: alertEvidence.vibrations };
  });
  expect(result.far).toBe(false);
  expect(result.near).toEqual({ flag: true, stroke: 'rgba(220,38,38,0.9)' });
  expect(result.before).toBe(0);
  expect(result.after).toBe(2);
  expect(result.farAgain).toBe(false);
  expect(result.vibrations[0]).toEqual([150, 80, 150]);
});

test('configured radius and both shaded halves use the same circular detection', async ({ page }) => {
  await prep(page, 30);
  const counts = await page.evaluate(() => {
    const counts = [];
    for (const direction of [-1, 1]) {
      wasInsideZone = null; alertEvidence.tones = [];
      sampleDistance(32, direction); // Initial observation is not a crossing.
      counts.push(alertEvidence.tones.length);
      sampleDistance(28, direction);
      counts.push(alertEvidence.tones.length);
    }
    return counts;
  });
  expect(counts).toEqual([0, 2, 0, 2]);
});

test('unsupported or throwing haptics do not prevent crossing audio or visuals', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    sampleDistance(59); sampleDistance(62);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { throw new Error('unsupported'); } });
    sampleDistance(59);
    return { tones: alertEvidence.tones.length, near: STATE.nearBoundary };
  });
  expect(result).toEqual({ tones: 4, near: true });
});

test('setup dings once only on a successful full-distance lock', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    STATE.screen = 's3'; STATE.arcLocked = false; zoneDone = false;
    const center = map.latLngToContainerPoint([0, 0]);
    const rect = document.getElementById('map-wrapper').getBoundingClientRect();
    const event = distance => ({ clientX: rect.left + center.x + distance, clientY: rect.top + center.y, preventDefault() {} });
    onDragStart(event(0)); onDragMove(event(20)); onDragEnd({});
    const short = { tones: alertEvidence.tones.length, locked: STATE.arcLocked };
    onDragStart(event(0));
    onDragMove(event(metersToPixels(CONFIG.defaultRadiusMeters) + 10));
    const reached = alertEvidence.tones.length;
    onDragEnd({}); onDragEnd({});
    return { short, reached, tones: alertEvidence.tones, locked: STATE.arcLocked, radius: STATE.arcData.radiusM };
  });
  expect(result.short).toEqual({ tones: 0, locked: false });
  expect(result.reached).toBe(0);
  expect(result.tones).toEqual([[880, 0, 0.42, 0.28]]);
  expect(result.locked).toBe(true);
  expect(result.radius).toBe(60.96);
});
