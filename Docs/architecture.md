# Architecture technique — Artisan-Abidjan

## 1. Objectif

Artisan-Abidjan est une application permettant de mettre en relation des clients avec des artisans à Abidjan.

L'application doit permettre aux clients de trouver des artisans, consulter leurs services et demander une intervention.

## 2. Architecture générale

L'application est organisée en plusieurs parties :

- Frontend : interface utilisateur
- Backend : logique métier et API
- Database : stockage des données
- Authentication : gestion des comptes et des rôles
- Geolocation : localisation des utilisateurs et artisans
- Notifications : communication des événements importants
- Administration : gestion de la plateforme

## 3. Technologies prévues

### Frontend

- TypeScript
- React
- Next.js

### Backend

- TypeScript
- Node.js
- API REST

### Base de données

- PostgreSQL
- Supabase

### Authentification

- Supabase Auth

### Hébergement

- Vercel pour le frontend
- Supabase pour la base de données et les services associés

## 4. Rôles

L'application possède trois rôles principaux :

- CLIENT
- ARTISAN
- ADMIN

Les permissions doivent être contrôlées en fonction du rôle.

## 5. Fonctionnement général

Client
→ Frontend
→ API
→ Backend
→ Base de données

Artisan
→ Frontend
→ API
→ Backend
→ Base de données

Administrateur
→ Interface d'administration
→ API
→ Backend
→ Base de données

## 6. Principales entités

La base de données devra notamment gérer :

- users
- artisans
- categories
- services
- artisan_services
- locations
- bookings
- messages
- reviews
- notifications
- payments

## 7. Principes de développement

Le projet doit être développé progressivement.

Chaque fonctionnalité doit être :

1. définie
2. développée
3. testée
4. vérifiée
5. documentée

Aucune modification importante de l'architecture ne doit être effectuée sans vérification préalable.

## 8. Organisation du projet

Le dépôt GitHub est organisé ainsi :

- /Docs : documentation
- /Frontend : application frontend
- /Backend : serveur et API
- /Base de données : scripts et configuration de la base de données
- /Tests : tests du projet

## 9. Règle importante pour les agents IA

Tous les agents IA travaillant sur le projet doivent :

- consulter la documentation avant de modifier le projet
- respecter l'architecture existante
- ne pas modifier une partie appartenant à une autre fonctionnalité sans raison
- expliquer les changements importants
- tester leur travail
- mettre à jour la documentation lorsque nécessaire
