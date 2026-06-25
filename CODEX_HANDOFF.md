# Handoff Codex - Import Google Drive

Date : 25 juin 2026

## Diagnostic confirme

- Netlify contient deja `GOOGLE_DRIVE_API_KEY`.
- Test direct Google Drive avec la cle fournie sur le dossier `1gCBy0BfoWAPC0IaVDl_BFyQBKtNe6gar` :
  - HTTP 403
  - raison Google : `SERVICE_DISABLED` / `accessNotConfigured`
  - conclusion : `drive.googleapis.com` n'est pas actif, ou pas encore propage, dans le projet Google Cloud `118773224784` associe a cette cle.
- Les credentials OAuth Netlify existent, mais le `GOOGLE_DRIVE_REFRESH_TOKEN` actuel renvoie `invalid_grant` : token expire ou revoque.
- `netlify-cli` et `gcloud` ne sont pas installes localement. Netlify reste pilotable via REST API avec le token fourni. Google Cloud exige une session Google connectee ou Cloud Shell.

## Corrections code appliquees

- `lib/drive.ts`
  - `getAccessToken()` est maintenant vraiment asynchrone.
  - Les erreurs OAuth affichent la cause Google (`invalid_grant`, etc.).
  - Les streams Drive sont convertis en `Readable.fromWeb(...)`.
- `lib/drive-public.ts`
  - Les erreurs Google API key sont traduites :
    - `SERVICE_DISABLED`
    - `API_KEY_SERVICE_BLOCKED`
    - `API_KEY_HTTP_REFERRER_BLOCKED`
- `types/selection.ts`
  - `Photo.cloudinaryPublicId` ajoute.
- `lib/server-project-store.ts`
  - `createServerProject()` accepte maintenant les imports Drive deja uploades vers Cloudinary via `cloudinaryPhotos`, meme si `files` est vide.
  - Le `cloudinary_public_id` est conserve en base Supabase.
- `.env.example`
  - Variables Google Drive ajoutees.

## Validation

- `npx tsc --noEmit` : OK
- `npm run build` : OK
- Warnings restants : `<img>` au lieu de `next/image`, et un warning hook React deja existant.

## Update Codex - 25 juin 2026, commit `67a838d`

Probleme observe en production apres deploy `e490434` :

- `drive-public-import` en mode synchrone renvoyait `502` apres environ 36 secondes.
- Cause confirmee : la fonction Netlify essayait de scanner, telecharger, uploader Cloudinary et creer le projet en un seul appel. Le dossier de test contient 1125 images, donc le traitement depassait le temps disponible.

Correctif pousse :

- `app/api/admin/drive-public-import/route.ts`
  - Ajout de `mode: "scan"` : retourne `projectName` + liste des images Drive sans upload.
  - Ajout de `mode: "upload-batch"` : telecharge et upload seulement un lot d'images vers Cloudinary.
  - Ajout de `mode: "create-project"` : cree le projet Supabase a partir des photos Cloudinary deja uploadees.
  - L'ancien mode complet reste en place par compatibilite, mais l'UI ne l'utilise plus.
- `components/studio-admin.tsx`
  - Le bouton "Importer depuis Drive" orchestre maintenant :
    1. scan Drive,
    2. uploads par lots de 8 images,
    3. creation finale du projet.
  - La progression affiche `x/n image(s)`.

Tests prod effectues apres deploy :

- Scan Drive sur `1zTh5-uv-IVHgM-oFyqssrDwiqQ10-Ecz` : OK, 1125 images detectees.
- Upload batch d'une image Drive vers Cloudinary : OK.
- Creation d'un projet Supabase minimal avec une photo Cloudinary : OK.
- Suppression immediate du projet test : OK.

Point restant :

- Le batch actuel depend de la page admin ouverte. Si le navigateur est ferme, l'import s'arrete. Pour une vraie reprise automatique sur 2000+ images, passer ensuite a une table `import_jobs` + worker externe ou GitHub Actions/QStash.

## Action Google la plus rapide

Depuis Google Cloud Console, ouvrir Cloud Shell dans le bon compte, puis executer :

```bash
gcloud config set project 118773224784
gcloud services enable drive.googleapis.com
gcloud services list --enabled --filter="drive.googleapis.com"
```

Ensuite, dans `APIs & Services > Credentials`, ouvrir la cle API utilisee :

- Restrictions d'API : autoriser `Google Drive API`.
- Restrictions d'application : mettre temporairement `None` pour tester, car l'appel Drive est fait cote serveur Netlify, pas depuis le navigateur. Les restrictions `HTTP referrers` peuvent bloquer les appels serveur.

Attendre quelques minutes puis tester l'import Drive.

## Recommandation robuste

Pour 2000+ images, une fonction Netlify synchrone n'est pas le bon moteur : elle peut expirer avant la fin du download Drive + upload Cloudinary.

Architecture recommandee :

1. Le site admin cree un job d'import en base (`pending`).
2. Un worker externe traite Drive par lots :
   - service account Google partage au dossier Drive, ou OAuth refresh token valide
   - upload Cloudinary progressif
   - sauvegarde progression dans Supabase
   - reprise possible en cas d'interruption
3. Le site affiche la progression et n'affiche la galerie qu'une fois le job `completed`.

Option simple et robuste a court terme :

- Utiliser un service account Google.
- Partager chaque dossier Drive avec l'email du service account.
- Stocker la cle JSON du service account en variable Netlify/GitHub secret.
- Faire tourner le worker via GitHub Actions ou une machine locale du studio, pas dans une fonction Netlify longue.
