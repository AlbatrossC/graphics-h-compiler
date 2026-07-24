# Monetag Active Configuration

This document preserves the active ad banner configurations updated on **2026-07-24**.

---

## Active Ad Placements

| Placement | Size / Type | Container | Location in Code | Status |
|---|---|---|---|---|
| **Cloud Promo Panel** | Direct Link Banner (160×300) | `.sidebar-ad-slot` | `site/templates/compiler.html` | **Active** |
| **Error Panel** | Direct Link Banner (300×250) | `#error-ad-slot` | `site/templates/compiler.html` | **Active** |

---

## Disabled Formats (Removed)

All popunder, push notifications, vignette, and in-page push scripts/service-workers have been removed per configuration requirements:
- Multi-Tag Loader (`quge5.com` / `250217`) — **Removed**
- Push Notifications (`11153369` / `11158521`) — **Removed**
- Vignette Banner (`11153368`) — **Removed**
- In-Page Push (`11153367`) — **Removed**
- OnClick Popunder (`11153366`) — **Removed**
