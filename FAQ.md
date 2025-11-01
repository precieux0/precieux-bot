# FAQ — OkitakoyBot

**Q: Le QR est-il encore nécessaire ?**  
A: Oui, le QR est nécessaire une première fois pour créer la session. Après cela, OkitakoyBot sauvegarde automatiquement la session (fichier zip) pour éviter de rescanner souvent.

**Q: Le 'parrainage' par code est-il possible ?**  
A: Non. WhatsApp n'offre pas d'API permettant de remplacer le scan QR par un code de parrainage. Les alternatives conformes nécessitent WhatsApp Cloud API (Meta).

**Q: Qui a accès aux backups ?**  
A: Les backups sont stockés dans `/session-backups` sur ton instance Render. Configure Render pour restreindre l'accès et garde le `EXPORT_TOKEN` secret.
