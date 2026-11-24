# Hypervolt

Controle sus cargadores de vehículos eléctricos
[Hypervolt](https://www.hypervolt.co.uk) (Home 2.0, Home 3.0, Home 3 Pro)
desde Gladys Assistant: iniciar y detener una carga, elegir el modo de carga,
limitar la corriente, bloquear el cargador y seguir en directo la potencia de
carga y la energía de cada sesión.

Gladys aloja esta página y la enlaza desde la pantalla **Configuración** de la
integración.

## Funcionamiento

Los cargadores Hypervolt no tienen API local: la integración se comunica con
ellos a través de la **nube de Hypervolt**, exactamente como la aplicación
móvil Hypervolt. Por lo tanto, Gladys necesita conexión a Internet y el
cargador debe estar en línea (Wi-Fi o Ethernet configurado en la aplicación
Hypervolt). Las tarjetas de los dispositivos muestran una insignia **Nube**,
roja cuando el cargador no está accesible.

La integración mantiene una conexión en directo por cargador: los cambios
aparecen en Gladys en unos segundos, sin sondeo periódico.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico** y la **contraseña** de su cuenta
   Hypervolt (los de la aplicación Hypervolt). La contraseña se guarda como
   secreto.
3. Guarde y haga clic en **Probar la conexión**: el mensaje indica cuántos
   cargadores se han encontrado.
4. Abra la pestaña **Descubrimiento** y añada sus cargadores.

## Qué obtiene, por cargador

| Función              | Descripción                                                         |
| -------------------- | ------------------------------------------------------------------- |
| Carga                | Inicia (on) o detiene (off) la carga                                |
| Vehículo conectado   | Si hay un vehículo conectado                                        |
| Potencia de carga    | Potencia entregada al vehículo, en W                                |
| Corriente de carga   | Corriente entregada al vehículo, en A                               |
| Tensión              | Tensión de alimentación, en V                                       |
| Energía de la sesión | Energía de la sesión en curso (o la última), en kWh                 |
| Corriente máxima     | Límite de corriente, de 6 a 32 A                                    |
| Bloqueo              | Un cargador bloqueado no inicia una nueva carga                     |
| Modo de carga        | Boost (plena potencia), Eco o Super Eco (siguen el excedente solar) |
| Brillo LED           | Brillo del anillo luminoso, en %                                    |
| Potencia de la casa  | Consumo de la casa (cargador con pinza amperimétrica)               |
| Potencia de red      | Consumo de red, negativo al exportar (pinza amperimétrica)          |
| Producción solar     | Producción fotovoltaica (pinza amperimétrica)                       |

Las medidas de casa, red y solar solo se actualizan en un cargador equipado
con las pinzas amperimétricas opcionales.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior), en la categoría **Integraciones**.

Disparadores — opcionalmente limitados a un cargador:

- **Vehículo conectado**;
- **Vehículo desconectado** — `{{triggerEvent.data.session_energy_kwh}}`
  contiene la energía de la sesión;
- **Carga iniciada** — `{{triggerEvent.data.charge_mode}}` contiene el modo
  (`boost`, `eco`, `super_eco`);
- **Carga detenida** (completada, detenida o en pausa) —
  `{{triggerEvent.data.session_energy_kwh}}` contiene la energía de la sesión.

Acciones — cada una devuelve `success`, para condicionar las acciones
siguientes:

- **Iniciar la carga** / **Detener la carga**;
- **Cambiar el modo de carga** (Boost, Eco, Super Eco) — por ejemplo Boost en
  horas valle, Eco el resto del día;
- **Ajustar la corriente máxima** (6 a 32 A) — por ejemplo para no superar la
  potencia contratada cuando la casa consume mucho;
- **Bloquear o desbloquear el cargador**.

Las funciones del dispositivo también funcionan con los disparadores y
acciones estándar de Gladys («estado de un dispositivo», «controlar un
dispositivo»).

## Panel

Añada el widget **Cargador Hypervolt** a un panel: potencia de carga, energía
de la sesión y corriente máxima en directo, estado del vehículo, de la carga,
modo de carga, bloqueo y conexión a la nube, con los botones
**Iniciar/Detener carga**, **Boost** y **Eco**. Con varios cargadores, elija
uno en los ajustes del widget.

## Solución de problemas

- **«Hypervolt ha rechazado el correo electrónico o la contraseña»** —
  compruébelos en la aplicación Hypervolt y vuelva a guardar la configuración.
- **«No se puede acceder a la nube de Hypervolt»** — la integración lo
  reintenta cada minuto; compruebe la conexión a Internet de Gladys.
- **Insignia roja «inaccesible»** — el cargador no está conectado a la nube de
  Hypervolt: compruebe su conexión en la aplicación Hypervolt.
- **Super Eco «battery safe»** — esta variante se muestra como Super Eco.

Consulte los registros de la integración desde la interfaz de Gladys para más
detalles (las contraseñas y los tokens nunca se registran).

Esta integración no está afiliada ni respaldada por Hypervolt Ltd.
