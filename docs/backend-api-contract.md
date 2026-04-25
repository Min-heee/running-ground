# backend API contract draft

## Goal
Define the minimum backend responses the mobile app expects for release MVP.

These are frontend-oriented contracts.
Exact controller/service naming can differ on the backend, but response shapes should stay stable.

---

## Health / readiness
### GET `/api/health`

Response example:

```json
{
  "status": "ok",
  "ready": true,
  "environment": "preview",
  "uptimeSeconds": 120,
  "publicBaseUrl": "https://preview-api.runningground.com",
  "config": {
    "maxBodySizeKb": 256,
    "requestTimeoutMs": 30000,
    "headersTimeoutMs": 10000,
    "keepAliveTimeoutMs": 5000
  },
  "store": {
    "storeExists": true,
    "backupCount": 10,
    "counts": {
      "users": 12,
      "runs": 48
    }
  }
}
```

If the JSON store cannot be read and no valid backup can be restored, the backend returns `503` with `ready: false`.

---

## 0. Auth
### POST `/api/auth/login`

Request example:

```json
{
  "username": "demo-user",
  "password": "demo-pass1"
}
```

Response example:

```json
{
  "accessToken": "jwt-token",
  "user": {
    "name": "민병희",
    "districtName": "강남구",
    "universityName": "서울대학교",
    "publicTag": "#BH7K2"
  }
}
```

### POST `/api/auth/logout`

Response example:

```json
{
  "success": true
}
```

### POST `/api/auth/register`

Request example:

```json
{
  "username": "new-user",
  "password": "password123",
  "nickname": "러너길동",
  "realName": "홍길동",
  "phone": "01012345678",
  "provinceName": "서울특별시",
  "cityName": "",
  "districtName": "강남구",
  "universityName": "서울대학교",
  "addressDetail": "테헤란로 123, 101동 1203호",
  "birthDate": "1990-01-01"
}
```

Response shape:
- same as login response
- `universityName` is optional. If it is empty, the user is simply excluded from the university league until they choose one later.

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

## 2. Market
### GET `/api/market/overview`

```json
{
  "currentPoints": 128,
  "totalRedeemedCount": 1,
  "items": [
    {
      "id": "reward-coupon-coffee",
      "title": "러닝 후 커피 쿠폰",
      "category": "제휴 쿠폰",
      "description": "가볍게 회복할 수 있는 아메리카노 1잔 쿠폰이야.",
      "costPoints": 60,
      "partnerName": "Daily Beans",
      "repeatable": false,
      "claimState": "claimable"
    }
  ]
}
```

### POST `/api/market/items/{itemId}/claim`

```json
{
  "success": true,
  "claimedItemId": "reward-coupon-coffee",
  "overview": {
    "currentPoints": 68,
    "totalRedeemedCount": 2,
    "items": []
  }
}
```

Expected behavior:
- `currentPoints` is the signed-in user's reward wallet, not district ranking points.
- `claimState` can be `claimable`, `claimed`, or `locked`.
- non-repeatable items should not be claimable twice.

---

## 3. My profile
### GET `/api/me/profile`

```json
{
  "name": "민병희",
  "provinceName": "서울특별시",
  "districtName": "강남구",
  "universityName": "서울대학교",
  "addressDetail": "테헤란로 123",
  "publicTag": "#BH7K2"
}
```

### PATCH `/api/me/profile`
- update profile basics
- accepted fields: `name`, optional `universityName`

### GET `/api/me/notifications`

```json
{
  "friendAlerts": true,
  "districtAlerts": true,
  "marketAlerts": false
}
```

### PATCH `/api/me/notifications`
- update app notification preferences

### PATCH `/api/me/region`
- update district/region settings

---

## 3.5. Integration import queue
### POST `/api/integrations/sources/{sourceType}/import`

Request example:

```json
{
  "runs": [
    {
      "externalId": "health-001",
      "date": "2026-04-15",
      "distanceKm": 5.2,
      "pace": "05:31/km"
    }
  ]
}
```

Response example:

```json
{
  "success": true,
  "source": {
    "sourceType": "health_connect",
    "displayName": "Health Connect",
    "connected": true,
    "connectionStatus": "connected",
    "pendingImportCount": 1
  },
  "queuedRuns": 1,
  "pendingRuns": 1
}
```

Expected behavior:
- this queues provider-normalized runs before sync
- `sourceType` should be one of the external provider sources, not `manual`
- duplicate filtering happens during `/api/integrations/sync`

### POST `/api/integrations/sync`

Response example:

```json
{
  "success": true,
  "syncedSources": 1,
  "scannedRuns": 4,
  "importedRuns": 3,
  "duplicateRuns": 1,
  "syncedRuns": 3,
  "lastSyncedAt": "2026-04-15 21:20"
}
```

---

## 4. My activity
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

## 5. Run detail
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

## 6. Friend leaderboard
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

Expected behavior:
- `ranks` should already be sorted by `rank ASC`.
- accepted friend requests should be reflected in `ranks` once the friendship is active.
- `requests` should only include still-actionable requests for the signed-in user.

---

## 7. Friend activity
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

## 8. Integration status
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

### POST `/api/integrations/sources/{sourceType}/connect`

Suggested response:

```json
{
  "success": true,
  "source": {
    "sourceType": "health_connect",
    "displayName": "Health Connect",
    "connected": true,
    "connectionStatus": "connected",
    "recommendedPlatform": "android"
  },
  "sources": []
}
```

### POST `/api/integrations/sources/{sourceType}/disconnect`

Suggested response:

```json
{
  "success": true,
  "source": {
    "sourceType": "health_connect",
    "displayName": "Health Connect",
    "connected": false,
    "connectionStatus": "planned",
    "recommendedPlatform": "android"
  },
  "sources": []
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

Expected behavior:
- connect/disconnect should immediately be reflected in the returned `sources` list.
- when a source is disconnected, `connected` becomes `false` and it is excluded from subsequent sync counts.
- `syncedSources` counts only sources actually connected for the signed-in user.
- `syncedRuns` reflects how many run records were fetched or reconciled in this sync cycle.
- `lastSyncedAt` should be propagated back into connected sources in the next `GET /api/integrations/sources` response.

---

## 9. Friend add by tag
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

### POST `/api/friends/requests/{requestId}/accept`

```json
{
  "success": true,
  "requestId": "r10",
  "status": "accepted"
}
```

### POST `/api/friends/requests/{requestId}/reject`

```json
{
  "success": true,
  "requestId": "r10",
  "status": "rejected"
}
```

### POST `/api/friends/requests/{requestId}/cancel`

```json
{
  "success": true,
  "requestId": "r10",
  "status": "cancelled"
}
```

Expected behavior:
- `leaderboard.requests` should only contain requests still actionable in the app.
- accepted requests can be omitted from future `GET /api/friends/leaderboard` responses.
- `cancel` is for requests the signed-in user already sent.
- `accept` and `reject` are for requests received by the signed-in user.

---

## 10. District personal ranking
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

## 11. Region league drilldown
### GET `/api/league/regions`

Query:
- `nodeId` optional. If omitted, return the top-level Korea summary node.

```json
{
  "currentNode": {
    "id": "kr-gg",
    "name": "경기도",
    "level": "province",
    "averageDistanceKm": 23.1,
    "totalDistanceKm": 73458,
    "participationRate": 61,
    "participants": 3180,
    "rank": 9
  },
  "breadcrumb": [
    {
      "id": "kr",
      "name": "대한민국",
      "level": "country"
    },
    {
      "id": "kr-gg",
      "name": "경기도",
      "level": "province"
    }
  ],
  "children": [
    {
      "id": "kr-gg-goyang",
      "name": "고양시",
      "level": "city",
      "averageDistanceKm": 24.4,
      "totalDistanceKm": 15128,
      "participationRate": 63,
      "participants": 620,
      "rank": 1
    }
  ]
}
```

---

## 12. University league
### GET `/api/league/universities`

```json
{
  "ranks": [
    {
      "rank": 1,
      "universityName": "서울대학교",
      "totalDistanceKm": 312.4,
      "participants": 18
    }
  ]
}
```

Expected behavior:
- only users with a non-empty `universityName` are aggregated.
- when a new user signs up with a university that does not exist yet, that university should appear automatically in the next response.
- `ranks` are sorted by `totalDistanceKm DESC`, then `participants DESC`, then university name.

Expected behavior:
- `currentNode` is the region selected by `nodeId`, or the Korea root when `nodeId` is missing.
- `breadcrumb` contains the full path from country to `currentNode`.
- `children` contains the direct child regions of `currentNode`.
- `children` should already be sorted by `rank ASC`.
- When a region has no deeper drilldown, return `children: []`.

---

## Contract notes
- Backend should normalize platform-specific health source data before returning to app.
- App screens should receive stable product-level shapes only.
- Platform-specific provider details should stay out of UI contracts.
