# Partitio 🎹

Application web pédagogique pour professeurs et élèves de musique permettant de **générer automatiquement, afficher, jouer, surligner en direct et imprimer** des partitions de piano.

---

## ✨ Fonctionnalités

1. **Paramètres musicaux entièrement personnalisables** :
   - **Tonalité** : 15 tonalités majeures et 15 tonalités mineures avec armures correctes.
   - **Types de mineur** : Mineur harmonique (sensible haussée), naturel ou mélodique (ascendant avec 6e et 7e haussées / descendant naturel).
   - **Signature rythmique** : 2/4, 3/4, 4/4, 6/8, 2/2, 3/8, 5/4, 12/8.
   - **Nombre de mesures** : de 1 à 32 mesures.
   - **Niveau de difficulté (5 niveaux progressifs)** :
     - *1. Initiation* : tout débutant, position fixe 5 doigts (Do-Sol), valeurs longues (noires, blanches, rondes), tonalités simples ($\le 1$ altération).
     - *2. Débutant* : croches simples, ambitus d'une octave, triades fondamentales tenues, jusqu'à 2 altérations.
     - *3. Intermédiaire* : noires pointées, croches variées, basse d'Alberti, valse, accords de 7e de dominante (V7).
     - *4. Avancé* : doubles-croches, syncopes, accords de 7e diversifiés (ii7, IVmaj7, vi7), mélodie harmonisée à 2 voix.
     - *5. Virtuose* : polyphonie pianistique riche, accords très enrichis (9e, 11e, 13e, sus4), arpèges rapides, registre étendu et toutes les tonalités.
   - **Mains / Portées** : Deux mains (Grand portée Clés de Sol & Fa), Main droite seule (Clé de Sol), ou Main gauche seule (Clé de Fa).
   - **Accords enrichis (7e, 9e, 11e, sus4, add9)** :
     - *Automatique (progressif)* : niveau 1 sans accords (triades simples), niveau 2 cadences V7, niveau 3 7e/add9, niveau 4 9e/sus4, niveau 5 9e/11e/13e.
     - *Deux mains* : mélodie MD harmonisée + basse et accords MG enrichis.
     - *Main droite seule* : mélodie MD enrichie d'accords et contre-chants.
     - *Main gauche seule* : basse, voicings et motifs MG enrichis.
     - *Accords de 7e uniquement* : limitation ciblée aux 7èmes sur les deux mains.
     - *Accords très enrichis 9e / 11e / 13e* : voicings étendus et arpèges amples sur les deux mains.
     - *Désactivé* : accords parfaits et triades simples uniquement.
   - **Ambitus contrôlé (Note la plus basse & Note la plus haute)** : permet de fixer la note la plus grave (de Do1 à Do4) et la note la plus aiguë (de Do3 à Do7) que la partition peut atteindre. Idéal pour adapter l'exercice aux compétences de lecture de l'élève (éviter les lignes supplémentaires) ou au clavier utilisé (49, 61 ou 88 touches).
   - **Mode Aléatoire (🎲)** : chaque paramètre pédagogique dispose d'une case « Aléa » permettant un tirage au sort automatique à chaque génération (y compris les limites d'ambitus et les accords enrichis).

2. **Curseur de Tempo (BPM) & Métronome en direct** :
   - Le tempo se règle facilement et directement via le curseur de la barre de transport (de 40 à 200 BPM) avec indication des termes italiens usuels (*Largo*, *Adagio*, *Andante*, *Moderato*, *Allegro*, *Presto*). Il est gravé sur la première mesure de la partition et modifiable en direct pendant ou avant la lecture.
   - Métronome audible synchronisé (clic sonore).

3. **Mémoire automatique des réglages** :
   - Au démarrage, l'application restaure automatiquement vos derniers paramètres et la dernière partition générée via `localStorage`.

4. **Affichage adaptatif à l'ambitus du morceau** :
   - **Gravure VexFlow dynamique** : adaptation automatique de la marge supérieure (`topPadding`), de l'écartement inter-portées (`interStaveGap`) et de la marge inférieure (`bottomPadding`). Aucune note aiguë ou grave, hampe ou indication de tempo n'est coupée ou écrasée, quelle que soit la tessiture du morceau (de Do1 à Do7).
   - **Réglette & Clavier d'ambitus interactif** : un mini-clavier visuel situé au-dessus de la partition surligne l'étendue exacte des notes jouées par la main gauche (bleu cyan) et la main droite (rose fuchsia), avec repères d'octaves, Do central et pastilles sur la note minimale et maximale.
   - **Analyse des intervalles** : indication textuelle précise de l'ambitus en demi-tons et octaves (ex. *4 octaves*, *1 octave et quinte*).

5. **Lecture audio réaliste (Piano Web Audio)** :
   - Synthétiseur de piano physique modélisé avec la **Web Audio API** (sans banques d'échantillons lourdes).
   - Oscillateurs multi-harmoniques avec inharmonicité, filtre dynamique simulant l'étouffoir et réverbération intégrée.

6. **Exécution & Export MIDI** :
   - **Sortie Web MIDI** : envoyez directement les notes vers un piano numérique, clavier maître ou synthétiseur physique connecté en USB/MIDI.
   - **Export `.mid`** : téléchargez la partition au format Standard MIDI File (format 1, 2 pistes pour main droite et main gauche, tempo et armure inclus).

7. **Surlignage visuel interactif** :
   - Pendant la lecture, **la note en cours de jeu s'illumine en direct** sur la portée (rose/ambre lumineux avec halo).
   - Défilement automatique vers le système (la ligne) en cours de lecture.
   - Possibilité de cliquer sur n'importe quelle note de la partition pour l'écouter.

8. **Aide à la lecture en direct (Note la plus aiguë & Accord en cours)** :
   - Option activable d'un clic (barre de transport ou panneau de réglages) « 🎯 Note & Accord ».
   - Affiche en grand, en temps réel et synchronisé avec la lecture :
     - Le **nom de la note la plus aiguë** qui sonne à chaque instant (ex: *Sol 4*, *Mi 5*, *Do 3*).
     - Le **nom complet et le degré de l'accord** en cours dans la mesure (ex: *Do majeur (I)*, *Sol 7 (V)*, *Ré mineur (ii)*, *La mineur (vi)*).
     - Le numéro de la mesure en cours.
   - Idéal pour les élèves et professeurs lors du déchiffrage et de l'analyse harmonique.

9. **Affichage adaptatif (PC / Téléphone)** :
   - Gravure vectorielle SVG propulsée par VexFlow.
   - La partition recalcule dynamiquement le nombre de mesures par portée et l'échelle selon la largeur de votre écran (PC, tablette ou smartphone).
   - Panneau de réglages repliable d'un clic pour maximiser l'espace de lecture.

9. **Impression prête pour les cours (A4)** :
   - Feuille de styles d'impression dédiée `@media print` masquant toute l'interface pour ne conserver que la partition nette, le titre, le cartouche d'ambitus et les informations de tonalité / mesure sur feuille blanche A4.
   - Bouton « 🖨️ Imprimer » en un clic.

---

## 🚀 Utilisation en local (API Python `music21` + Front-end)

La génération musicale est assurée par une API Python (**FastAPI + `music21`**) appelée par le client JavaScript (`POST /api/generate`). Le serveur FastAPI sert également le front-end (`docs/`) sur la même origine.

### 1. Installer les dépendances Python et démarrer le serveur
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --host 0.0.0.0 --port 8080
```
Puis ouvrez votre navigateur sur [http://localhost:8080](http://localhost:8080).

### 2. Exécuter les tests unitaires
```bash
# Tests Python (API FastAPI + music21)
.venv/bin/python -m unittest discover -s tests -p "test_*.py" -v

# Tests JavaScript (théorie, MIDI, VexFlow)
npm test
```

---

## ☁️ Déploiement sur Render

Le dépôt inclut un blueprint [`render.yaml`](render.yaml) prêt pour **Render** :

1. Connectez ce dépôt GitHub dans le tableau de bord Render (**New + → Blueprint**).
2. Render détecte automatiquement `render.yaml` :
   - **Build Command** : `pip install -r requirements.txt`
   - **Start Command** : `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check** : `/api/health`
3. L'URL Render sert directement **l'API (`/api/generate`) et le front-end (`/`)**.
4. *(Optionnel)* Si vous hébergez le dossier `docs/` séparément (ex. GitHub Pages), renseignez l'URL Render dans `docs/js/config.js` (`DEFAULT_API_URL = 'https://partitio-api.onrender.com'`) ou passez `?api=https://partitio-api.onrender.com` dans l'URL.

---

## 🐳 Conteneur Docker

```bash
docker build -t partitio .
docker run -p 8080:8080 -e PORT=8080 partitio
```

---

## 📂 Structure du projet

```
├── api/
│   ├── main.py                  # API FastAPI (/api/health, /api/generate) + fichiers statiques docs/
│   ├── generator.py             # Moteur de composition musicale basé sur music21
│   └── theory.py                # Tonalités, gammes et hauteurs via music21
├── render.yaml                  # Blueprint de déploiement Render
├── requirements.txt             # Dépendances Python (fastapi, uvicorn, music21, pydantic)
├── Dockerfile                   # Image Python 3.12 (API music21 + front-end)
├── package.json                 # Scripts de test et de démarrage
├── README.md
├── tests/
│   ├── test_api.py              # Tests unitaires Python (music21 + endpoints FastAPI)
│   └── generator.test.js        # Tests unitaires JavaScript (gammes, MIDI, VexFlow)
└── docs/
    ├── index.html               # Interface utilisateur (identique à l'existant)
    ├── css/
    │   └── styles.css           # Thème sombre, adaptatif et styles d'impression A4
    ├── vendor/
    │   └── vexflow.js           # Moteur de gravure musicale SVG VexFlow
    └── js/
        ├── app.js               # Câblage de l'interface et appel asynchrone à l'API Python
        ├── api-client.js        # Client HTTP fetch vers POST /api/generate
        ├── config.js            # Configuration de l'URL Render de l'API
        ├── ambitus-ribbon.js    # Mini-clavier interactif d'ambitus
        ├── theory.js            # Règles d'harmonie, armures, gammes (majeures, mineures)
        ├── rng.js               # Générateur de graine
        ├── generator.js         # Libellés et utilitaires de tempo
        ├── events.js            # Horodatage et vélocités expressives des notes
        ├── piano-synth.js       # Synthèse physique du son de piano (Web Audio API)
        ├── midi.js              # Pilote Web MIDI API pour instruments externes
        ├── midi-file.js         # Encodeur de fichier binaire Standard MIDI (.mid)
        ├── player.js            # Séquenceur de lecture avec anticipation et synchronisation visuelle
        ├── renderer.js          # Rendu SVG VexFlow et surlignage des notes
        └── settings.js          # Persistance des réglages utilisateur dans localStorage
```
