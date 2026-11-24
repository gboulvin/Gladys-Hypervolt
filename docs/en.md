# Hypervolt

Control your [Hypervolt](https://www.hypervolt.co.uk) EV chargers (Home 2.0,
Home 3.0, Home 3 Pro) from Gladys Assistant: start and stop a charge, pick the
charge mode, limit the current, lock the charger, and follow the charging
power and the energy of each session live.

Gladys re-hosts this page and links it from the **Configuration** screen of
the integration.

## How it works

Hypervolt chargers have no local API: the integration talks to them through
the **Hypervolt cloud**, exactly like the Hypervolt mobile app. Gladys
therefore needs an Internet connection, and the charger must be online
(its Wi-Fi or Ethernet connection set up in the Hypervolt app). The device
cards show a **Cloud** badge, red when the charger cannot be reached.

The integration keeps one live connection per charger: changes appear in
Gladys within seconds, without polling.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **email** and **password** of your Hypervolt account (the ones
   you use in the Hypervolt app). The password is stored as a secret.
3. Save, then click **Test the connection**: the message tells how many
   chargers were found.
4. Open the **Discovery** tab and add your chargers.

## What you get, per charger

| Feature            | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| Charging           | Start (on) or stop (off) the charge                             |
| Vehicle plugged in | Whether a vehicle is connected                                  |
| Charging power     | Power delivered to the vehicle, in W                            |
| Charging current   | Current delivered to the vehicle, in A                          |
| Voltage            | Supply voltage, in V                                            |
| Session energy     | Energy delivered during the current (or last) session, in kWh   |
| Max current        | Current limit, from 6 to 32 A                                   |
| Lock               | A locked charger refuses to start a new charge                  |
| Charge mode        | Boost (full power), Eco or Super Eco (follow the solar surplus) |
| LED brightness     | Brightness of the LED ring, in %                                |
| House power        | House consumption (charger fitted with a CT clamp)              |
| Grid power         | Grid import, negative when exporting (CT clamp)                 |
| Solar generation   | Solar production (CT clamp)                                     |

The house, grid and solar readings only update on a charger fitted with the
optional current clamps.

## Scenes

The integration adds its own cards to the scene editor (Gladys 5.1 or later),
under the **Integrations** category.

Triggers — optionally restricted to one charger:

- **Vehicle plugged in**;
- **Vehicle unplugged** — `{{triggerEvent.data.session_energy_kwh}}` holds
  the energy of the session;
- **Charging started** — `{{triggerEvent.data.charge_mode}}` holds the mode
  (`boost`, `eco`, `super_eco`);
- **Charging stopped** (complete, stopped or paused) —
  `{{triggerEvent.data.session_energy_kwh}}` holds the energy of the session.

Actions — each returns `success`, so the following actions can depend on it:

- **Start charging** / **Stop charging**;
- **Set the charge mode** (Boost, Eco, Super Eco) — for instance Boost during
  off-peak hours, Eco the rest of the day;
- **Set the max current** (6 to 32 A) — for instance to stay under your
  subscribed power when the house consumes a lot;
- **Lock or unlock the charger**.

The device features also work with the standard Gladys triggers and actions
("device state", "control a device").

## Dashboard

Add the **Hypervolt charger** widget to a dashboard: live charging power,
session energy and max current, the state of the vehicle, of the charge, the
charge mode, the lock and the cloud connection, with **Start/Stop charging**,
**Boost** and **Eco** buttons. With several chargers, pick one in the widget
settings.

## Troubleshooting

- **"Hypervolt refused the email or the password"** — check them in the
  Hypervolt app, then save the configuration again.
- **"The Hypervolt cloud cannot be reached"** — the integration retries every
  minute; check the Internet connection of Gladys.
- **Red "unreachable" badge** — the charger is offline from the Hypervolt
  cloud: check its connection in the Hypervolt app.
- **Super Eco shows as Super Eco even with "battery safe"** — the battery-safe
  variant is displayed as Super Eco.

Check the integration logs from the Gladys UI for details (passwords and
tokens are never logged).

This integration is not affiliated with or endorsed by Hypervolt Ltd.
