// -----------------------------------------------------------------------------
// User-facing messages.
//
// Every text the integration shows to the user (action results, connection
// status, widget labels, toasts) is a multi-language object. Gladys picks the
// user's language and falls back to `en`. The integration ships English,
// French, German and Spanish: keep the four in sync.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MESSAGES = {
  missingCredentials: {
    en: 'Enter the email and password of your Hypervolt account.',
    fr: 'Renseignez l’e-mail et le mot de passe de votre compte Hypervolt.',
    de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres Hypervolt-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta Hypervolt.',
  },
  invalidCredentials: {
    en: 'Hypervolt refused the email or the password.',
    fr: 'Hypervolt a refusé l’e-mail ou le mot de passe.',
    de: 'Hypervolt hat die E-Mail-Adresse oder das Passwort abgelehnt.',
    es: 'Hypervolt ha rechazado el correo electrónico o la contraseña.',
  },
  cannotConnect: {
    en: 'The Hypervolt cloud cannot be reached, retrying.',
    fr: 'Le cloud Hypervolt est injoignable, nouvelle tentative en cours.',
    de: 'Die Hypervolt-Cloud ist nicht erreichbar, neuer Versuch läuft.',
    es: 'No se puede acceder a la nube de Hypervolt, reintentando.',
  },
  noCharger: {
    en: 'No charger is linked to this Hypervolt account.',
    fr: 'Aucune borne n’est associée à ce compte Hypervolt.',
    de: 'Mit diesem Hypervolt-Konto ist keine Wallbox verknüpft.',
    es: 'No hay ningún cargador vinculado a esta cuenta Hypervolt.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les logs de l’intégration.',
    de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Protokolle der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  unknownCharger: {
    en: 'This charger is not known to the integration.',
    fr: 'Cette borne est inconnue de l’intégration.',
    de: 'Diese Wallbox ist der Integration nicht bekannt.',
    es: 'Este cargador es desconocido para la integración.',
  },
  chargerOffline: {
    en: 'The charger is not connected to the Hypervolt cloud right now.',
    fr: 'La borne n’est pas connectée au cloud Hypervolt pour le moment.',
    de: 'Die Wallbox ist gerade nicht mit der Hypervolt-Cloud verbunden.',
    es: 'El cargador no está conectado a la nube de Hypervolt en este momento.',
  },
  chargingStarted: {
    en: 'Charging requested.',
    fr: 'Charge demandée.',
    de: 'Laden angefordert.',
    es: 'Carga solicitada.',
  },
  chargingStopped: {
    en: 'Charging stopped.',
    fr: 'Charge arrêtée.',
    de: 'Laden gestoppt.',
    es: 'Carga detenida.',
  },
  modeChanged: {
    en: 'Charge mode changed.',
    fr: 'Mode de charge modifié.',
    de: 'Lademodus geändert.',
    es: 'Modo de carga cambiado.',
  },
};

/**
 * Build the result message of the `test_connection` action.
 * @param {number} count number of chargers found on the account
 */
export function connectionOkMessage(count) {
  return {
    en: `Connected to Hypervolt: ${count} charger(s) found.`,
    fr: `Connecté à Hypervolt : ${count} borne(s) trouvée(s).`,
    de: `Mit Hypervolt verbunden: ${count} Wallbox(en) gefunden.`,
    es: `Conectado a Hypervolt: ${count} cargador(es) encontrado(s).`,
  };
}

/** Same text in every supported language (names, numbers...). */
export function sameInAllLanguages(text) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, text]));
}
