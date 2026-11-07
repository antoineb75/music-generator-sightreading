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
   - **Mode Aléatoire (🎲)** : chaque paramètre pédagogique dispose d'une case « Aléa » permettant un tirage au sort automatique à chaque génération (y compris les accords enrichis).

2. **Curseur de Tempo (BPM) & Métronome en direct** :
   - Le tempo se règle facilement et directement via le curseur de la barre de transport (de 40 à 200 BPM) avec indication des termes italiens usuels (*Largo*, *Adagio*, *Andante*, *Moderato*, *Allegro*, *Presto*). Il est gravé sur la première mesure de la partition et modifiable en direct pendant ou avant la lecture.
   - Métronome audible synchronisé (clic sonore).

3. **Mémoire automatique des réglages** :
   - Au démarrage, l'application restaure automatiquement vos derniers paramètres et la dernière partition générée via `localStorage`.

3. **Lecture audio réaliste (Piano Web Audio)** :
   - Synthétiseur de piano physique modélisé avec la **Web Audio API** (sans banques d'échantillons lourdes).
   - Oscillateurs multi-harmoniques avec inharmonicité, filtre dynamique simulant l'étouffoir et réverbération intégrée.

4. **Exécution & Export MIDI** :
   - **Sortie Web MIDI** : envoyez directement les notes vers un piano numérique, clavier maître ou synthétiseur physique connecté en USB/MIDI.
   - **Export `.mid`** : téléchargez la partition au format Standard MIDI File (format 1, 2 pistes pour main droite et main gauche, tempo et armure inclus).

5. **Surlignage visuel interactif** :
   - Pendant la lecture, **la note en cours de jeu s'illumine en direct** sur la portée (rose/ambre lumineux avec halo).
   - Défilement automatique vers le système (la ligne) en cours de lecture.
   - Possibilité de cliquer sur n'importe quelle note de la partition pour l'écouter.

6. **Affichage adaptatif (PC / Téléphone)** :
   - Gravure vectorielle SVG propulsée par VexFlow.
   - La partition recalcule dynamiquement le nombre de mesures par portée et l'échelle selon la largeur de votre écran (PC, tablette ou smartphone).
   - Panneau de réglages repliable d'un clic pour maximiser l'espace de lecture.

7. **Impression prête pour les cours (A4)** :
   - Feuille de styles d'impression dédiée `@media print` masquant toute l'interface pour ne conserver que la partition nette, le titre et les informations de tonalité / mesure sur feuille blanche A4.
   - Bouton « 🖨️ Imprimer » en un clic.

---

## 🚀 Utilisation en local

Aucune installation complexe ni outil de compilation nécessaire : l'application est en JavaScript moderne natif.

### Option 1 : Avec Python
```bash
# Dans le dossier du projet :
python3 -m http.server 8080 --directory public
```
Puis ouvrez votre navigateur sur [http://localhost:8080](http://localhost:8080).

### Option 2 : Avec Node / npm
```bash
npm start
```

### Exécuter les tests unitaires
```bash
npm test
```

---

## 🐳 Conteneur Docker & Déploiement Cloud Run

L'application inclut un `Dockerfile` basé sur `nginx:alpine` léger (~25 Mo) configuré pour injecter dynamiquement la variable d'environnement `$PORT`.

### 1. Test du conteneur en local
```bash
# Construction de l'image
docker build -t partitio .

# Lancement sur le port 8080
docker run -p 8080:8080 -e PORT=8080 partitio
```
Accédez ensuite à l'application via `http://localhost:8080`.

### 2. Déploiement sur Google Cloud Run

#### Déploiement direct avec Google Cloud CLI :
```bash
gcloud run deploy partitio \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated
```

Cloud Run construira le conteneur et fournira automatiquement une URL HTTPS publique sécurisée (compatible avec la Web MIDI API qui requiert un contexte HTTPS).

---

## 📂 Structure du projet

```
├── Dockerfile                   # Image nginx alpine prête pour Cloud Run
├── nginx.conf.template          # Configuration nginx avec support de la variable $PORT
├── .dockerignore
├── package.json                 # Scripts de test et de démarrage
├── README.md
├── tests/
│   └── generator.test.js        # Tests unitaires (gammes, mesures complètes, MIDI, cadences)
└── public/
    ├── index.html               # Interface utilisateur
    ├── css/
    │   └── styles.css           # Thème sombre, adaptatif et styles d'impression A4
    ├── vendor/
    │   └── vexflow.js           # Moteur de gravure musicale SVG VexFlow
    └── js/
        ├── app.js               # Câblage de l'interface et du cycle de vie
        ├── theory.js            # Règles d'harmonie, armures, gammes (majeures, mineures)
        ├── rng.js               # Générateur pseudo-aléatoire reproductible
        ├── generator.js         # Moteur de composition musicale selon le niveau
        ├── events.js            # Horodatage et vélocités des notes
        ├── piano-synth.js       # Synthèse physique du son de piano (Web Audio API)
        ├── midi.js              # Pilote Web MIDI API pour instruments externes
        ├── midi-file.js         # Encodeur de fichier binaire Standard MIDI (.mid)
        ├── player.js            # Séquenceur de lecture avec anticipation et synchronisation visuelle
        ├── renderer.js          # Rendu SVG et système de surlignage des notes
        └── settings.js          # Persistance des réglages utilisateur dans localStorage
```
