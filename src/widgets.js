// -----------------------------------------------------------------------------
// Dashboard widget (SDK v0.14+, Gladys 5.1+): the charger at a glance.
//
//   - live tiles bound to the charger features (power, session energy, max
//     current): they follow the published states, nothing to refresh;
//   - a status list computed from the live state (vehicle, charge, mode,
//     lock, cloud connection), nudged by the manager when it changes;
//   - buttons: start / stop the charge, switch to Boost or Eco.
//
// The `charger` setting (a `"source": "devices"` select) picks the charger
// when the account has several; left empty, the first one is shown.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { CHARGE_MODE_LABELS, FEATURE, chargerIds, chargerName } from './devices/charger.js';
import { isLocked } from './hypervolt/state.js';
import { MESSAGES, sameInAllLanguages } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const CHARGER_WIDGET = 'charger_status';

export const WIDGET_ACTIONS = {
  START: 'start_charging',
  STOP: 'stop_charging',
  BOOST: 'mode_boost',
  ECO: 'mode_eco',
};

const UNKNOWN = {
  value: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  color: WIDGET_COLORS.NEUTRAL,
};

const LABELS = {
  title: { en: 'Charger', fr: 'Borne', de: 'Wallbox', es: 'Cargador' },
  power: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  energy: { en: 'Session', fr: 'Session', de: 'Sitzung', es: 'Sesión' },
  maxCurrent: { en: 'Max current', fr: 'Courant max', de: 'Max. Strom', es: 'Corriente máx.' },
  vehicle: { en: 'Vehicle', fr: 'Véhicule', de: 'Fahrzeug', es: 'Vehículo' },
  charge: { en: 'Charge', fr: 'Charge', de: 'Laden', es: 'Carga' },
  mode: { en: 'Charge mode', fr: 'Mode de charge', de: 'Lademodus', es: 'Modo de carga' },
  lock: { en: 'Lock', fr: 'Verrouillage', de: 'Sperre', es: 'Bloqueo' },
  cloud: { en: 'Cloud', fr: 'Cloud', de: 'Cloud', es: 'Nube' },
  start: { en: 'Start charging', fr: 'Lancer la charge', de: 'Laden starten', es: 'Iniciar carga' },
  stop: { en: 'Stop charging', fr: 'Arrêter la charge', de: 'Laden stoppen', es: 'Detener carga' },
  noCharger: {
    en: 'No Hypervolt charger yet: check the integration configuration.',
    fr: 'Aucune borne Hypervolt pour le moment : vérifiez la configuration de l’intégration.',
    de: 'Noch keine Hypervolt-Wallbox: Prüfen Sie die Konfiguration der Integration.',
    es: 'Todavía no hay ningún cargador Hypervolt: revise la configuración de la integración.',
  },
};

function vehicleStatus(state) {
  if (state.car_plugged === true) {
    return {
      value: { en: 'Plugged in', fr: 'Branché', de: 'Angesteckt', es: 'Conectado' },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (state.car_plugged === false) {
    return {
      value: { en: 'Unplugged', fr: 'Débranché', de: 'Nicht angesteckt', es: 'Desconectado' },
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  return UNKNOWN;
}

function chargeStatus(state) {
  if (state.charging === true) {
    return {
      value: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (state.charging === false) {
    return {
      value: { en: 'Idle', fr: 'À l’arrêt', de: 'Inaktiv', es: 'En espera' },
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  return UNKNOWN;
}

function modeStatus(state) {
  const mode = state.charge_mode?.startsWith('super_eco') ? 'super_eco' : state.charge_mode;
  const label = CHARGE_MODE_LABELS[mode];
  if (!label) return UNKNOWN;
  return {
    value: sameInAllLanguages(label),
    color: mode === 'boost' ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.SUCCESS,
  };
}

function lockStatus(state) {
  const locked = isLocked(state);
  if (locked === true) {
    return {
      value: { en: 'Locked', fr: 'Verrouillée', de: 'Gesperrt', es: 'Bloqueado' },
      color: WIDGET_COLORS.WARNING,
    };
  }
  if (locked === false) {
    return {
      value: { en: 'Unlocked', fr: 'Déverrouillée', de: 'Entsperrt', es: 'Desbloqueado' },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return UNKNOWN;
}

function cloudStatus(client) {
  return client.connected
    ? {
        value: { en: 'Connected', fr: 'Connectée', de: 'Verbunden', es: 'Conectado' },
        color: WIDGET_COLORS.SUCCESS,
      }
    : {
        value: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
        color: WIDGET_COLORS.DANGER,
      };
}

function resolveCharger(manager, settings = {}) {
  if (settings.charger) return manager.findByDevice(settings.charger);
  return manager.firstCharger();
}

export const WIDGETS = {
  [CHARGER_WIDGET]: {
    async get(manager, { settings }) {
      logger.debug(`onWidgetGet <- ${CHARGER_WIDGET}`);
      const entry = resolveCharger(manager, settings);
      if (!entry) {
        return {
          ttl_seconds: 60,
          components: [{ type: 'text', variant: 'body', text: LABELS.noCharger }],
        };
      }
      const { charger, client } = entry;
      const { state } = client;
      const ids = chargerIds(manager.gladys, charger.id);
      const charging = state.charging === true;
      return {
        // The computed rows are nudged on every change (see manager.js): the
        // TTL is only a safety net.
        ttl_seconds: 300,
        components: [
          { type: 'text', variant: 'heading', text: chargerName(charger, state).slice(0, 40) },
          {
            type: 'value',
            label: LABELS.power,
            icon: 'zap',
            device_feature: ids.feature(FEATURE.POWER),
          },
          {
            type: 'value',
            label: LABELS.energy,
            icon: 'battery-charging',
            device_feature: ids.feature(FEATURE.SESSION_ENERGY),
          },
          {
            type: 'value',
            label: LABELS.maxCurrent,
            icon: 'sliders',
            device_feature: ids.feature(FEATURE.MAX_CURRENT),
          },
          {
            type: 'status',
            items: [
              { label: LABELS.vehicle, icon: 'truck', ...vehicleStatus(state) },
              { label: LABELS.charge, icon: 'battery-charging', ...chargeStatus(state) },
              { label: LABELS.mode, icon: 'sun', ...modeStatus(state) },
              { label: LABELS.lock, icon: 'lock', ...lockStatus(state) },
              { label: LABELS.cloud, icon: 'cloud', ...cloudStatus(client) },
            ],
          },
          charging
            ? {
                type: 'button',
                label: LABELS.stop,
                icon: 'square',
                style: 'danger',
                action: {
                  key: WIDGET_ACTIONS.STOP,
                  params: { charger: ids.device },
                  confirm: true,
                },
              }
            : {
                type: 'button',
                label: LABELS.start,
                icon: 'play',
                style: 'primary',
                action: { key: WIDGET_ACTIONS.START, params: { charger: ids.device } },
              },
          {
            type: 'button',
            label: sameInAllLanguages('Boost'),
            icon: 'fast-forward',
            style: 'secondary',
            action: { key: WIDGET_ACTIONS.BOOST, params: { charger: ids.device } },
          },
          {
            type: 'button',
            label: sameInAllLanguages('Eco'),
            icon: 'sun',
            style: 'secondary',
            action: { key: WIDGET_ACTIONS.ECO, params: { charger: ids.device } },
          },
        ],
      };
    },

    // Resolve a toast; throwing shows the error to the user.
    async action(manager, { actionKey, params }) {
      logger.info(`onWidgetAction <- ${CHARGER_WIDGET}.${actionKey}`);
      const entry = manager.findByDevice(params?.charger);
      if (!entry) throw new Error(MESSAGES.unknownCharger.en);
      const { client } = entry;
      if (!client.connected) return MESSAGES.chargerOffline;
      switch (actionKey) {
        case WIDGET_ACTIONS.START:
          await client.setCharging(true);
          return MESSAGES.chargingStarted;
        case WIDGET_ACTIONS.STOP:
          await client.setCharging(false);
          return MESSAGES.chargingStopped;
        case WIDGET_ACTIONS.BOOST:
          await client.setChargeMode('boost');
          return MESSAGES.modeChanged;
        case WIDGET_ACTIONS.ECO:
          await client.setChargeMode('eco');
          return MESSAGES.modeChanged;
        default:
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },
};

/** Ask the core to re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
