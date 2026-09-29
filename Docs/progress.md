# Progression du projet — Artisan-Abidjan

## Configuration

- [x] Dépôt GitHub créé
- [x] Structure du projet créée
- [x] Documentation initiale créée
- [ ] Environnement de développement configuré
- [ ] Supabase configuré

## Architecture

- [x] Fonctionnalités définies
- [x] Architecture technique définie
- [ ] Base de données définie
- [ ] API définie

## Authentification

- [ ] Inscription client
- [ ] Connexion client
- [ ] Inscription artisan
- [ ] Connexion artisan
- [ ] Gestion des rôles
- [ ] Authentification administrateur

## Client

- [ ] Profil client
- [ ] Recherche d'artisans
- [ ] Recherche par catégorie
- [ ] Recherche par localisation
- [x] Carte des artisans vérifiés (OpenStreetMap / Leaflet)
- [x] Recherche par proximité volontaire (`find_nearby_artisans`)
- [x] Distance et itinéraire (sans GPS automatique)
- [ ] Profil artisan
- [ ] Demande d'intervention
- [x] Annulation de réservation (règles métier SQL)
- [ ] Historique
- [ ] Évaluations

## Artisan

- [ ] Profil professionnel
- [ ] Services
- [ ] Tarifs
- [ ] Disponibilité
- [ ] Réception des demandes
- [ ] Gestion des demandes
- [x] Position professionnelle volontaire (enregistrement / mise à jour / suppression)
- [x] Carte et itinéraire d'intervention (réservation autorisée seulement)

## Communication

- [x] Messages
- [x] Notifications
- [x] Messages et notifications en temps réel
- [x] Compteur Navbar temps réel (avec fallback classique)

## Paiements

- [x] Paiement manuel V1 (RPC sécurisées, fallback sans CinetPay)
- [x] Devis STARTING_FROM / ON_QUOTE
- [x] Historique des paiements (client / admin)
- [x] Gestion des commissions (PENDING → PAID)

## Administration

- [x] Dashboard administrateur
- [x] Gestion des utilisateurs (lecture, filtres, pas de changement de rôle)
- [x] Gestion des artisans
- [x] Vérification des artisans (`admin_verify_artisan`)
- [x] Gestion des catégories
- [x] Consultation des réservations, devis, avis et paiements
- [x] Cohérence UI/UX V1 (états vides, labels, mobile Navbar, paiement manuel)
- [ ] Gestion des signalements

## Tests et sécurité

- [ ] Tests frontend
- [ ] Tests backend
- [ ] Tests de sécurité
- [ ] Tests de l'application complète

## Déploiement

- [ ] Configuration de production
- [ ] Déploiement
- [ ] Vérification finale
