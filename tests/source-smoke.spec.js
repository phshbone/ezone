const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Post-skills-audit baseline: guarded by Smoke Test v1.1.2 and Live Smoke Test v1.3.
const indexSource = fs.readFileSync('index.html', 'utf8');
const feedbackSource = fs.readFileSync('feedback.html', 'utf8');
const normalizedIndexSource = indexSource.replace(/\s+/g, ' ');

test.describe('E-Zone regular source smoke', () => {
  test('200-foot zone cannot lock from a short drag', async () => {
    expect(indexSource).toContain('reachedRequiredRadius');
    expect(indexSource).toContain('STATE.arcData.radiusM >= CONFIG.defaultRadiusMeters - 0.05');
    expect(indexSource).toContain('Drag to the full 200 ft before releasing.');
    expect(indexSource).toContain('STATE.arcData.radiusM = CONFIG.defaultRadiusMeters');
  });

  test('feedback requires an explicit backend success response', async () => {
    expect(feedbackSource).not.toContain("mode: 'no-cors'");
    expect(feedbackSource).toContain('data.success === true');
    expect(feedbackSource).toContain('if (!res.ok || !accepted)');
  });

  test('old builder bypass is absent', async () => {
    expect(indexSource).not.toContain('builderBypassCode');
    expect(indexSource).not.toContain('Builder bypass accepted');
  });

  test('browser routing values are not labeled as secrets', async () => {
    expect(indexSource).not.toContain('SECRET_TOKEN');
    expect(feedbackSource).not.toContain('SECRET_TOKEN');
    expect(indexSource).toContain('not an authentication secret');
    expect(feedbackSource).toContain('not an authentication secret');
  });

  test('privacy wording matches beta-record and photo transmission behavior', async () => {
    expect(normalizedIndexSource).toMatch(
      /submits agreement\/check-in records and tester feedback through the (?:designated E-Zone tester system|connected E-Zone submission system)/i,
    );
    expect(normalizedIndexSource).toMatch(/name, device\/browser information/i);
    expect(normalizedIndexSource).toMatch(
      /Evidence photos are queued on the device.*send-to-BOE action/i,
    );
  });

  test('campaign sign is preferred, smaller, and used consistently in the DROP control', async () => {
    expect(indexSource).toContain("iconUrl: 'assets/campaign-sign-marker.svg'");
    expect(indexSource).toContain('iconSize: [46, 66]');
    expect(indexSource).toContain('iconAnchor: [23, 66]');
    expect(indexSource).toContain('LEGACY_INCIDENT_ICON = L.divIcon');
    expect(indexSource).toContain('INCIDENT_ICON = CAMPAIGN_SIGN_ICON');
    expect(indexSource).toContain('const CAMPAIGN_BUTTON_ICON');
    expect(indexSource).toContain("label: 'DROP ' + CAMPAIGN_BUTTON_ICON");
    expect(indexSource).not.toContain('const STAKE_BUTTON_SVG');
  });

  test('photo previews preserve intrinsic aspect ratio', async () => {
    expect(indexSource).toContain('max-width:100%;width:auto;height:auto;max-height:58vh');
    expect(indexSource).toContain('max-width:100%;width:auto;height:auto;max-height:55vh');
    expect(indexSource).toContain('max-width: 84%;');
    expect(indexSource).toContain('object-fit: contain;');
  });

  test('BOE send is bounded and preserves queued photos on weak or missing internet', async () => {
    expect(indexSource).toContain('const MAX_RETRIES = 1;');
    expect(indexSource).toContain('const SEND_TIMEOUT_MS = 20000;');
    expect(indexSource).toContain('new AbortController()');
    expect(indexSource).toContain('if (!navigator.onLine)');
    expect(indexSource).toContain('photos are still queued');
    expect(indexSource).toContain('Try again when signal improves');
  });

  test('Help wording follows the current incident and BOE workflow', async () => {
    expect(indexSource).toContain('Done adding incidents?');
    expect(indexSource).toContain('Send pics to BOE?');
    expect(indexSource).toContain('Photos stay queued until BOE confirms a successful send');
    expect(indexSource).toContain('alt="campaign sign"');
  });
  test('screenshot export deliberately composites the campaign sign', async () => {
    expect(indexSource).toContain('function drawCampaignSignCanvas');
    expect(indexSource).toContain('function compositeIncidentMarkers');
    expect(indexSource).toContain('onclone: (clonedDoc) =>');
    expect(indexSource).toContain('campaign-sign-marker.svg');
    expect(indexSource).toContain('compositeIncidentMarkers(canvas);');
  });

  test('Help patriotic frame and locator symbols are explicit', async () => {
    expect(indexSource).toContain('instr-stars instr-stars-top');
    expect(indexSource).toContain('instr-stars instr-stars-bottom');
    expect(indexSource).toContain('instr-locator instr-locator-drag');
    expect(indexSource).toContain('instr-locator instr-locator-return');
    expect(indexSource).toContain('width:26px;height:37px');
    expect(indexSource).toContain('instr-nav-hint');
  });

});
