# Fonctionnalités de l'application Artisan-Abidjan

## 1. Utilisateurs

L'application comporte trois types d'utilisateurs :

- Client
- Artisan
- Administrateur

## 2. Client

Le client doit pouvoir :

- créer un compte
- se connecter
- modifier son profil
- rechercher un artisan
- rechercher par catégorie
- rechercher un artisan à proximité
- consulter le profil d'un artisan
- consulter ses services et tarifs
- voir ses évaluations
- demander une intervention
- suivre l'état de sa demande
- communiquer avec l'artisan
- consulter son historique
- noter un artisan

## 3. Artisan

L'artisan doit pouvoir :

- créer un compte professionnel
- se connecter
- créer et modifier son profil
- choisir ses catégories de services
- ajouter ses services
- définir ses tarifs
- définir sa zone d'intervention
- indiquer sa disponibilité
- recevoir des demandes
- accepter ou refuser une demande
- communiquer avec le client
- consulter son historique
- recevoir des évaluations

## 4. Administrateur

L'administrateur (rôle `ADMIN` uniquement, contrôle page via `requireAdminSession`, pas seulement la Navbar) doit pouvoir :

- consulter le tableau de bord (`/admin`) : utilisateurs, artisans, réservations, avis, paiements, commissions réellement calculées
- lister et rechercher les artisans (`/admin/artisans`)
- consulter une fiche artisan et la vérifier via `admin_verify_artisan` (sans changer l’id, le propriétaire ni le rôle)
- lister les utilisateurs en lecture seule (`/admin/users`) : pas de changement de rôle depuis l’interface
- consulter les réservations et devis associés en lecture seule (`/admin/bookings`)
- consulter les avis en lecture seule (`/admin/reviews`)
- consulter les paiements (`/admin/payments`) et changer le statut uniquement via `admin_set_payment_status`
- consulter les commissions et le taux actuel (modification du taux uniquement via `admin_set_commission_rate` si elle est utilisée)
- créer, renommer et supprimer des catégories non utilisées (`/admin/categories`)
- recevoir les notifications destinées à son compte (`/notifications`)

L’administrateur V1 ne gère pas les signalements ni la suspension d’utilisateurs. Il ne remplace pas le client ou l’artisan pour accepter/refuser un devis.

## 5. Recherche et géolocalisation

Le client doit pouvoir :

- rechercher un artisan par métier
- rechercher par localisation (ville, nom)
- voir les artisans proches (« Artisans autour de moi »)
- consulter leur distance (Haversine, après clic volontaire)
- filtrer les résultats (y compris en mode proximité : le filtre métier s’applique côté frontend, la RPC `find_nearby_artisans` n’accepte pas de catégorie)
- consulter les artisans disponibles
- voir une carte OpenStreetMap des artisans **vérifiés** ayant enregistré une position professionnelle
- ouvrir un itinéraire externe vers l’artisan (sans API payante)

Règles V1 :

- le GPS du navigateur n’est jamais demandé au chargement d’une page
- seules les coordonnées volontairement autorisées ou enregistrées sont utilisées
- la carte publique n’affiche jamais les positions d’intervention ni les GPS des clients
- les artisans non vérifiés n’apparaissent pas sur la carte publique
- rayon de proximité par défaut : 10 km (5 / 10 / 20 / 50 km)

L’artisan doit pouvoir :

- enregistrer, mettre à jour ou supprimer sa position professionnelle (facultative)
- voir la carte d’une intervention à laquelle il participe, si le client a fourni des coordonnées
- ouvrir l’itinéraire vers cette intervention

La localisation d’intervention reste visible uniquement au client de la réservation, à l’artisan concerné et à l’admin (RLS `bookings`, aucune lecture publique).

## 6. Demande d'intervention

Le client doit pouvoir :

- choisir un artisan
- choisir un service
- indiquer le lieu d'intervention
- décrire son besoin
- envoyer une demande

Une demande possède plusieurs états :

- En attente
- Acceptée
- Refusée
- En cours
- Terminée
- Annulée

Annulation V1 (protégée en SQL, RPC `cancel_booking`) :

- le client peut annuler une demande en attente ou acceptée
- l'artisan peut annuler une demande acceptée ou en cours
- une demande en cours ne peut plus être annulée par le client
- une demande en attente ne peut pas être annulée par l'artisan
- une demande terminée, refusée ou déjà annulée ne peut plus l'être

## 7. Communication

L'application doit permettre :

- l'envoi de messages liés à une réservation
- les messages en temps réel (INSERT filtrés par `booking_id`, protégés par RLS)
- les notifications
- les notifications en temps réel (INSERT/UPDATE filtrés par `user_id`)
- un compteur de notifications non lues dans la barre de navigation
- la communication entre client et artisan

Si Realtime est indisponible, l'envoi et la lecture classiques restent utilisables.

## 8. Évaluations

Après une intervention terminée :

- le client peut noter l'artisan
- le client peut laisser un commentaire
- la note moyenne de l'artisan est affichée sur son profil

## 9. Paiement, devis et commissions

Workflow V1 (sans CinetPay) :

**FIXED**
- après ACCEPTED, le client paie `services.price`
- montant déterminé uniquement par `create_payment_for_booking`

**STARTING_FROM / ON_QUOTE**
- après ACCEPTED, l'artisan crée un devis
- le client accepte ou refuse
- paiement uniquement si le devis est ACCEPTED, via `create_payment_for_accepted_quote`
- le montant est celui du devis, jamais `services.price`

**Annulation**
- RPC `cancel_booking`
- devis PENDING → CANCELLED
- aucun remboursement automatique

**Commissions**
- créées uniquement au passage paiement PENDING → PAID
- `payment_id` unique

Le frontend n'envoie jamais amount, client_id, artisan_id, currency ni status d'un paiement.

## 10. Interface V1

- messages d'erreur et d'état vide en français, avec une suite possible quand une action existe
- tarifs catalogue affichés en XOF (prix fixe / à partir de / sur devis)
- paiement client présenté comme manuel V1 (pas de Mobile Money / carte)
- accueil : un métier ouvre la recherche filtrée
- artisan indisponible : la demande reste possible, sans être présentée comme immédiate

## 11. Sécurité

L'application doit prévoir :

- authentification sécurisée
- gestion des rôles
- protection des données
- contrôle des permissions
- validation des données
- protection des API
