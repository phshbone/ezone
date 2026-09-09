const { test, expect } = require('@playwright/test');

async function prep(page, radiusM = 60.96, angle = 0, locked = true) {
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ radiusM, angle, locked }) => {
    ['agreement-overlay', 'returning-overlay', 'welcome-overlay', 'beta-splash-overlay', 'testing-tips-overlay'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('map-wrapper').style.display = 'flex';
    document.getElementById('map-ui').style.display = 'block';
    if (!STATE.mapReady) initMap();
    STATE.gpsPos = { lat: 40, lng: -74.5 };
    STATE.lockedPos = { lat: 40, lng: -74.5 };
    STATE.arcData = { radiusM, openingAngleDeg: angle };
    STATE.arcLocked = locked;
    map.setView([40, -74.5], 18, { animate: false });
    drawZone();
  }, { radiusM, angle, locked });
}

test.describe('full-circle zone visualization', () => {
  test('uses one complete circle at the configured radius and entrance', async ({ page }) => {
    for (const radiusM of [30, 60.96]) {
      await prep(page, radiusM);
      const result = await page.evaluate(() => {
        const svg = document.getElementById('zone-svg');
        const circle = svg.querySelector('[data-zone-boundary]');
        const center = map.latLngToContainerPoint([STATE.lockedPos.lat, STATE.lockedPos.lng]);
        const mpp = 156543.03392 * Math.cos(STATE.lockedPos.lat * Math.PI / 180) / 2 ** map.getZoom();
        return {
          count: svg.querySelectorAll('circle').length,
          tag: circle.tagName,
          cx: +circle.getAttribute('cx'), cy: +circle.getAttribute('cy'),
          r: +circle.getAttribute('r'), expectedR: STATE.arcData.radiusM / mpp,
          center: { x: center.x, y: center.y },
          visiblePaths: svg.querySelectorAll(':scope > path').length,
          lines: svg.querySelectorAll('line').length,
          toggles: document.querySelectorAll('#shape-test-toggle, .shape-test-btn').length,
          markers: svg.querySelectorAll('marker, [marker-start], [marker-end]').length,
        };
      });
      expect(result.tag).toBe('circle');
      expect(result.count).toBe(1);
      expect(result.cx).toBeCloseTo(result.center.x, 6);
      expect(result.cy).toBeCloseTo(result.center.y, 6);
      expect(result.r).toBeCloseTo(result.expectedR, 6);
      expect(result.visiblePaths).toBe(0);
      expect(result.lines).toBe(1);
      expect(result.toggles).toBe(0);
      expect(result.markers).toBe(0);
    }
  });

  test('divider bisects the center perpendicular to the existing drag direction', async ({ page }) => {
    await prep(page);
    for (const angle of [-179, -90, 0, 45, 90, 180, 359]) {
      const result = await page.evaluate((angle) => {
        STATE.arcData.openingAngleDeg = angle;
        drawZone();
        const c = document.querySelector('[data-zone-boundary]');
        const d = document.querySelector('[data-zone-divider]');
        const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'), r = +c.getAttribute('r');
        const x1 = +d.getAttribute('x1'), y1 = +d.getAttribute('y1');
        const x2 = +d.getAttribute('x2'), y2 = +d.getAttribute('y2');
        return { cx, cy, r, x1, y1, x2, y2,
          perpendicular: ((x2-x1)*Math.cos(angle*Math.PI/180)+(y2-y1)*Math.sin(angle*Math.PI/180))/(2*r),
          thin: +d.getAttribute('stroke-width') < +c.getAttribute('stroke-width'),
          stroke: d.getAttribute('stroke'),
          orientation: STATE.arcData.openingAngleDeg };
      }, angle);
      expect((result.x1 + result.x2) / 2).toBeCloseTo(result.cx, 6);
      expect((result.y1 + result.y2) / 2).toBeCloseTo(result.cy, 6);
      expect(Math.hypot(result.x2-result.x1, result.y2-result.y1)).toBeCloseTo(2*result.r, 6);
      expect(result.perpendicular).toBeCloseTo(0, 6);
      expect(result.thin).toBe(true);
      expect(result.stroke).toBe('rgba(180,20,20,0.18)');
      expect(result.orientation).toBe(angle);
    }
  });

  test('circle and divider remain aligned after zooming with a moved GPS position', async ({ page }) => {
    await prep(page, 60.96, 35);
    const result = await page.evaluate(() => {
      STATE.gpsPos = { lat: 40.001, lng: -74.499 };
      map.setZoom(19, { animate: false });
      drawZone();
      const circle = document.querySelector('[data-zone-boundary]');
      const p = map.latLngToContainerPoint([STATE.lockedPos.lat, STATE.lockedPos.lng]);
      return { cx: +circle.getAttribute('cx'), cy: +circle.getAttribute('cy'),
        x: p.x, y: p.y, radiusM: STATE.arcData.radiusM, angle: STATE.arcData.openingAngleDeg };
    });
    expect(result.cx).toBeCloseTo(result.x, 6);
    expect(result.cy).toBeCloseTo(result.y, 6);
    expect(result.radiusM).toBe(60.96);
    expect(result.angle).toBe(35);
  });

  test('unlocked drag keeps only the circle and faint diameter; mobile controls remain usable', async ({ page }) => {
    await prep(page, 30, 90, false);
    await page.evaluate(() => { STATE.dragging = true; drawZone(); renderScreen('s6'); });
    await expect(page.locator('#bottom-bar .app-btn').first()).toBeVisible();
    await expect(page.locator('#bottom-bar img[src="assets/campaign-sign-marker.svg"]')).toBeVisible();
    await expect(page.locator('#shape-test-toggle')).toHaveCount(0);
    const result = await page.evaluate(() => ({
      lines: document.querySelectorAll('#zone-svg line').length,
      dash: document.querySelector('[data-zone-boundary]').getAttribute('stroke-dasharray'),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      barBottom: document.getElementById('bottom-bar').getBoundingClientRect().bottom,
      barTop: document.getElementById('bottom-bar').getBoundingClientRect().top,
      mapWidth: document.getElementById('map-wrapper').getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(result.lines).toBe(1);
    expect(result.dash).toBe('6 3');
    expect(result.overflow).toBe(false);
    expect(result.barTop).toBeGreaterThanOrEqual(0);
    expect(result.mapWidth).toBe(result.viewportWidth);
    expect(result.barBottom).toBeLessThanOrEqual(result.height);
  });
});
