# Favorites Feature Implementation Plan

## Overview
Add the ability for authenticated users to favorite artists, venues, and genres. Favorites can be used to filter events and trigger optional email notifications for new shows.

## Database Schema

### New Prisma Models
```prisma
model UserFavoriteArtist {
  id        String   @id @default(cuid())
  userId    String
  artistId  String
  createdAt DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  artist Artist @relation(fields: [artistId], references: [id], onDelete: Cascade)

  @@unique([userId, artistId])
  @@index([userId])
  @@index([artistId])
}

model UserFavoriteVenue {
  id        String   @id @default(cuid())
  userId    String
  venueId   String
  createdAt DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@unique([userId, venueId])
  @@index([userId])
  @@index([venueId])
}

model UserFavoriteGenre {
  id        String   @id @default(cuid())
  userId    String
  genre     String   // canonical genre slug (e.g., "jazz", "rock")
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, genre])
  @@index([userId])
}

// Add to User model
model User {
  // ... existing fields ...

  favoriteArtists UserFavoriteArtist[]
  favoriteVenues  UserFavoriteVenue[]
  favoriteGenres  UserFavoriteGenre[]

  // Notification preferences
  emailNotifications    Boolean @default(true)
  notificationFrequency String  @default("daily") // "daily", "weekly", "none"
  lastNotificationSent  DateTime?
}
```

**Files to modify:**
- `prisma/schema.prisma`

## API Endpoints

### Favorites CRUD
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/favorites` | GET | Get all user favorites (artists, venues, genres) |
| `/api/favorites/artists` | POST | Add artist to favorites |
| `/api/favorites/artists/[id]` | DELETE | Remove artist from favorites |
| `/api/favorites/venues` | POST | Add venue to favorites |
| `/api/favorites/venues/[id]` | DELETE | Remove venue from favorites |
| `/api/favorites/genres` | POST | Add genre to favorites |
| `/api/favorites/genres/[slug]` | DELETE | Remove genre from favorites |
| `/api/favorites/check` | GET | Check if items are favorited (batch) |

### User Preferences
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/user/preferences` | GET | Get notification preferences |
| `/api/user/preferences` | PUT | Update notification preferences |

### Notification Cron
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cron/favorite-notifications` | POST | Send daily digest emails |

**Files to create:**
- `server/api/favorites/index.get.ts`
- `server/api/favorites/artists.post.ts`
- `server/api/favorites/artists/[id].delete.ts`
- `server/api/favorites/venues.post.ts`
- `server/api/favorites/venues/[id].delete.ts`
- `server/api/favorites/genres.post.ts`
- `server/api/favorites/genres/[slug].delete.ts`
- `server/api/favorites/check.get.ts`
- `server/api/user/preferences.get.ts`
- `server/api/user/preferences.put.ts`
- `server/api/cron/favorite-notifications.post.ts`

## Frontend Components

### New Composable: useFavorites
```typescript
// app/composables/useFavorites.ts
export function useFavorites() {
  const favorites = ref<{
    artists: { id: string; name: string; slug: string }[]
    venues: { id: string; name: string; slug: string }[]
    genres: string[]
  }>({ artists: [], venues: [], genres: [] })

  // Methods: fetchFavorites, toggleArtist, toggleVenue, toggleGenre, isFavorited
}
```

### New Component: FavoriteButton
```vue
<!-- app/components/FavoriteButton.vue -->
<!-- Reusable heart icon button for favoriting items -->
<FavoriteButton type="artist" :id="artist.id" :name="artist.name" />
```

### New Component: ArtistFavoriteDropdown
For EventCard when there are multiple artists:
```vue
<!-- app/components/ArtistFavoriteDropdown.vue -->
<!-- Heart icon that expands to show all artists with individual favorite toggles -->
<ArtistFavoriteDropdown :artists="event.eventArtists" />
```

### New Page: Favorites Management
```
app/pages/favorites.vue
- List all favorites by category
- Search and add new favorites
- Manage notification preferences
```

**Files to create:**
- `app/composables/useFavorites.ts`
- `app/components/FavoriteButton.vue`
- `app/components/ArtistFavoriteDropdown.vue`
- `app/pages/favorites.vue`

**Files to modify:**
- `app/components/EventCard.vue` - Add favorite heart (single artist) or dropdown (multi-artist)
- `app/components/EventFiltersSidebar.vue` - Add "My Artists/Venues/Genres" filter toggles
- `app/pages/events/[slug].vue` - Add "Lineup" section with artist hearts, venue heart
- `app/pages/venues/[slug].vue` - Add favorite button for venue
- `app/app.vue` - Add "Favorites" link in nav (when logged in)

## UX Details

### EventCard (List View)
- **Single artist event**: Heart icon next to title, favorites that artist directly
- **Multi-artist event**: Heart icon shows dropdown with all artists, each with their own heart
- **Logged out users**: Heart shows tooltip "Sign in to favorite artists and get notified about their shows"

### Event Detail Page
- **Lineup section**: New section showing all artists with hearts next to each name
- **Venue**: Heart next to venue name in info section

### Venue Page
- Heart next to venue name in header

### Favorites Page (/favorites)
- **My Artists**: List of favorited artists with remove buttons
- **My Venues**: List of favorited venues with remove buttons
- **My Genres**: Browse/select genres to favorite (genres managed here only, not scattered in UI)
- **Notification Preferences**: Email settings for show alerts

## Filter Integration

### EventFiltersSidebar Changes
Add new filter section for authenticated users:
```
[My Favorites]
[ ] My Artists (3 favorited)
[ ] My Venues (2 favorited)
[ ] My Genres (4 favorited)
```

When toggled, these add additional filter parameters:
- `favoriteArtists=true` - Filter to events with any favorited artist
- `favoriteVenues=true` - Filter to events at any favorited venue
- `favoriteGenres=true` - Filter to events matching any favorited genre

### API Changes
Modify `/api/events/index.get.ts` to accept favorite filter params and join with user's favorites.

**Files to modify:**
- `app/components/EventFiltersSidebar.vue`
- `server/api/events/index.get.ts`

## Email Notifications

### Daily Digest Email
- Cron job runs daily (e.g., 7am)
- For each user with `emailNotifications=true` and `notificationFrequency="daily"`:
  1. Find new events since `lastNotificationSent` featuring favorite artists
  2. Group by date
  3. Send formatted email with event list
  4. Update `lastNotificationSent`

### Email Template
Create HTML email template similar to magic link email style:
- Header with logo
- "New shows from your favorite artists"
- List of events grouped by date
- "Manage preferences" link

**Files to create:**
- `server/utils/favorite-notification-email.ts`

**Files to modify:**
- `server/api/cron/favorite-notifications.post.ts` (new)

## Implementation Order

### Phase 1: Database & API Foundation
1. Add Prisma schema changes and run migration
2. Create favorites CRUD API endpoints
3. Create `useFavorites` composable

### Phase 2: UI Components
4. Create `FavoriteButton` component
5. Add favorite buttons to EventCard (artists, venue)
6. Add favorite button to venue detail page
7. Create favorites management page

### Phase 3: Filter Integration
8. Add "My Favorites" section to EventFiltersSidebar
9. Update events API to support favorite filtering
10. Update facets API for favorite counts

### Phase 4: Notifications
11. Add notification preference fields to User model
12. Create preferences API endpoints
13. Add preferences UI to favorites page
14. Create notification email template
15. Create cron job for daily digest

## Security Considerations
- All favorites endpoints require authentication
- Users can only access/modify their own favorites
- Favorite filter params validated against user's actual favorites (not trusting client IDs)
- Email unsubscribe link in all notification emails

## Testing Checklist
- [ ] Add/remove favorites for each type
- [ ] Favorites persist across sessions
- [ ] Filter shows correct events when favorite filters enabled
- [ ] Unauthenticated users don't see favorite UI
- [ ] Email notifications sent correctly
- [ ] Unsubscribe link works
