// -----------------------------------------------------------------------------
// Entry point of the Hypervolt integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the Hypervolt manager (src/manager.js).
// It holds NO Hypervolt logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, then starts the manager with the user's configuration.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { HypervoltManager } from './src/manager.js';
import { MANIFEST_ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';
import { MESSAGES } from './src/i18n.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

const manager = new HypervoltManager(gladys, {
  // Live state changes alter the widget's computed rows: nudge open dashboards
  // (rate-limited core-side, dropped silently while disconnected).
  onWidgetChange: () => refreshWidgets(gladys),
});

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the chargers');
  await manager.publishDevices();
});

// --- Command: the user acts on a controllable feature ------------------------
// Throwing sends a success:false acknowledgement to Gladys.
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await manager.setValue(device, feature, value);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(MANIFEST_ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(manager, { fields, config }));
}

// --- Scene actions -------------------------------------------------------------
// Scene TRIGGERS need no handler: the manager fires them with
// publishSceneEvent when a charger state changes (see src/triggers.js).
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(manager, { fields }));
}

// --- Dashboard widgets -------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(manager, request));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
      widget.action(manager, { actionKey, params, settings }),
    );
  }
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> restarting with the new configuration');
  config = normalizeConfig(newConfig);
  await manager.start(config);
  refreshWidgets(gladys);
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await manager.start(config);
    // The nudges sent while the socket was down were dropped: re-sync.
    refreshWidgets(gladys);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  manager.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Hypervolt integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
