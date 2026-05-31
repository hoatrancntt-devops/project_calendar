# Hướng dẫn: Cấp quyền Azure App cho Calendar Sync

> IT admin của **mỗi công ty** thực hiện 1 lần. Sau đó backend tự động sync lịch mỗi 15 phút.

## Điều kiện tiên quyết

- Tài khoản **Global Administrator** hoặc **Application Administrator** trong Azure AD của công ty
- Client ID của Azure App đã được tạo trong tenant của công ty đó

---

## Bước 1 — Tạo App Registration trong tenant công ty

1. Truy cập **portal.azure.com** → đăng nhập bằng tài khoản admin công ty
2. Tìm **Azure Active Directory** → **App registrations** → **New registration**
3. Điền:
   - Name: `M365 Calendar Sync - HoanLocViet`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: để trống
4. Nhấn **Register**
5. Ghi lại: **Application (client) ID** và **Directory (tenant) ID**

---

## Bước 2 — Tạo Client Secret

### Cách A: Azure Portal

1. Trong App Registration vừa tạo → **Certificates & secrets** → **New client secret**
2. Description: `calendar-sync-secret`; Expires: **24 months**
3. Nhấn **Add** → **copy ngay cột Value** (chỉ hiển thị 1 lần)

> ⚠️ Cột **Value** ≠ cột **Secret ID** — phải copy đúng cột Value (dạng `abc~XYZ...`), không phải GUID

### Cách B: Azure CLI

```bash
# Đăng nhập
az login

# Tạo secret mới (--append để không xóa secret cũ)
az ad app credential reset \
  --id <APPLICATION_CLIENT_ID> \
  --append \
  --display-name "calendar-sync-2026" \
  --end-date "2028-12-31"
```

Output:
```json
{
  "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "password": "abc~XYZ...",   ← copy giá trị này (Secret Value)
  "tenant": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
}
```

Xóa secret cũ (nếu cần):
```bash
az ad app credential delete \
  --id <APPLICATION_CLIENT_ID> \
  --key-id <SECRET_ID_CU>
```

---

## Bước 3 — Cấp API Permissions (Calendars.Read — Application)

1. **API permissions** → **Add a permission** → **Microsoft Graph**
2. Chọn **Application permissions** (không phải Delegated)
3. Tìm và chọn: `Calendars.Read`
4. Nhấn **Add permissions**
5. Nhấn **Grant admin consent for [Tên công ty]** → Confirm **Yes**
   > ⚠️ Bước này bắt buộc — thiếu sẽ trả về 403

---

## Bước 4 — Nhập vào Settings ứng dụng

Đăng nhập vào Hệ thống Lịch Trình → **Settings** → tab **Companies** → chọn công ty:

| Trường | Giá trị |
|--------|---------|
| Tenant ID | Directory (tenant) ID từ Bước 1 |
| Client ID | Application (client) ID từ Bước 1 |
| Client Secret | Secret value từ Bước 2 |
| Hòm thư lấy lịch | VD: `tonggiamdoc@suleco.vn` |

Nhấn **Lưu tất cả** → backend sẽ nhận credentials và bắt đầu sync.

---

## Lưu ý bảo mật

- Client Secret **không lưu trong browser** — chỉ truyền lên backend khi admin nhấn Lưu
- Backend chạy trong Docker network riêng, không expose ra internet
- Secret lưu trong SQLite file trên VPS (`/data/calendar.db`) — chỉ admin VPS mới access được

---

## Kiểm tra sau setup

- Dashboard → nhấn **Đồng bộ** — nếu thành công sẽ hiển thị số sự kiện mới

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|----------|
| `401 AADSTS7000215` | Client Secret sai — đang dùng **Secret ID** thay vì **Secret Value** | Vào Azure Portal → Certificates & secrets → copy đúng cột **Value** |
| `401 AADSTS7000222` | Client Secret đã hết hạn | Tạo secret mới bằng az CLI hoặc Portal |
| `401 AADSTS700016` | Client ID không tồn tại trong tenant | Kiểm tra lại Application (client) ID |
| `403 Forbidden` | Thiếu `Calendars.Read` Application permission hoặc chưa Grant Admin Consent | Làm lại Bước 3 |
| `404 Not Found` | Mailbox email không tồn tại trong M365 tenant **hoặc** chưa Grant Admin Consent | Kiểm tra email hòm thư; Grant admin consent ở Bước 3 |
| `skipped: true` | Công ty chưa nhập đủ credentials hoặc chưa có hòm thư | Điền đủ Tenant ID / Client ID / Secret / Hòm thư → Lưu |
