// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen (manifest
// `actions` field). Each handler resolves the multi-language message shown
// under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { connectionOkMessage } from './i18n.js';

const logger = createLogger({ name: 'actions' });

export const MANIFEST_ACTIONS = {
  // Log in again, list the chargers and reconnect them: the "it does not work,
  // try again" button, and the proof that the credentials are right.
  async test_connection(manager, { config }) {
    logger.info('Action test_connection');
    const outcome = await manager.start(config);
    return outcome.ok ? connectionOkMessage(outcome.count) : outcome.message;
  },
};
