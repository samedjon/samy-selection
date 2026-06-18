# Samy Production 237 - Module Selection Photo

IA redactrice : opencode (Agent)  
Date : 17 juin 2026  
Statut : MVP fonctionnel avec backend dual (fichier JSON local OU Supabase), admin protege, rate limiting, protection anti-screenshot

## CHECKLIST globale

~~Etape 1 - Initialisation projet Next.js 14 + TypeScript + Tailwind~~  
~~Etape 1 - Donnees demo et photos reelles locales~~  
~~Etape 3 - Galerie publique + modal code 4 chiffres demo~~  
~~Etape 4 - Moteur de selection mobile-first avec compteurs fixes~~  
~~Etape 5 - Recapitulatif + message WhatsApp structure demo~~  
~~Etape locale - Espace studio `/admin` pour importer un dossier classe~~  
~~Etape serveur locale - API d'import ~~  
~~Etape branchement backend - `server-project-store.ts` reecrit en mode dual (Supabase + fichier JSON)~~  
~~Etape branchement backend - `supabase/schema.sql` enrichi (colonnes + RLS policies completes)~~  
~~Etape securite - Middleware `/admin` protege + page de login~~  
~~Etape securite - Rate limiting 3 tentatives / 15 min sur `/api/auth/project`~~  
~~Etape securite - Protection anti-telechargement renforcee (blur on tab hide, overlay CSS, print block)~~  
~~Etape refactoring - Extraction de PasswordModal et PhotoGrid en composants separees~~  
~~Etape deploiement - `src/` ajoute a .gitignore, workflow GitHub Pages obsolete supprime~~  
Etape en cours / restante - Renseigner les vraies cles Supabase + Cloudinary dans `.env.local`

## RESUME precis

### Fichiers crees ou modifies (cette session) :

Nouveaux :
- `middleware.ts` : protege `/admin/*` (redirect vers `/admin/login` si cookie manquant)
- `app/api/admin/auth/route.ts` : API login admin (bcrypt via `ADMIN_PASSWORD_HASH`)
- `app/admin/login/page.tsx` : page de connexion studio
- `lib/rate-limiter.ts` : rate limiting in-memory (3 tentatives / 15 min par IP)
- `lib/cloudinary.ts` : utilitaire upload Cloudinary avec filigrane automatique
- `lib/admin-auth.ts` : helper `requireAdminAuth()` pour les routes API admin
- `components/password-modal.tsx` : extrait de selection-portal.tsx
- `components/photo-grid.tsx` : extrait de selection-portal.tsx

Modifies :
- `lib/server-project-store.ts` : mode dual Supabase/fichier JSON ; support des photos Cloudinary pre-uploaded ; `CreateServerProjectInput.cloudinaryPhotos` optionnel
- `lib/supabase/server.ts` : export `isSupabaseConfigured()`
- `lib/supabase/client.ts` : export `isSupabaseConfigured()`
- `supabase/schema.sql` : colonnes `event_type`, `venue`, `notification_email`, `notification_whatsapp`, `drive_url` ajoutees a `projects` ; RLS policies completes (8 tables)
- `app/api/admin/import/route.ts` : support Cloudinary upload quand configure + auth check
- `app/api/admin/projects/route.ts` : auth check sur GET/PATCH/DELETE
- `app/api/auth/project/route.ts` : rate limiting ajoute
- `app/globals.css` : protection anti-screenshot (blur + grayscale quand tab cache), anti-print, `user-select: none` renforce
- `components/selection-portal.tsx` : blur detection via Page Visibility API + window blur/focus ; import de PasswordModal et PhotoGrid depuis leurs fichiers
- `.env.example` : ajout `ADMIN_PASSWORD_HASH`
- `.env.local` : ajout `ADMIN_PASSWORD_HASH` (password: `admin123`)
- `.gitignore` : `src/` ajoute
- `.github/workflows/deploy.yml` : supprime (ancien site statique)

### Logique implementee :

- **Mode dual** : si `NEXT_PUBLIC_SUPABASE_URL` et `ANON_KEY` sont renseignes (et ne sont pas des placeholders), le projet utilise Supabase pour le stockage. Sinon, fallback fichier JSON (`data/projects.json`).
- **Cloudinary** : si les cles Cloudinary sont configurees, l'API d'import upload les images vers Cloudinary avec filigrane automatique avant de creer le projet.
- **Admin protege** : `middleware.ts` intercepte `/admin/*` (sauf `/admin/login`), verifie le cookie `samy_admin_session`. Les routes API `/api/admin/*` sont protegees par `requireAdminAuth()`.
- **Rate limiting** : 3 tentatives de mot de passe par IP, fenetre de 15 minutes. Stockage en memoire (Map).
- **Anti-screenshot** : quand le tab perd le focus (visibilitychange, blur window), les images sont floutees + niveaux de gris via la classe CSS `body.samy-hidden`.
- **Protection images** : `user-select: none`, `-webkit-user-drag: none`, `-webkit-touch-callout: none`, overlay CSS "SAMY PRODUCTION 237" en diagonale, blocage contextmenu/dragstart JS, blocage impression.

## ETAT EXACT a la reprise

Dernier fichier modifie : `HANDOFF_DOCUMENT.md`  
Build : `npm run build` OK (11 routes, 0 erreurs)  
Commande : `npm run dev`  
Portail client : `http://127.0.0.1:3000/`  
Admin login : `http://127.0.0.1:3000/admin/login` (mot de passe par defaut : `admin123`)  
Admin panel : `http://127.0.0.1:3000/admin`

Prochaine tache immediate : **Renseigner les vraies cles API** dans `.env.local` :
1. Creer un projet Supabase → copier URL + anon key + service role key
2. Executer `supabase/schema.sql` dans l'editeur SQL Supabase
3. Configurer Cloudinary (upload preset + filigrane)
4. Optionnel : configurer Twilio pour WhatsApp automatique

## POINTS FRAGILES detectes

- Le rate limiting est en memoire (Map). En production multi-instance, remplacer par Redis ou Supabase.
- Les warnings ESLint `@next/next/no-img-element` sont presents partout (images en `<img>` au lieu de `next/image`). OK pour le MVP mais a optimiser.
- Le hash du mot de passe admin (`admin123`) est en dur dans `.env.local`. Changer en production.
- `createProjectInSupabase` dans `server-project-store.ts` fait des insertions sequentielles (folders puis photos). Pour de gros volumes (>500 photos), passer en batch ou utiliser le service role key pour bypass RLS.
- Les URLs Cloudinary signees (expiration 2h) ne sont pas implementees. Actuellement les URLs sont publiques.
- Le dossier `demo-imports/` a la racine du projet contient des donnees de test (non reference par le code).

## CONTEXTE METIER en 5 lignes

Samy Production 237 est un studio audiovisuel premium base a Yaounde.  
Le module sert aux couples apres mariage pour selectionner eux-memes leurs photos.  
Le client recoit un lien et un code 4 chiffres, consulte une galerie filigranee, puis confirme sa selection.  
Le studio doit recevoir un resume WhatsApp exploitable avec noms exacts des fichiers.  
L'experience doit etre mobile-first car la grande majorite des clients selectionneront sur smartphone.
