# Registre Diari EF — Guia d'Ús i Sincronització al Núvol (Mòbil, Tablet i PC)

Aquesta aplicació web (PWA) està dissenyada per portar el **Registre Diari** i el **Registre Acumulat** de les sessions d'Educació Física en català, fidel a la fulla oficial però amb un estil modern, tàctil i sincronitzat.

---

## 1. Com obrir-la ara mateix a l'ordinador
Fes doble clic sobre el fitxer [`index.html`](./index.html) i s'obrirà directament al teu navegador (Chrome, Edge, Safari o Firefox).

---

## 2. Com portar-la al Mòbil i a la Tablet (en 30 segons)
Per poder obrir l'aplicació des del navegador del teu **mòbil o tablet (iPad / Android)** i instal·lar-la a la pantalla d'inici com una App nativa:

1. Entra des de l'ordinador a **[app.netlify.com/drop](https://app.netlify.com/drop)** (o puja la carpeta a GitHub Pages).
2. Arrossega la carpeta **`REGISTREF`** sencera dins de la pàgina.
3. Et donarà un enllaç web privat (per exemple: `https://el-meu-registre-ef.netlify.app`).
4. Obre aquest enllaç al **mòbil o tablet** i selecciona **"Afegir a la pantalla d'inici"** (a Safari d'iPad/iPhone o Chrome d'Android).

---

## 3. Com activar la Base de Dades al Núvol (Sincronització automàtica)
Dins de l'aplicació, prem el botó **"Núvol: Local"** de la barra superior. Tens **dues opcions 100% gratuïtes** amb el teu compte de Google:

### Opció A: Google Drive / Google Sheets (via Apps Script)
Ideal si vols que totes les dades es guardin dins del teu propi compte de Google Drive:
1. Crea un full de càlcul nou a **Google Sheets** i ves al menú **Extensions → Apps Script**.
2. Dins de l'aplicació Registre EF, prem **"Copiar codi Apps Script"** i enganxa'l a l'editor d'Apps Script.
3. Prem **Implementa (Deploy) → Nova implementació → Aplicació web** i a *Qui hi té accés* selecciona **Qualsevol persona (Anyone)**.
4. Copia la URL generada i enganxa-la a l'apartat **Núvol** de l'app (al mòbil, tablet i PC).

### Opció B: Google Firebase Realtime Database
Ideal per a sincronització instantània:
1. Entra a [console.firebase.google.com](https://console.firebase.google.com/), crea un projecte i activa **Realtime Database** (en *Test mode*).
2. Copia la URL de la base de dades (acaba en `.firebasedatabase.app`) i enganxa-la al modal **Núvol** de l'aplicació al mòbil, tablet i PC.

---

## 4. Funcionament del Registre Diari i Acumulat

* **Fulla de Sessió Diària**:
  * **Faltes d'assistència**: Si toques el **nom d'un alumne**, la seva fila s'atenua i apareix l'etiqueta `FALTA`.
  * **Conductes negatives (Ratlletes)**: Toques qualsevol casella de *Benestar Personal* o *Actitud i Participació* i es dibuixa una **ratlleta** (agrupades de 5 en 5) amb la data de la sessió adjunta.
  * **Esborrar una ratlleta**: Pots prémer el botó `-` que apareix a la casella, fer clic dret o activar el botó **"Mode: Esborrar ratlleta"**.
  * **Finalitzar Sessió**: En prémer **"Finalitzar i Acumular Sessió"**, la sessió es guarda a la barra superior (`1` a `35`), es bolca a l'Acumulat i la fulla diària queda preparada i neta per a la següent sessió.

* **Registre Acumulat**:
  * Mostra **només el número total** a cada casella de conducta, més la columna de **FALTES** i **TOTAL**.
  * **Passar per sobre (PC)**: Mostra a l'instant un requadre flotant amb les dates exactes de cada ratlleta o falta.
  * **Prémer sobre la casella (Mòbil / Tablet / PC)**: Obre una finestra amb el dibuix de les **ratlletes** i la llista detallada del **dia exacte i número de sessió** de cadascuna.
  * **Prémer sobre el nom de l'alumne**: Obre la **Fitxa Completa de l'Alumne** amb el resum trimestral.
