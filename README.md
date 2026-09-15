# Portero eléctrico virtual

App de videollamada 100% navegador para el edificio. Ningún número de
teléfono se muestra ni se guarda en ningún lado: cada unidad se identifica
solo por su código (por ej. "3B").

## Cómo funciona

No hace falta ninguna pantalla en la entrada: cada unidad tiene su propio
código QR pegado en el cartel de timbres.

- **`/llamar.html?unit=3B`** — la página que abre el visitante al escanear
  el QR de esa unidad, en su propio celular. Toca "Tocar timbre", se
  activa su cámara y llama directo a esa unidad. No ve el número de nadie
  (ni existe tal número en este sistema).
- **`/vecino.html?unit=3B`** — página personal de cada vecino. La abre una
  sola vez, activa "Avisos de timbre" (notificación push) y la deja
  guardada (agregar a pantalla de inicio). Cuando tocan su timbre, le suena
  una notificación aunque tenga el teléfono bloqueado; la abre y atiende
  por video.
- La videollamada viaja directo entre los dos celulares (WebRTC); el
  servidor solo los pone en contacto (señalización) y manda el aviso push.
- **`/index.html`** — panel con los 11 botones, por si en algún momento sí
  querés sumar una pantalla fija en la entrada. No es necesario para el
  flujo con QR.

## Generar los QR para imprimir

Una vez que tengas la URL definitiva del servidor desplegado (paso
siguiente), corré:

```bash
node scripts/generar-qrs.js https://tu-app.onrender.com
```

Esto genera `qrs-para-imprimir.html`: una hoja con un QR por unidad, lista
para abrir en el navegador e imprimir (o exportar a PDF con Ctrl+P). Volvé
a correr el script si alguna vez cambia la URL del servidor.

## Instalación local

```bash
npm install
npm start
```
Abrí `http://localhost:3000/llamar.html?unit=1A` (visitante) y
`http://localhost:3000/vecino.html?unit=1A` (vecino) en dos pestañas para
probar.

## Poner las unidades reales

Editá `units.json` con los códigos y etiquetas de cada departamento. No
hace falta ningún número de teléfono.

## Desplegarlo gratis (para que funcione desde cualquier lado)

1. Subí esta carpeta a un repositorio de GitHub.
2. Creá una cuenta gratis en [Render.com](https://render.com).
3. "New Web Service" → conectá el repo → Build command: `npm install` →
   Start command: `npm start`. El plan free alcanza sobra para esto.
4. (Recomendado) Generá tus propias claves VAPID antes de ir a producción:
   ```bash
   npx web-push generate-vapid-keys
   ```
   y cargalas en Render como variables de entorno `VAPID_PUBLIC_KEY` y
   `VAPID_PRIVATE_KEY` (las que trae el código ahora son solo para probar).
5. Una vez desplegado, tenés una URL fija tipo
   `https://portero-tu-edificio.onrender.com`. Esa es la que ponés en la
   tablet de la entrada, y `https://.../vecino.html?unit=1A` es el link
   que le pasás a cada vecino (por unidad).

### Importante sobre el plan gratuito

Render free "duerme" el servidor tras ~15 min sin uso. Eso significa que
si nadie tocó el timbre en un rato, el primer llamado puede tardar unos
20-30 segundos en "despertar" el servidor antes de sonar. Si eso no te
sirve para un portero de uso diario, las alternativas son: un plan pago
económico de Render (evita el sleep) o un servidor propio (VPS chico).

### Sobre la conexión de video en sí

Se usa un servidor STUN público (Google) para que los dos navegadores se
encuentren. En la enorme mayoría de los casos alcanza. Si notás que a
veces no conecta (redes 4G muy restrictivas, por ejemplo), el siguiente
paso sería sumar un servidor TURN gratuito (hay opciones como el de Open
Relay Project) — lo puedo agregar cuando quieras.

## Qué NO hace (todavía)

- No graba las llamadas.
- No tiene apertura de puerta eléctrica integrada (si el portero también
  abre la puerta, eso sigue siendo el sistema físico actual del edificio).
- No tiene login/contraseña — cualquiera con el link de una unidad puede
  ver su página. Si eso te preocupa, se le puede agregar una clave simple
  por unidad.
