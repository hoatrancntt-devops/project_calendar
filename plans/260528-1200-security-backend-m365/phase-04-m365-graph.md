---
phase: 04
title: M365 Graph API — Real Calendar Sync
status: todo
priority: high
effort: 1-2d
blockedBy: phase-03
---

# Phase 04 — M365 Graph API Real Sync

## Overview

Thay mock sync bằng kết nối thực tới Microsoft Graph API. Backend dùng **client credentials flow** (app-to-app, không cần user M365 login). Sync calendar events từ Outlook/Teams về DB, và tạo events mới qua Graph API.

## Prerequisites

- Phase 03 hoàn thành (backend + DB)
- **[VALIDATION 2026-05-28] Azure App Registration chưa có — Phase 04 blocked cho đến khi admin setup Azure**
- Test với sandbox/dev tenant trước; production App Registration cần approval từng công ty

## Azure App Registration Setup Guide (per company)

Admin thực hiện cho TỪNG công ty trong Azure Portal:

1. **Azure AD → App registrations → New registration**: Name `M365CalendarSync-{CompanyName}`, single-tenant
2. **API permissions → Graph → Application permissions**: `Calendars.Read`, `Calendars.ReadWrite`, `User.Read.All` → **Grant admin consent**
3. **Certificates & secrets → New client secret**: copy value ngay (chỉ hiển thị 1 lần)
4. **Overview**: copy `clientId` (Application ID) và `tenantId` (Directory ID)
5. Nhập 3 values vào Settings → Companies → Credentials trong app

> **MSAL user auth (Phase 03)**: Cần App Registration riêng với Delegated permissions (`openid`, `profile`, `email`) và Redirect URI của app.

## Architecture

## Architecture

```
Frontend trigger "Sync"
    └─> POST /api/sync/:companyId
           └─> backend: lấy credentials (decrypt)
                  └─> m365-token-service: get/refresh access token
                         └─> Graph API: GET /users/{email}/calendarView
                                └─> Map events → DB schema
                                       └─> Upsert vào events table
                                              └─> Return updated events
```

## Implementation Details

### 1. Token Service (`backend/services/m365-token-service.js`)

```js
// Client credentials flow — server-to-server
const { ClientSecretCredential } = require('@azure/identity');

const tokenCache = new Map(); // companyId → { token, expiresAt }
// [RED TEAM F5] Cache miss → RE-FETCH from Azure (client_credentials flow, no user interaction needed)
// Do NOT treat cache miss as error. This handles server restarts gracefully.

async function getAccessToken(company) {
  const cached = tokenCache.get(company.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }
  // Cache miss or expired → re-fetch (works after restart, rotation, etc.)
  const credential = new ClientSecretCredential(
    decrypt(company.tenant_id),
    decrypt(company.client_id),
    decrypt(company.client_secret)
  );
  
  const token = await credential.getToken('https://graph.microsoft.com/.default');
  tokenCache.set(company.id, { token: token.token, expiresAt: token.expiresOn });
  return token.token;
}

// [RED TEAM F7] Call this when credentials are rotated via PUT /api/companies/:id/credentials
// MUST be called by the credential update route handler before returning success
function invalidateTokenCache(companyId) {
  tokenCache.delete(companyId);
}
```

### 2. Graph Client (`backend/services/graph-calendar-service.js`)

```js
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

// [RED TEAM F15] Default cron sync window: today-7d to today+90d
// Configurable via admin_settings.sync_window_days_past / sync_window_days_future
function getDefaultSyncWindow() {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 90);
  return { start, end };
}

async function syncMailboxEvents(company, mailboxEmail, startDate, endDate) {
  const token = await getAccessToken(company);
  const client = Client.init({ authProvider: (done) => done(null, token) });

  // [RED TEAM F13] Implement nextLink pagination — $top: 100 is NOT enough
  const allEvents = [];
  let requestUrl = `/users/${mailboxEmail}/calendarView`;
  let pageCount = 0;
  const MAX_PAGES = 10; // safety cap with warning

  let response = await client
    .api(requestUrl)
    .query({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      $select: 'id,subject,start,end,location,attendees,organizer,isOnlineMeeting,onlineMeeting',
      $top: 100
    })
    .get();

  while (response.value && pageCount < MAX_PAGES) {
    allEvents.push(...response.value);
    pageCount++;
    if (response['@odata.nextLink']) {
      if (pageCount >= MAX_PAGES) {
        console.warn(`[sync] ${mailboxEmail}: hit MAX_PAGES (${MAX_PAGES}), truncating sync`);
        break;
      }
      response = await client.api(response['@odata.nextLink']).get();
    } else {
      break;
    }
  }

  return allEvents.map(mapGraphEventToDbEvent);
}

function mapGraphEventToDbEvent(graphEvent) {
  const isTeams = graphEvent.isOnlineMeeting || 
    graphEvent.onlineMeeting?.joinUrl?.includes('teams.microsoft.com');
  
  return {
    m365_event_id: graphEvent.id,
    title: graphEvent.subject,
    subject: graphEvent.subject,
    start_time: graphEvent.start.dateTime,
    end_time: graphEvent.end.dateTime,
    date: graphEvent.start.dateTime.split('T')[0],
    time: `${graphEvent.start.dateTime.split('T')[1].substring(0,5)} - ${graphEvent.end.dateTime.split('T')[1].substring(0,5)}`,
    type: isTeams ? 'teams' : 'offline',
    location: graphEvent.location?.displayName || (isTeams ? 'Microsoft Teams' : ''),
    attendees: graphEvent.attendees?.map(a => a.emailAddress.address).join(', ') || '',
    organizer: graphEvent.organizer?.emailAddress?.address || '',
    status: 'confirmed'
  };
}
```

### 3. Sync Router (`backend/routes/sync-router.js`)

```
POST /api/sync/:companyId        → sync all mailboxes for a company
POST /api/sync/:companyId/mailbox/:email  → sync specific mailbox
GET  /api/sync/status            → last sync time per company
```

**[RED TEAM F9] Upsert + Delta-based Deletion Detection:**

```js
// REPLACE calendarView with calendarView/delta — natively surfaces @removed entries
// Store deltaLink per (company_id, mailbox_email) in sync_state table
// Full sync on first run → subsequent syncs use deltaLink (incremental, efficient)

// New DB table required:
// CREATE TABLE sync_state (
//   company_id TEXT,
//   mailbox_email TEXT,
//   delta_link TEXT,    -- Graph delta token for next incremental sync
//   last_sync DATETIME,
//   PRIMARY KEY (company_id, mailbox_email)
// );
//
// Delta loop: items with item['@removed'] → UPDATE events SET status='cancelled'
// Items without @removed → upsert by m365_event_id
// Save new deltaLink after each sync pass
```

### 4. Create Event via Graph API

`BookingModal.jsx` hiện mock-simulate. Sau Phase 04:

```
POST /api/events/create-and-sync
  body: { companyId, mailboxEmail, subject, start_time, end_time, location, attendees, body }

Backend:
  1. POST /users/{email}/events → tạo event trên M365
  2. Nhận m365_event_id trả về
  3. Lưu vào DB với m365_event_id
  4. Return event object cho frontend
```

### 5. Auto-sync Schedule (Optional)

Dùng `node-cron` để tự động sync mỗi 15 phút:
```js
const cron = require('node-cron');
cron.schedule('*/15 * * * *', async () => {
  // Sync tất cả companies có credentials
});
```

## Azure App Registration Requirements

Admin cần tạo App Registration trong Azure Portal cho từng công ty:
1. Azure Active Directory → App registrations → New registration
2. API permissions → Microsoft Graph → Application permissions:
   - `Calendars.Read`
   - `Calendars.ReadWrite`
   - `User.Read.All` (để list users trong tenant)
3. Grant admin consent
4. Certificates & secrets → New client secret → copy value

## Files To Create/Modify

| File | Action |
|------|--------|
| `backend/services/m365-token-service.js` | CREATE — OAuth token management |
| `backend/services/graph-calendar-service.js` | CREATE — Graph API calls + event mapping |
| `backend/routes/sync-router.js` | CREATE — sync endpoints |
| `backend/app.js` | MODIFY — register sync routes |
| `backend/package.json` | MODIFY — thêm @microsoft/microsoft-graph-client, @azure/identity, isomorphic-fetch, node-cron |
| `frontend/src/components/BookingModal.jsx` | MODIFY — gọi /api/events/create-and-sync thay vì mock |
| `frontend/src/components/Dashboard.jsx` | MODIFY — handleManualSync gọi /api/sync/:companyId |

## Error Handling

| Error | Handling |
|-------|---------|
| Invalid credentials | Return 401, hiển thị "Credentials M365 không hợp lệ" |
| Token expired | Auto-refresh, retry 1 lần |
| Rate limit (429) | Exponential backoff, max 3 retries |
| Mailbox not found | Log + skip, không crash toàn bộ sync |
| Network timeout | Timeout 30s, return partial results |

## Todo

- [ ] Cài dependencies: @microsoft/microsoft-graph-client, @azure/identity, isomorphic-fetch, node-cron
- [ ] Tạo m365-token-service.js (client credentials flow)
- [ ] Tạo graph-calendar-service.js (sync + create event)
- [ ] Tạo sync-router.js
- [ ] Đăng ký sync routes trong app.js
- [ ] Sửa BookingModal.jsx: dùng API thật
- [ ] Sửa Dashboard.jsx: handleManualSync gọi API
- [ ] Test sync với Azure sandbox tenant
- [ ] Test tạo event qua Graph API
- [ ] Test auto-sync cron

## Success Criteria

- Sync button lấy events thực từ Outlook calendar
- Tạo event qua app → xuất hiện trong Outlook/Teams
- Credentials không bao giờ lộ ra frontend
- Sync thất bại hiển thị lỗi cụ thể, không crash app
