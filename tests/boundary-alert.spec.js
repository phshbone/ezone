const { test, expect } = require('@playwright/test');

const FT = 0.3048;

async function prep(page, radiusM = 60.96) {
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((radiusM) => {
    hideStartupOverlays();
    document.getElementById('map-wrapper').style.display = 'flex';
    if (!STATE.mapReady) initMap();
    STATE.lockedPos = { lat: 0, lng: 0 };
    STATE.gpsPos = { lat: 0, lng: 0 };
    STATE.rawGpsPos = { lat: 0, lng: 0, accuracy: 5, ts: Date.now() };
    STATE.arcLocked = true;
    STATE.arcData = { radiusM, openingAngleDeg: 90 };
    map.setView([0, 0], 18, { animate: false });
    resetBoundaryTracking();
    window.alertEvidence = { tones: [], vibrations: [] };
    playTone = (...args) => alertEvidence.tones.push(args);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: p => {
        alertEvidence.vibrations.push(p);
        return true;
      },
    });
    window.sampleDistance = (metres, direction = 1) => {
      const pos = { lat: direction * metres / 6371000 * 180 / Math.PI, lng: 0 };
      STATE.rawGpsPos = { ...pos, accuracy: 5, ts: Date.now() };
      STATE.gpsPos = pos;
      checkBoundary();
    };
  }, radiusM);
}

const buzz = [
  [165, 0, 0.09, 0.22, 'square'],
  [165, 0.14, 0.09, 0.22, 'square'],
  [165, 0.28, 0.09, 0.22, 'square'],
];

test('194 -> 198 enters the 196-204 ft moat once; crossing inside it does not retrigger', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    sampleDistance(194 * 0.3048);
    sampleDistance(198 * 0.3048);
    const entered = {
      tones: structuredClone(alertEvidence.tones),
      vibrations: structuredClone(alertEvidence.vibrations),
      near: STATE.nearBoundary,
      stroke: document.querySelector('[data-zone-boundary]').getAttribute('stroke'),
      pulse: document.getElementById('zone-svg').classList.contains('boundary-alert-pulse'),
    };
    sampleDistance(202 * 0.3048);
    sampleDistance(204 * 0.3048);
    return { entered, finalTones: alertEvidence.tones.length, finalVibrations: alertEvidence.vibrations.length };
  });

  expect(result.entered.tones).toEqual(buzz);
  expect(result.entered.vibrations).toEqual([[180, 70, 180, 70, 240]]);
  expect(result.entered.near).toBe(true);
  expect(result.entered.stroke).toBe('rgba(220,38,38,0.9)');
  expect(result.entered.pulse).toBe(true);
  expect(result.finalTones).toBe(3);
  expect(result.finalVibrations).toBe(1);
});

test('194 -> 206 and 206 -> 194 detect a complete skipped moat crossing in either direction', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    sampleDistance(194 * 0.3048);
    sampleDistance(206 * 0.3048);
    const outward = {
      tones: structuredClone(alertEvidence.tones),
      vibrations: structuredClone(alertEvidence.vibrations),
      near: STATE.nearBoundary,
      pulse: document.getElementById('zone-svg').classList.contains('boundary-alert-pulse'),
    };

    resetBoundaryTracking();
    alertEvidence.tones = [];
    alertEvidence.vibrations = [];
    sampleDistance(206 * 0.3048);
    sampleDistance(194 * 0.3048);
    const inward = {
      tones: structuredClone(alertEvidence.tones),
      vibrations: structuredClone(alertEvidence.vibrations),
      near: STATE.nearBoundary,
      pulse: document.getElementById('zone-svg').classList.contains('boundary-alert-pulse'),
    };
    return { outward, inward };
  });

  expect(result.outward.tones).toEqual(buzz);
  expect(result.outward.vibrations).toEqual([[180, 70, 180, 70, 240]]);
  expect(result.outward.near).toBe(false);
  expect(result.outward.pulse).toBe(true);
  expect(result.inward.tones).toEqual(buzz);
  expect(result.inward.vibrations).toEqual([[180, 70, 180, 70, 240]]);
  expect(result.inward.near).toBe(false);
  expect(result.inward.pulse).toBe(true);
});

test('moat jitter does not retrigger until the user clearly leaves and approaches again', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    sampleDistance(194 * 0.3048);
    sampleDistance(198 * 0.3048);
    for (const feet of [199, 201, 200, 202, 204, 205, 203, 202, 199]) {
      sampleDistance(feet * 0.3048);
    }
    const duringJitter = {
      tones: alertEvidence.tones.length,
      vibrations: alertEvidence.vibrations.length,
    };

    sampleDistance(212 * 0.3048);
    sampleDistance(203 * 0.3048);
    return {
      duringJitter,
      afterReturn: {
        tones: alertEvidence.tones.length,
        vibrations: alertEvidence.vibrations.length,
        near: STATE.nearBoundary,
      },
    };
  });

  expect(result.duringJitter).toEqual({ tones: 3, vibrations: 1 });
  expect(result.afterReturn).toEqual({ tones: 6, vibrations: 2, near: true });
});

test('the same four-foot moat is derived from a non-200-foot configured radius', async ({ page }) => {
  await prep(page, 30);
  const result = await page.evaluate(() => {
    sampleDistance(28);
    sampleDistance(29.5);
    const first = structuredClone(alertEvidence.tones);
    sampleDistance(30.5);
    const noRepeat = alertEvidence.tones.length;
    sampleDistance(34);
    sampleDistance(30.5);
    return { first, noRepeat, afterReturn: alertEvidence.tones.length };
  });

  expect(result.first).toEqual(buzz);
  expect(result.noRepeat).toBe(3);
  expect(result.afterReturn).toBe(6);
});

test('unsupported or throwing haptics never block moat audio or perimeter pulse', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    sampleDistance(194 * 0.3048);
    sampleDistance(198 * 0.3048);
    const unsupported = {
      tones: alertEvidence.tones.length,
      pulse: document.getElementById('zone-svg').classList.contains('boundary-alert-pulse'),
    };

    sampleDistance(212 * 0.3048);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        throw new Error('unsupported');
      },
    });
    sampleDistance(203 * 0.3048);
    return {
      unsupported,
      throwing: {
        tones: alertEvidence.tones.length,
        near: STATE.nearBoundary,
      },
    };
  });

  expect(result.unsupported).toEqual({ tones: 3, pulse: true });
  expect(result.throwing).toEqual({ tones: 6, near: true });
});

test('setup still dings once only on a successful full-distance lock', async ({ page }) => {
  await prep(page);
  const result = await page.evaluate(() => {
    STATE.screen = 's3';
    STATE.arcLocked = false;
    zoneDone = false;
    const center = map.latLngToContainerPoint([0, 0]);
    const rect = document.getElementById('map-wrapper').getBoundingClientRect();
    const event = distance => ({
      clientX: rect.left + center.x + distance,
      clientY: rect.top + center.y,
      preventDefault() {},
    });

    onDragStart(event(0));
    onDragMove(event(20));
    onDragEnd({});
    const short = { tones: alertEvidence.tones.length, locked: STATE.arcLocked };

    onDragStart(event(0));
    onDragMove(event(metersToPixels(CONFIG.defaultRadiusMeters) + 10));
    const reached = alertEvidence.tones.length;
    onDragEnd({});
    onDragEnd({});

    return {
      short,
      reached,
      tones: alertEvidence.tones,
      locked: STATE.arcLocked,
      radius: STATE.arcData.radiusM,
    };
  });

  expect(result.short).toEqual({ tones: 0, locked: false });
  expect(result.reached).toBe(0);
  expect(result.tones).toEqual([[880, 0, 0.42, 0.28]]);
  expect(result.locked).toBe(true);
  expect(result.radius).toBe(60.96);
});
