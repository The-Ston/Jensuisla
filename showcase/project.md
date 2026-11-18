---
name: Jensuisla
description: "Une Activity Discord pour lire à plusieurs, avec des discussions sans spoiler débloquées selon ta progression dans le livre."
tags: [Discord, Lecture, TypeScript, Svelte, Cloudflare]
cover: cover.png
coverAlt: "Le titre Jensuisla et la devise « Lire ensemble, sans spoiler. » devant une étagère de livres, dont l'un porte un marque-page doré"
icon: icon.png
screenshots:
  - src: screenshots/accueil.png
    alt: Écran d'accueil avec les lectures en cours et les lectures ouvertes
    caption: L'accueil, avec tes lectures et celles que tu peux rejoindre
  - src: screenshots/frise.png
    alt: Page d'une lecture avec la frise des commentaires et la position de chaque lecteur
    caption: La frise, ton marque-page et l'avancement des autres lecteurs
  - src: screenshots/discussion.png
    alt: Commentaires sur un chapitre avec réactions emoji et zone de saisie
    caption: Les commentaires du passage où tu en es
technologies: [TypeScript, Svelte 5, Vite, Cloudflare Workers, Durable Objects, Discord Embedded App SDK]
platforms: [Discord (Activity)]
status: Actif
---

Jensuisla est une Activity Discord pour lire un livre à plusieurs sans se gâcher la surprise.
Tout se passe dans l'Activity, lancée depuis un salon du serveur.

## Lire ensemble

- Un organisateur crée une lecture : il cherche le livre (titre, auteur) pour pré-remplir la
  couverture et le nombre de pages, ou importe sa propre image.
- L'avancement se compte en pages, en chapitres ou en pourcentage. Chacun peut suivre sa propre
  édition : les pages sont converties.
- On rejoint une lecture sur invitation, en cliquant « Je participe », ou les deux.

## Sans spoiler

- Les commentaires, réactions et GIFs sont ancrés à une position précise du livre.
- Tu ne vois que ce qui se trouve avant ta position. C'est vérifié par le serveur, pas seulement
  masqué à l'écran.
- Ceux qui le veulent peuvent activer « Voir les spoilers ».

## La frise

Une frise continue regroupe les commentaires en points cliquables. Ta position y est marquée par
un marque-page avec ton avatar, et chaque lecteur apparaît là où il en est.

## Discuter

- Commentaires, réponses, réactions emoji (y compris les emojis du serveur), GIFs et photos.
- Écrire « ch.3 » ou « p.25 » crée un lien vers ce passage.
- Notifications au choix : message privé du bot, mention dans #lectures, ou rien.
- Quatre thèmes (Nuit, Jour, Papier, Forêt), une couleur d'accent et une couleur pour tes
  commentaires.

## Sans base de données

Les données sont stockées sous forme de messages du bot dans des salons Discord cachés. Un Worker
Cloudflare sert l'Activity et son API, et un Durable Object enchaîne les écritures une par une.
