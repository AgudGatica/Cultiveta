# Hoja de ruta de Cultiveta

Próximas funciones, ordenadas por prioridad. La idea central: todo conectado alrededor del cultivo
y de la mascota de la app. Fuente: "Cultiveta — Hoja de ruta de pendientes" (documento del 2026-10-27).

| # | Función | Estado (2026-10-27) |
|---|---|---|
| 1 | Línea de tiempo con forma de planta | En curso |
| 2 | Enchufes inteligentes por Wi-Fi | En curso (2026-10-31): etapas 1, 2a y 2b hechas (a mano + Equipos; Smart Life real; bomba y clima). Faltan riego automático, eWeLink y Shelly |
| 3 | Indoors / carpas | Pendiente. Referencia: "Espacios" de Canopia. Cambia el modelo de datos |
| 4 | Comunidad | Pendiente. Necesita servidor y moderación (exigida por Google Play) |
| 5 | Privacidad y ubicación | Pendiente. Tiene que estar antes o junto con la Comunidad |
| 6 | Mascota personalizable | Falta definir la mascota oficial. Experiencia, niveles, logros y racha ya están hechos |
| 7 | Minijuego endless runner | Depende de la mascota. Declarar bien la clasificación por edad en Play Store |
| 8 | Monetización | Pendiente. AdMob restringe apps de cannabis; Play Billing sí sirve para suscripciones |
| 9 | Indoor en 3D | Muy a futuro |

Orden sugerido: 1 → 3 → 5 → 4 → 6 → 7. El 2 ya empezó (etapa 1, con los equipos colgados de cada cultivo hasta que existan los indoors); el 8 cuando haya algo para vender.

---

## 1. Línea de tiempo con forma de planta (prioridad máxima)

- **Ubicación:** dentro de cada cultivo.
- **Dirección:** vertical, de abajo hacia arriba. Abajo está el inicio (una maceta) y arriba lo más reciente.
- **Forma:** la línea es el tallo de una planta.
- **Crecimiento real:** el tallo se estira a medida que avanza el cultivo. Un cultivo nuevo muestra una plantita chica.
- **Etapas:** la planta de arriba cambia según la etapa: hojas en vegetativo y flores recién en floración.
- **Contenido:** riegos importantes, notas y siempre las fotos.
- **Referencia:** una app tipo Canopia o Brote.

## 2. Enchufes inteligentes por Wi-Fi

- Reutilizar la misma función que ya existe en la app Órbita.
- Ver las horas de luz.
- Configurar superciclos.
- Medir humedad.
- Automatizaciones: según la humedad, prender o apagar distintos dispositivos.
- Sugerencia: evaluar que sea una función de Cultiveta Pro.

**Etapa 1 (hecha, 2026-10-31), sin equipos todavía, traída de Órbita:**
- En cada cultivo indoor, la tarjeta **Luz**: prendida o apagada, cuenta regresiva al próximo cambio,
  horas de luz y de oscuridad, y el gráfico de los próximos 7 días (marcas cada 3 h). A mano funciona como
  un timer: se carga la hora de encendido (y, en un superciclo, el día de un encendido). Guarda
  `lighting.lightsOnTime` y `lighting.lightsOnDate`. Cálculo en `src/utils/lightCycle.ts`.
- Ambiente y Riego siguen a mano como antes, con "Conectar mi sensor" y "Conectar bomba o sonda" en sus
  tarjetas y al pie de los formularios.
- **Equipos** en el menú "Más" (y en la barra lateral): tus equipos, conectar uno nuevo por marca
  (Smart Life, Sonoff / eWeLink, Shelly: "Próximamente"), qué hace cada equipo y Qué comprar con
  búsquedas de Mercado Libre.
- Sin tareas ni actividad de Órbita (Cultiveta ya tiene las suyas).

**Etapa 2a (hecha, 2026-10-31): Smart Life real.** En Equipos se conecta el proyecto de iot.tuya.com (o una zapatilla de
prueba), se ven los equipos y se asigna cada toma como luz de un cultivo indoor, o cada sensor como ambiente o sustrato. Al
asignar la luz se pausan los horarios de la app Smart Life de ese toma (vuelven al desasignar o desconectar) y el horario
queda cargado en Smart Life (diario en ciclos de 24 h; la semana en superciclos, que pasan a poder elegirse). El cultivo
muestra el estado del enchufe y lo que mide el sensor. Servidor: `src/server/devices/` (cliente de Tuya con la firma oficial,
husos horarios, horario cargado y `DeviceService`); rutas `/api/devices/*` y `/api/internal/devices-tick` (cada 15 min,
Cloud Scheduler). Las claves van en `deviceIntegrations` (solo el servidor). Pendientes tuyos en PENDIENTES.md.

**Etapa 2b (hecha, 2026-10-31): bomba y equipos de clima.** Un toma se asigna como bomba de riego (solo con cuenta
regresiva: se apaga sola; topes de segundos y litros; "Regar" en el cultivo anota el riego) o como equipo de clima
(extractor, intracción, ventilador, humidificador, deshumidificador, calefactor, refrigeración): por sensor, con margen
para no prender y apagar sin parar, valores de noche y qué hacer si el sensor se calla; o siguiendo a la luz (o al revés),
que queda cargado en Smart Life. Lógica en `src/utils/deviceRules.ts`; el cultivo muestra la tarjeta "Equipos del cultivo".

**Etapa 2c (hecha, 2026-10-31): riego automático.** En Equipos, la bomba suma "Riego automático": programado (unos
minutos después de prender o antes de apagar la luz, o a una hora fija; en uno o varios pulsos con pausa) o por humedad del
sustrato (riega al llegar a "seco" y sigue con pausas hasta "húmedo", con tope por día; con la luz apagada no riega). Lo
decide la revisión del servidor cada 5 min, con los mismos topes y la cuenta regresiva de "Regar"; si el servidor estuvo
caído, un riego programado que se pasó no se hace tarde. Cada riego queda anotado en los riegos del cultivo. Lógica en
`src/server/devices/autoIrrigation.ts` y `src/utils/deviceRules.ts`.

**Etapa 2d (hecha, 2026-10-31): Sonoff / eWeLink y Shelly.** En Equipos hay tres marcas y una sola lista de equipos (cada
uno dice de qué marca es); las reglas, la bomba y el riego automático andan igual en las tres. Las dos marcas nuevas pasan por
un enrutador (`src/server/devices/cloud.ts`) que les hace "hablar como" Tuya. Cómo queda el horario de la luz:
- **eWeLink:** la persona inicia sesión en eWeLink (una app de Cultiveta en dev.ewelink.cc; variables `EWELINK_APP_ID`,
  `EWELINK_APP_SECRET` y `EWELINK_REDIRECT_URL`). El horario queda como un bucle guardado en el Sonoff, que no vence; se
  pausan los temporizadores de la persona en ese toma. La bomba usa el "inching" del equipo (solo en los que lo tienen).
- **Shelly:** con el server y la clave de autorización de la nube de la app Shelly (si la lista no trae algún equipo, se
  agrega su Device Id). La nube de Shelly no deja guardar horarios: la revisión de cada 5 min deja programado cada cambio
  en el equipo (`toggle_after`, se da vuelta solo a horario) y el siguiente apenas pasa uno. La bomba también se apaga
  sola con `toggle_after`. Lo que la persona tenga en la app Shelly no se ve desde la nube (se le pide pausarlo).
Todo corre en el servidor de Cultiveta (Cloud Run + Cloud Scheduler, como el clima exterior). Con servidor en la nube no
hace falta dejar una PC prendida ni la regla de "entrar una vez por semana" de Órbita. Detalle técnico en
`Cultiveta-referencias/TRASPASO.md` (O18–O20).

## 3. Sistema de indoors / carpas

- En Mis Cultivos, el usuario crea un indoor o carpa.
- Dentro del indoor se configuran luces, horarios y demás parámetros.
- Cada indoor contiene sus plantas y muestra todas las genéticas que hay adentro.
- Se integra con los enchufes inteligentes (luz y humedad por indoor).

## 4. Comunidad (red social)

- **Identidad a elección del usuario:**
  - Cuenta de Google.
  - Foto propia.
  - Incógnito: avatar (diseñado junto con la mascota) más nombre de usuario, sin revelar identidad.
- **Cultivos públicos o privados:**
  - Públicos: cualquiera los ve; se pueden buscar por genética, reputación del usuario y nivel.
  - Privados: solo los ve el dueño.
- Al terminar un cultivo, se puede publicar y compartir dentro de la app.
- Sugerencia: moderación desde el primer día (denunciar, bloquear usuarios).

## 5. Privacidad y ubicación

- La ubicación nunca se muestra automáticamente.
- Borrar los datos internos de las fotos (metadatos, incluida la ubicación) en todas las publicaciones.
- Al publicar, el usuario puede agregar opcionalmente una ubicación general (por ejemplo: Argentina, Buenos Aires), nunca una específica.

## 6. Mascota personalizable

- Requiere definir antes la mascota oficial de Cultiveta.
- Sistema de experiencia y niveles.
- Tienda de cosméticos para personalizar la mascota.
- La mascota aparece en la app dando resúmenes del cultivo y alertas.
- Se puede usar como foto de perfil en vez de una foto propia, para que otros usuarios te reconozcan por ella (estilo NFT).

## 7. Minijuego endless runner

- Protagonista: un cogollo (la mascota) que rueda hacia adelante esquivando obstáculos.
- Vidas: cogollitos que se te van cayendo; no tenés que llegar a cero.
- Recuperar vidas: pasando por zonas especiales (por ejemplo, donde se está armando un porro).
- Puntos: más tiempo jugando, más puntos.
- Ranking semanal: el top de jugadores gana skins o Cultiveta Pro por tiempo limitado.
- Límite de partidas: tentativamente 3 por día (o vinculado a los riegos, a definir), para evitar abusos y sumar competitividad.
- Sugerencias: validación anti trampas de puntajes; bonus de puntos por registrar riegos o fotos.

## 8. Monetización

- Cosméticos: con muchos puntos o con dinero real como atajo.
- Cultiveta Pro: suscripción mensual o anual con funciones avanzadas (a definir).
- Publicidad: posible. Ojo: redes como Google AdMob suelen restringir apps de cannabis; conviene apuntar a anunciantes del rubro (bancos de semillas, growshops).

## 9. Muy a futuro: indoor en 3D

- Modelo 3D interactivo del indoor.
- Poder entrar y recorrer cada planta y genética.
