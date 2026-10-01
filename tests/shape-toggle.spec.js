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
  test('completed zone emphasizes 270 degrees and keeps a faint 90-degree rear window', async ({ page }) => {
    await prep(page);
    for (const angle of [0, 35, 90, 180, 270]) {
      const result = await page.evaluate((angle) => {
        STATE.arcData.openingAngleDeg = angle;
        STATE.dragging = true; // A locked zone must suppress the guide even with stale drag state.
        drawZone();
        const circle = document.querySelector('[data-zone-boundary]');
        const cx = +circle.getAttribute('cx'), cy = +circle.getAttribute('cy'), r = +circle.getAttribute('r');
        const rad = angle * Math.PI / 180;
        const frontPoint = new DOMPoint(cx + r * 0.5 * Math.cos(rad), cy + r * 0.5 * Math.sin(rad));
        const rearPoint = new DOMPoint(cx - r * 0.5 * Math.cos(rad), cy - r * 0.5 * Math.sin(rad));
        const leftSidePoint = new DOMPoint(
          cx + r * 0.5 * Math.cos(rad + Math.PI / 2),
          cy + r * 0.5 * Math.sin(rad + Math.PI / 2),
        );
        const rightSidePoint = new DOMPoint(
          cx + r * 0.5 * Math.cos(rad - Math.PI / 2),
          cy + r * 0.5 * Math.sin(rad - Math.PI / 2),
        );
        return {
          sectors: [...document.querySelectorAll('[data-zone-sector]')].map(p => ({
            name: p.dataset.zoneSector,
            fill: p.getAttribute('fill'),
            stroke: p.getAttribute('stroke'),
            front: p.isPointInFill(frontPoint),
            rear: p.isPointInFill(rearPoint),
            leftSide: p.isPointInFill(leftSidePoint),
            rightSide: p.isPointInFill(rightSidePoint),
          })),
          circleFill: circle.getAttribute('fill'),
          guides: document.querySelectorAll('[data-zone-drag-guide]').length,
        };
      }, angle);
      expect(result.sectors).toEqual([
        {
          name: 'emphasized',
          fill: 'rgba(220,38,38,0.33)',
          stroke: 'none',
          front: true,
          rear: false,
          leftSide: true,
          rightSide: true,
        },
        {
          name: 'deemphasized',
          fill: 'rgba(220,38,38,0.09)',
          stroke: 'none',
          front: false,
          rear: true,
          leftSide: false,
          rightSide: false,
        },
      ]);
      expect(result.circleFill).toBe('none');
      expect(result.guides).toBe(0);
    }
  });

  test('creation guide follows actual drag and disappears on short release and lock', async ({ page }) => {
    await prep(page, 30, 0, false);
    const result = await page.evaluate(() => {
      STATE.screen = 's3'; zoneDone = false;
      const center = map.latLngToContainerPoint([STATE.lockedPos.lat, STATE.lockedPos.lng]);
      const rect = document.getElementById('map-wrapper').getBoundingClientRect();
      const event = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y, preventDefault() {} });
      onDragStart(event(center.x, center.y));
      onDragMove(event(center.x + 30, center.y + 30));
      const guide = document.querySelector('[data-zone-drag-guide]');
      const active = !!guide;
      const guideAngle = Math.atan2(+guide.getAttribute('y2') - +guide.getAttribute('y1'), +guide.getAttribute('x2') - +guide.getAttribute('x1')) * 180 / Math.PI;
      const liveDrag = {
        sectors: [...document.querySelectorAll('[data-zone-sector]')].map(p => p.getAttribute('fill')),
        dividers: document.querySelectorAll('[data-zone-divider]').length,
        circleFill: document.querySelector('[data-zone-boundary]').getAttribute('fill'),
      };
      onDragEnd({});
      const short = {
        locked: STATE.arcLocked,
        guides: document.querySelectorAll('[data-zone-drag-guide]').length,
        sectors: document.querySelectorAll('[data-zone-sector]').length,
        circleFill: document.querySelector('[data-zone-boundary]').getAttribute('fill'),
      };
      onDragStart(event(center.x, center.y));
      const distance = metersToPixels(CONFIG.defaultRadiusMeters) + 10;
      onDragMove(event(center.x + distance, center.y));
      onDragEnd({});
      return { active, guideAngle, liveDrag, short, locked: STATE.arcLocked, guides: document.querySelectorAll('[data-zone-drag-guide]').length, sectors: document.querySelectorAll('[data-zone-sector]').length, dividers: document.querySelectorAll('[data-zone-divider]').length, radius: STATE.arcData.radiusM };
    });
    expect(result.active).toBe(true);
    expect(result.guideAngle).toBeCloseTo(45, 6);
    expect(result.liveDrag).toEqual({
      sectors: ['rgba(220,38,38,0.33)', 'rgba(220,38,38,0.09)'],
      dividers: 2,
      circleFill: 'none',
    });
    expect(result.short).toEqual({
      locked: false,
      guides: 0,
      sectors: 0,
      circleFill: 'rgba(220,38,38,0.18)',
    });
    expect(result.locked).toBe(true);
    expect(result.guides).toBe(0);
    expect(result.sectors).toBe(2);
    expect(result.dividers).toBe(2);
    expect(result.radius).toBe(60.96);
  });

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
      expect(result.visiblePaths).toBe(2);
      expect(result.lines).toBe(2);
      expect(result.toggles).toBe(0);
      expect(result.markers).toBe(0);
    }
  });

  test('two faint radial dividers bound the 90-degree rear window', async ({ page }) => {
    await prep(page);
    for (const angle of [-179, -90, 0, 45, 90, 180, 359]) {
      const result = await page.evaluate((angle) => {
        STATE.arcData.openingAngleDeg = angle;
        drawZone();
        const c = document.querySelector('[data-zone-boundary]');
        const ds = [...document.querySelectorAll('[data-zone-divider]')];
        const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'), r = +c.getAttribute('r');
        return {
          cx, cy, r,
          dividers: ds.map(d => ({
            x1: +d.getAttribute('x1'),
            y1: +d.getAttribute('y1'),
            x2: +d.getAttribute('x2'),
            y2: +d.getAttribute('y2'),
            stroke: d.getAttribute('stroke'),
            width: +d.getAttribute('stroke-width'),
          })),
          orientation: STATE.arcData.openingAngleDeg,
        };
      }, angle);

      expect(result.dividers).toHaveLength(2);
      const expectedAngles = [angle + 135, angle + 225];
      result.dividers.forEach((d, index) => {
        const rad = expectedAngles[index] * Math.PI / 180;
        expect(d.x1).toBeCloseTo(result.cx, 6);
        expect(d.y1).toBeCloseTo(result.cy, 6);
        expect(d.x2).toBeCloseTo(result.cx + result.r * Math.cos(rad), 6);
        expect(d.y2).toBeCloseTo(result.cy + result.r * Math.sin(rad), 6);
        expect(d.width).toBeLessThan(2.5);
        expect(d.stroke).toBe('rgba(180,20,20,0.18)');
      });
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

  test('unlocked drag shows the temporary guide; mobile controls remain usable', async ({ page }) => {
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
    expect(result.lines).toBe(3);
    expect(result.dash).toBe('6 3');
    expect(result.overflow).toBe(false);
    expect(result.barTop).toBeGreaterThanOrEqual(0);
    expect(result.mapWidth).toBe(result.viewportWidth);
    expect(result.barBottom).toBeLessThanOrEqual(result.height);
  });
});
