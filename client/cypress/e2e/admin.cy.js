/**
 * MODULE: Admin Panel
 * Controller: adminController.js
 * Middleware: auth + isAdmin (role='admin')
 * Routes:
 *   GET   /api/admin/users              → getAllUsers
 *   POST  /api/admin/users/:userId/ban  → toggleBan
 *   POST  /api/admin/users/:userId/reset → resetUserAccount
 *   GET   /api/admin/stats              → getStats
 *   GET   /api/admin/logs               → getLogs
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 *   getAllUsers:       findAll attributes only (no password)
 *   toggleBan:        user not found → 404 | admin ban admin → 403 | update isBanned/banReason
 *   resetUserAccount: user not found → 404 | admin reset admin → 403 | wipe publicKey, vault, prekeys
 *   getStats:         aggregate counts by role, online, recent messages
 *   getLogs:          mock placeholder logs
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

const apiAdmin = (username, email) =>
  cy.task('createUserAndGetToken', { username, email, password: 'AdminPass123' }).then(res => {
    // Elevate to admin role in DB
    return cy.task('setUserRole', { userId: res.userId, role: 'admin' }).then(() => res);
  });

describe('[Module: Admin Panel] Quản trị hệ thống', () => {
  const ts = Date.now();

  let adminToken;
  let adminUserId;
  let targetUserId;
  let studentToken;

  before(() => {
    // Create admin user via task
    cy.task('createUserAndGetToken', {
      username: `cy_admin_${ts}`,
      email: `cy_admin_${ts}@utt.edu.vn`,
      password: 'AdminPass123',
      role: 'admin'
    }).then(res => {
      adminToken = res.token;
      adminUserId = res.userId;
    });

    apiUser(`cy_student_${ts}`, `cy_student_${ts}@st.utt.edu.vn`).then(res => {
      targetUserId = res.userId;
      studentToken = res.token;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADM-01
   * Component/Function: getAllUsers
   * Description: Admin lấy danh sách tất cả user thành công
   * Pre-conditions: Đã có ít nhất 1 user trong DB; token admin hợp lệ
   * Input Data: GET /api/admin/users (token admin)
   * Expected Output: HTTP 200 + Array có các field: id, username, email, role, isVerified, isBanned
   */
  it('TC-ADM-01 | [Positive] Admin lấy danh sách tất cả user thành công → 200', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/users`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property('users').that.is.an('array').with.length.greaterThan(0);
      expect(res.body).to.have.property('total');
      expect(res.body).to.have.property('page');
      expect(res.body).to.have.property('totalPages');
      expect(res.body).to.have.property('limit');
      const firstUser = res.body.users[0];
      expect(firstUser).to.have.keys(['id', 'username', 'email', 'role', 'isVerified', 'isBanned', 'createdAt', 'lastSeenAt', 'online']);
      // Không được lộ password
      expect(firstUser).to.not.have.property('password');
    });
  });

  /**
   * TC-ADM-02
   * Component/Function: toggleBan (ban user)
   * Description: Admin ban một student thành công
   * Pre-conditions: Admin tồn tại, targetUser là student
   * Input Data: POST /api/admin/users/:userId/ban { isBanned: true, banReason: 'Vi phạm nội quy' }
   * Expected Output: HTTP 200 + { message: 'User banned successfully', user.isBanned: true }
   */
  it('TC-ADM-02 | [Positive] Admin ban user thành công → 200 banned', () => {
    apiUser(`cy_ban_tgt_${ts}`, `cy_ban_tgt_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/admin/users/${res.userId}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isBanned: true, banReason: 'Vi phạm nội quy E2E' }
      }).then(banRes => {
        expect(banRes.status).to.eq(200);
        expect(banRes.body.message).to.include('banned');
        expect(banRes.body.user.isBanned).to.be.true;
        expect(banRes.body.user.banReason).to.include('E2E');
      });
    });
  });

  /**
   * TC-ADM-03
   * Component/Function: toggleBan (unban user)
   * Description: Admin gỡ ban một user đang bị ban thành công
   * Pre-conditions: Target user đang bị ban
   * Input Data: POST /api/admin/users/:userId/ban { isBanned: false }
   * Expected Output: HTTP 200 + { message: 'User unbanned successfully', user.isBanned: false, user.banReason: null }
   */
  it('TC-ADM-03 | [Positive] Admin gỡ ban user thành công → 200 unbanned', () => {
    apiUser(`cy_unban_${ts}`, `cy_unban_${ts}@st.utt.edu.vn`).then(res => {
      // Ban trước
      cy.request({ method: 'POST', url: `${API}/admin/users/${res.userId}/ban`, headers: { Authorization: `Bearer ${adminToken}` }, body: { isBanned: true, banReason: 'Test ban' } });
      // Gỡ ban
      cy.request({
        method: 'POST',
        url: `${API}/admin/users/${res.userId}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isBanned: false }
      }).then(unbanRes => {
        expect(unbanRes.status).to.eq(200);
        expect(unbanRes.body.message).to.include('unbanned');
        expect(unbanRes.body.user.isBanned).to.be.false;
        expect(unbanRes.body.user.banReason).to.be.null;
      });
    });
  });

  /**
   * TC-ADM-04
   * Component/Function: getStats
   * Description: Admin lấy thống kê hệ thống thành công
   * Pre-conditions: Token admin hợp lệ
   * Input Data: GET /api/admin/stats
   * Expected Output: HTTP 200 + { summary: { totalUsers, totalMessages, totalGroups... }, distribution }
   */
  it('TC-ADM-04 | [Positive] Admin lấy thống kê hệ thống thành công → 200', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/stats`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property('summary');
      expect(res.body).to.have.property('distribution');
      expect(res.body.summary).to.have.property('totalUsers');
      expect(res.body.summary).to.have.property('totalMessages');
      expect(res.body.summary).to.have.property('totalGroups');
      expect(res.body.distribution).to.have.property('students');
      expect(res.body.distribution).to.have.property('teachers');
      expect(res.body.distribution).to.have.property('admins');
    });
  });

  /**
   * TC-ADM-05
   * Component/Function: getLogs
   * Description: Admin lấy system logs thành công
   * Pre-conditions: Token admin hợp lệ
   * Input Data: GET /api/admin/logs
   * Expected Output: HTTP 200 + Array logs với các field (id, event, details, timestamp)
   */
  it('TC-ADM-05 | [Positive] Admin lấy system logs thành công → 200', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/logs`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body).to.be.an('array');
    });
  });

  /**
   * TC-ADM-06
   * Component/Function: resetUserAccount
   * Description: Admin reset E2EE keys và vault của student thành công
   * Pre-conditions: Target user là student
   * Input Data: POST /api/admin/users/:userId/reset
   * Expected Output: HTTP 200 + { message: 'User account reset successfully...' }
   */
  it('TC-ADM-06 | [Positive] Admin reset tài khoản user thành công → 200', () => {
    apiUser(`cy_reset_${ts}`, `cy_reset_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/admin/users/${res.userId}/reset`,
        headers: { Authorization: `Bearer ${adminToken}` }
      }).then(resetRes => {
        expect(resetRes.status).to.eq(200);
        expect(resetRes.body.message).to.include('reset successfully');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADM-07
   * Component/Function: toggleBan
   * Description: Admin cố ban userId không tồn tại → 404
   * Pre-conditions: Token admin hợp lệ
   * Input Data: POST /api/admin/users/00000000-0000-0000-0000-000000000000/ban
   * Expected Output: HTTP 404 + { error: 'User not found' }
   */
  it('TC-ADM-07 | [Negative] Ban userId không tồn tại → 404 User not found', () => {
    cy.request({
      method: 'POST',
      url: `${API}/admin/users/00000000-0000-0000-0000-000000000000/ban`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { isBanned: true, banReason: 'test' },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(404);
      expect(res.body.error).to.include('not found');
    });
  });

  /**
   * TC-ADM-08
   * Component/Function: toggleBan (admin-on-admin protection)
   * Description: Admin cố ban một admin khác → 403
   * Pre-conditions: Target user có role='admin'
   * Input Data: POST /api/admin/users/:adminId/ban { isBanned: true }
   * Expected Output: HTTP 403 + { error: 'Cannot ban another administrator' }
   */
  it('TC-ADM-08 | [Negative] Admin cố ban admin khác → 403 Cannot ban administrator', () => {
    // Tạo admin thứ 2
    cy.task('createUserAndGetToken', {
      username: `cy_admin2_${ts}`,
      email: `cy_admin2_${ts}@utt.edu.vn`,
      password: 'Admin2Pass123',
      role: 'admin'
    }).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/admin/users/${res.userId}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isBanned: true, banReason: 'Admin ban admin test' },
        failOnStatusCode: false
      }).then(banRes => {
        expect(banRes.status).to.eq(403);
        expect(banRes.body.error).to.include('Cannot ban');
      });
    });
  });

  /**
   * TC-ADM-09
   * Component/Function: resetUserAccount (admin-on-admin protection)
   * Description: Admin cố reset tài khoản admin khác → 403
   * Pre-conditions: Target user có role='admin'
   * Input Data: POST /api/admin/users/:adminId/reset
   * Expected Output: HTTP 403 + { error: 'Cannot reset another administrator' }
   */
  it('TC-ADM-09 | [Negative] Admin cố reset tài khoản admin khác → 403', () => {
    cy.task('createUserAndGetToken', {
      username: `cy_admin3_${ts}`,
      email: `cy_admin3_${ts}@utt.edu.vn`,
      password: 'Admin3Pass123',
      role: 'admin'
    }).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/admin/users/${res.userId}/reset`,
        headers: { Authorization: `Bearer ${adminToken}` },
        failOnStatusCode: false
      }).then(resetRes => {
        expect(resetRes.status).to.eq(403);
        expect(resetRes.body.error).to.include('Cannot reset');
      });
    });
  });

  /**
   * TC-ADM-10
   * Component/Function: resetUserAccount
   * Description: Reset userId không tồn tại → 404
   * Pre-conditions: Token admin hợp lệ
   * Input Data: POST /api/admin/users/00000000-0000-0000-0000-000000000000/reset
   * Expected Output: HTTP 404 + { error: 'User not found' }
   */
  it('TC-ADM-10 | [Negative] Reset userId không tồn tại → 404 User not found', () => {
    cy.request({
      method: 'POST',
      url: `${API}/admin/users/00000000-0000-0000-0000-000000000000/reset`,
      headers: { Authorization: `Bearer ${adminToken}` },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(404);
      expect(res.body.error).to.include('not found');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADM-11
   * Component/Function: getAllUsers
   * Description: Danh sách user trả về KHÔNG chứa trường password
   * Pre-conditions: Admin token hợp lệ, có ít nhất 1 user
   * Input Data: GET /api/admin/users
   * Expected Output: HTTP 200 + tất cả objects không có key 'password'
   */
  it('TC-ADM-11 | [Boundary] Danh sách user không lộ trường password → verified', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/users`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      res.body.users.forEach(user => {
        expect(user).to.not.have.property('password');
        expect(user).to.not.have.property('encryptedPrivateKey');
      });
    });
  });

  /**
   * TC-ADM-12
   * Component/Function: getStats
   * Description: Tổng số students ≥ 0 và admins ≥ 1 (luôn tồn tại ít nhất 1 admin)
   * Pre-conditions: Có ít nhất 1 admin trong DB
   * Input Data: GET /api/admin/stats
   * Expected Output: distribution.admins ≥ 1; tất cả counts là số nguyên không âm
   */
  it('TC-ADM-12 | [Boundary] Stats trả về số nguyên không âm, admins ≥ 1', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/stats`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.body.summary.totalUsers).to.be.a('number').and.to.be.greaterThan(0);
      expect(res.body.summary.totalMessages).to.be.a('number').and.to.be.at.least(0);
      expect(res.body.distribution.admins).to.be.a('number').and.to.be.at.least(1);
      expect(res.body.distribution.students).to.be.a('number').and.to.be.at.least(0);
    });
  });

  /**
   * TC-ADM-13
   * Component/Function: toggleBan (ban/unban idempotency)
   * Description: Ban user đang đã bị ban → không có lỗi, vẫn trả về 200
   * Pre-conditions: Target user đã bị ban
   * Input Data: POST /api/admin/users/:userId/ban { isBanned: true } × 2
   * Expected Output: HTTP 200 cả 2 lần
   */
  it('TC-ADM-13 | [Boundary] Ban user đang đã bị ban (idempotent) → 200', () => {
    apiUser(`cy_idem_${ts}`, `cy_idem_${ts}@st.utt.edu.vn`).then(res => {
      const banReq = () => cy.request({
        method: 'POST',
        url: `${API}/admin/users/${res.userId}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isBanned: true, banReason: 'Idempotent ban test' }
      });
      banReq().then(r1 => {
        expect(r1.status).to.eq(200);
        banReq().then(r2 => {
          expect(r2.status).to.eq(200);
          expect(r2.body.user.isBanned).to.be.true;
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADM-14
   * Component/Function: getAllUsers / toggleBan (RBAC - Role Check)
   * Description: Student thường cố truy cập admin endpoints → 403 Forbidden
   * Pre-conditions: Student token hợp lệ (role='student')
   * Input Data: GET /api/admin/users (token student)
   * Expected Output: HTTP 403 + error về role không được phép
   */
  it('TC-ADM-14 | [Security] Student cố truy cập GET /admin/users → 403 Forbidden', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/users`,
      headers: { Authorization: `Bearer ${studentToken}` },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(403);
    });
  });

  /**
   * TC-ADM-15
   * Component/Function: toggleBan (RBAC)
   * Description: Student cố ban một user → 403
   * Pre-conditions: Student token hợp lệ
   * Input Data: POST /api/admin/users/:targetId/ban (token student)
   * Expected Output: HTTP 403
   */
  it('TC-ADM-15 | [Security] Student cố ban user khác → 403 Forbidden', () => {
    cy.request({
      method: 'POST',
      url: `${API}/admin/users/${targetUserId}/ban`,
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { isBanned: true, banReason: 'hack' },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(403);
    });
  });

  /**
   * TC-ADM-16
   * Component/Function: getAllUsers (no token)
   * Description: Truy cập admin endpoint không có token → 401
   * Pre-conditions: N/A
   * Input Data: GET /api/admin/users (không có Authorization header)
   * Expected Output: HTTP 401
   */
  it('TC-ADM-16 | [Security] GET /admin/users không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'GET',
      url: `${API}/admin/users`,
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });
  });

  /**
   * TC-ADM-17
   * Component/Function: toggleBan → Login bị ban
   * Description: Sau khi bị ban, user cố đăng nhập lại → 403 với lý do bị khóa
   * Pre-conditions: User đã bị ban
   * Input Data: POST /api/auth/login { username, password }
   * Expected Output: HTTP 403 + { error: 'Tài khoản của bạn đã bị khóa', reason }
   */
  it('TC-ADM-17 | [Security] User bị ban đăng nhập lại → 403 tài khoản bị khóa', () => {
    const ts2 = Date.now();
    const username = `cy_banned_${ts2}`;
    apiUser(username, `cy_banned_${ts2}@st.utt.edu.vn`).then(res => {
      cy.request({ method: 'POST', url: `${API}/admin/users/${res.userId}/ban`, headers: { Authorization: `Bearer ${adminToken}` }, body: { isBanned: true, banReason: 'Test revoke' } }).then(() => {
        cy.request({
          method: 'POST',
          url: `${API}/auth/login`,
          body: { username, password: 'Cypress12345' },
          failOnStatusCode: false
        }).then(loginRes => {
          expect(loginRes.status).to.eq(403);
          expect(loginRes.body.error).to.include('bị khóa');
          expect(loginRes.body.reason).to.include('Test revoke');
        });
      });
    });
  });

  /**
   * TC-ADM-18
   * Component/Function: toggleBan → Middleware check bị ban mid-session
   * Description: User bị ban trong khi đang có token hợp lệ, request tiếp theo bị chặn → 403
   * Pre-conditions: User đã đăng nhập (có token), sau đó admin ban user
   * Input Data: GET /api/users/profile với token của user đã bị ban
   * Expected Output: HTTP 403 + { error: 'Tài khoản của bạn đã bị khóa' }
   */
  it('TC-ADM-18 | [Security] User bị ban mid-session → token hiện tại bị chặn bởi middleware', () => {
    const ts2 = Date.now();
    apiUser(`cy_midsess_${ts2}`, `cy_midsess_${ts2}@st.utt.edu.vn`).then(res => {
      cy.task('banUser', res.userId).then(() => {
        cy.request({
          method: 'GET',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${res.token}` },
          failOnStatusCode: false
        }).then(profileRes => {
          expect(profileRes.status).to.eq(403);
          expect(profileRes.body.error).to.include('bị khóa');
        });
      });
    });
  });

  /**
   * TC-SEC-34
   * Component/Function: getAllUsers (Pagination & Search Security)
   * Description: Lấy danh sách phân trang & tìm kiếm ở server-side an toàn chống SQL Wildcard spike
   */
  it('TC-SEC-34 | [Security] Admin phân trang & tìm kiếm server-side an toàn → 200', () => {
    // 1. Kiểm tra phân trang giới hạn limit = 2
    cy.request({
      method: 'GET',
      url: `${API}/admin/users?page=1&limit=2`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body.users).to.be.an('array').with.length.of.at.most(2);
      expect(res.body.limit).to.eq(2);
      expect(res.body.page).to.eq(1);
      expect(res.body).to.have.property('total');
      expect(res.body).to.have.property('totalPages');
    });

    // 2. Kiểm tra tìm kiếm khớp username
    const adminUsernameSearch = `cy_admin_${ts}`;
    cy.request({
      method: 'GET',
      url: `${API}/admin/users?page=1&limit=10&search=${adminUsernameSearch}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body.users).to.be.an('array').with.length.greaterThan(0);
      const foundAdmin = res.body.users.find(u => u.username === adminUsernameSearch);
      expect(foundAdmin).to.not.be.undefined;
    });

    // 3. Kiểm tra an toàn chống SQL Wildcard
    cy.request({
      method: 'GET',
      url: `${API}/admin/users?page=1&limit=10&search=%_`,
      headers: { Authorization: `Bearer ${adminToken}` }
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body.users).to.be.an('array');
    });
  });
});
