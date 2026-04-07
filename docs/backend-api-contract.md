# backend API contract draft

## Goal
Define the minimum backend responses the mobile app expects for release MVP.

These are frontend-oriented contracts.
Exact controller/service naming can differ on the backend, but response shapes should stay stable.

---

## 0. Auth
### POST `/api/auth/login`

Request example:

```json
{
  "username": "demo-user",
  "password": "demo-pass"
}
```

Response example:

```json
{
  "accessToken": "jwt-token",
  "user": {
    "name": "민병희",
    "districtName": "강남구",
    "publicTag": "#BH7K2"
  }
}
```

### POST `/api/auth/register`

Request example:

```json
{
  "username": "new-user",
  "password": "password123",
  "name": "홍길동",
  "phone": "01012345678",
  "districtName": "강남구",
  "birthDate": "1990-01-01"
}
```

Response shape:
- same as login response

---

## 1. Home summary
### GET `/api/home/summary`

```json
{
  "totalDistanceKm": 42.4,
  "totalRuns": 5,
  "goalAchievementRate": 84,
  "streakDays": 11,
  "latestRun": {
    "distanceKm": 8.2,
    "source": "Apple Health"
  },
  "friendName": "김관우",
  "friendGapKm": 3.4,
  "districtName": "강남구",
  "districtRank": 7,
  "districtPoints": 98,
  "districtBattle": {
    "myDistrict": "강남구",
    "averageDistancePerMember": 24.7,
    "totalDistanceKm": 2480,
    "participationRate": 62,
    "districtRank": 3
  }
}
```

---

## 2. My profile
### GET `/api/me/profile`

```json
{
  "name": "민병희",
  "districtName": "강남구",
  "publicTag": "#BH7K2"
}
```

### PATCH `/api/me/profile`
- update profile basics

### PATCH `/api/me/region`
- update district/region settings

---

## 3. My activity
### GET `/api/me/activity`

```json
{
  "runs": [
    {
      "id": "mr1",
      "date": "2026-03-30",
      "distanceKm": 8.2,
      "pace": "5:34/km",
      "source": "Apple Health"
    }
  ],
  "monthlyDistanceKm": 42.4,
  "monthlyPoints": 98
}
```

---

## 4. Run detail
### GET `/api/runs/{runId}` or temporary GET `/api/runs/latest`

```json
{
  "run": {
    "id": "mr1",
    "date": "2026-03-30",
    "distanceKm": 8.2,
    "pace": "5:34/km",
    "source": "Apple Health"
  },
  "weeklyDistanceKm": 42.4,
  "estimatedMinutes": 45,
  "earnedPoint": 20
}
```

---

## 5. Friend leaderboard
### GET `/api/friends/leaderboard`

```json
{
  "ranks": [
    {
      "id": "1",
      "rank": 1,
      "name": "김관우",
      "tag": "#KW8M4",
      "distanceKm": 89,
      "points": 98
    }
  ],
  "requests": [
    {
      "id": "r1",
      "name": "박도윤",
      "tag": "#DY2M8",
      "status": "pending"
    }
  ]
}
```

---

## 6. Friend activity
### GET `/api/friends/{friendId}/activity`

```json
{
  "friend": {
    "id": "1",
    "rank": 1,
    "name": "김관우",
    "tag": "#KW8M4",
    "distanceKm": 89,
    "points": 98
  },
  "runs": [
    {
      "id": "fr1",
      "date": "2026-03-30",
      "distanceKm": 10.0,
      "pace": "5:12/km"
    }
  ],
  "monthlyDistanceKm": 55.2,
  "monthlyPoints": 98
}
```

---

## 7. Integration status
### GET `/api/integrations/sources`

```json
{
  "sources": [
    {
      "sourceType": "apple_health",
      "displayName": "Apple Health",
      "connected": true,
      "connectionStatus": "connected",
      "lastSyncedAt": "2026-03-31 14:02",
      "recommendedPlatform": "ios"
    }
  ]
}
```

### POST `/api/integrations/sync`
Suggested response:

```json
{
  "success": true,
  "syncedSources": 1,
  "syncedRuns": 3,
  "lastSyncedAt": "2026-03-31 14:10"
}
```

---

## 8. Friend add by tag
### POST `/api/friends/requests`
Request example:

```json
{
  "tag": "#KW8M4"
}
```

Response example:

```json
{
  "success": true,
  "requestId": "r10",
  "status": "pending"
}
```

---

## 9. District personal ranking
### GET `/api/league/district-personal`

```json
{
  "districtName": "강남구",
  "myRank": {
    "id": "user-1",
    "rank": 4,
    "name": "민병희",
    "distanceKm": 42.4,
    "points": 98,
    "isMe": true
  },
  "myPoints": 98,
  "weeklyDistanceKm": 42.4,
  "focusRanks": [
    {
      "id": "user-2",
      "rank": 3,
      "name": "최민준",
      "distanceKm": 81,
      "points": 91
    }
  ],
  "ranks": [
    {
      "id": "user-1",
      "rank": 4,
      "name": "민병희",
      "distanceKm": 42.4,
      "points": 98,
      "isMe": true
    }
  ]
}
```

Expected behavior:
- `districtName` is the signed-in user's current district.
- `ranks` are sorted by `distanceKm DESC`, then `points DESC`, then name.
- `myRank` is the signed-in user's own row from `ranks`.
- `focusRanks` should include nearby rows around `myRank` for quick comparison.
- `weeklyDistanceKm` and `myPoints` reflect the current signed-in user's weekly totals.

---

## Contract notes
- Backend should normalize platform-specific health source data before returning to app.
- App screens should receive stable product-level shapes only.
- Platform-specific provider details should stay out of UI contracts.
