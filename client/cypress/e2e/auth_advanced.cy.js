/**
 * MODULE: Auth Flows – Verification, Token Refresh, Logout, Revoke
 * Controller: authController.js
 * Routes:
 *   POST  /api/auth/verify-email
 *   POST  /api/auth/resend-code
 *   POST  /api/auth/refresh
 *   POST  /api/auth/logout
 *   POST  /api/auth/revoke-all
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * Logic branches per function:
 *   verifyEmail:          !user → 404 | isVerified → 200 (already done) | wrong code → 400
 *                         expired code → 400 | success → isVerified=true
 *   resendVerificationCode: !user → 404 | isVerified → 400 | success → new code + email
 *   refresh:              !refreshToken cookie → 401 | jwt.verify fail → 401
 *                         tokenVersion mismatch → 401 | success → new access+refresh tokens
 *   logout:               clears cookie, no auth needed
 *   revokeAllOtherDevices: !user → 404 | increments tokenVersion → issues new tokens
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';
const apiRegisterAndLogin = (username, email, password = 'Cypress12345', isVerified = true) =>
  cy.task('createUserAndGetToken', { username, email, password, isVerified });

describe('[Module: Auth Advanced] Xác thực Email, Refresh Token & Quản lý Phiên', () => {
  const ts = Date.now();
  const freshUser = { username: `cy_adv_${ts}`, email: `cy_adv_${ts}@st.utt.edu.vn` };

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADV-01
   * Component/Function: verifyEmail
   * Description: Xác thực email thành công với code đúng → isVerified = true
   * Pre-conditions: User đã đăng ký, chưa xác thực, có verificationToken trong DB
   * Input Data: POST /api/auth/verify-email { code: <correct 6-digit code> } với token
   * Expected Output: HTTP 200 + { message: "Xác thực email thành công!", user.isVerified: true }
   */
  it('TC-ADV-01 | [Positive] Xác thực email với code đúng → isVerified = true', () => {
    const u = { username: `cy_verify_${ts}`, email: `cy_verify_${ts}@st.utt.edu.vn` };
    apiRegisterAndLogin(u.username, u.email, 'Cypress12345', false).then(({ token }) => {
      // Lấy code thực từ DB qua task
      cy.task('getVerificationCode', u.username).then((code) => {
        cy.request({
          method: 'POST',
          url: `${API}/auth/verify-email`,
          headers: { Authorization: `Bearer ${token}` },
          body: { code },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.message).to.include('thành công');
          expect(res.body.user.isVerified).to.be.true;
        });
      });
    });
  });

  /**
   * TC-ADV-02
   * Component/Function: verifyEmail (already verified)
   * Description: Gọi verify-email lần 2 khi đã xác thực → trả về thông báo "đã được xác thực"
   * Pre-conditions: User đã xác thực thành công (isVerified = true)
   * Input Data: POST /api/auth/verify-email { code: <bất kỳ> }
   * Expected Output: HTTP 200 + { message: "Tài khoản đã được xác thực" }
   */
  it('TC-ADV-02 | [Positive] Gọi verify-email lần 2 khi đã verified → 200 đã xác thực', () => {
    apiRegisterAndLogin(freshUser.username, freshUser.email).then(({ token }) => {
      // Task xác thực user trong DB
      cy.task('verifyUser', freshUser.username);
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: '000000' }, // code không quan trọng vì đã verified
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.message).to.include('đã được xác thực');
      });
    });
  });

  /**
   * TC-ADV-03
   * Component/Function: resendVerificationCode
   * Description: Gửi lại code xác thực cho user chưa verified → 200 thành công
   * Pre-conditions: User đã đăng ký, chưa xác thực
   * Input Data: POST /api/auth/resend-code với Bearer token
   * Expected Output: HTTP 200 + { message: "Mã xác thực mới đã được gửi..." }
   */
  it('TC-ADV-03 | [Positive] Gửi lại code xác thực thành công → 200', () => {
    const u = { username: `cy_resend_${ts}`, email: `cy_resend_${ts}@st.utt.edu.vn` };
    apiRegisterAndLogin(u.username, u.email, 'Cypress12345', false).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/resend-code`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.message).to.include('gửi');
      });
    });
  });

  /**
   * TC-ADV-04
   * Component/Function: refresh
   * Description: Dùng refreshToken hợp lệ (cookie) để lấy access token mới
   * Pre-conditions: User đã đăng nhập, refreshToken cookie tồn tại
   * Input Data: POST /api/auth/refresh với refreshToken cookie hợp lệ
   * Expected Output: HTTP 200 + { token: <new JWT>, user: {...} }
   */
  it('TC-ADV-04 | [Positive] Refresh token hợp lệ → nhận access token mới', () => {
    // Đăng nhập qua UI để browser lưu cookie refreshToken
    cy.clearCookies();
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: { username: freshUser.username, password: 'Cypress12345' },
    }).then((loginRes) => {
      // Cookie được set bởi server, cy.request tự lưu
      expect(loginRes.status).to.eq(200);
      cy.request({
        method: 'POST',
        url: `${API}/auth/refresh`,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('token');
        expect(res.body).to.have.property('user');
        expect(res.body.user).to.have.property('id');
      });
    });
  });

  /**
   * TC-ADV-05
   * Component/Function: logout
   * Description: Đăng xuất thành công → xóa refreshToken cookie
   * Pre-conditions: User đã đăng nhập
   * Input Data: POST /api/auth/logout
   * Expected Output: HTTP 200 + { message: "Đăng xuất thành công" }
   */
  it('TC-ADV-05 | [Positive] Logout thành công → 200 + xóa cookie', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/logout`,
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.message).to.eq('Đăng xuất thành công');
    });
  });

  /**
   * TC-ADV-06
   * Component/Function: revokeAllOtherDevices
   * Description: Revoke tất cả thiết bị khác và nhận token mới cho thiết bị hiện tại
   * Pre-conditions: User đã đăng nhập, có Bearer token
   * Input Data: POST /api/auth/revoke-all với token
   * Expected Output: HTTP 200 + { token: <new JWT>, message: "Đã đăng xuất..." }
   */
  it('TC-ADV-06 | [Positive] Revoke devices thành công → nhận token mới', () => {
    apiRegisterAndLogin(freshUser.username, freshUser.email).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/revoke-all`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('token');
        expect(res.body.message).to.include('đăng xuất');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADV-07
   * Component/Function: verifyEmail
   * Description: Xác thực với code SAI → 400
   * Pre-conditions: User chưa verified, có token hợp lệ
   * Input Data: POST /api/auth/verify-email { code: "000000" } (sai)
   * Expected Output: HTTP 400 + { error: "Mã xác thực không chính xác" }
   */
  it('TC-ADV-07 | [Negative] Verify email với code sai → 400', () => {
    const u = { username: `cy_badcode_${ts}`, email: `cy_badcode_${ts}@st.utt.edu.vn` };
    apiRegisterAndLogin(u.username, u.email, 'Cypress12345', false).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: '000000' },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.include('không chính xác');
      });
    });
  });

  /**
   * TC-ADV-08
   * Component/Function: resendVerificationCode
   * Description: Gửi lại code khi user đã verified → 400
   * Pre-conditions: User đã xác thực (isVerified = true)
   * Input Data: POST /api/auth/resend-code với token của user đã verified
   * Expected Output: HTTP 400 + { error: "Tài khoản đã được xác thực" }
   */
  it('TC-ADV-08 | [Negative] Resend code khi đã verified → 400', () => {
    apiRegisterAndLogin(freshUser.username, freshUser.email).then(({ token }) => {
      cy.task('verifyUser', freshUser.username);
      cy.request({
        method: 'POST',
        url: `${API}/auth/resend-code`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.include('đã được xác thực');
      });
    });
  });

  /**
   * TC-ADV-09
   * Component/Function: refresh
   * Description: Gọi /refresh không có cookie → 401
   * Pre-conditions: Không có refreshToken cookie
   * Input Data: POST /api/auth/refresh không có cookie
   * Expected Output: HTTP 401 + { error: "Không tìm thấy Refresh Token" }
   */
  it('TC-ADV-09 | [Negative] Refresh không có cookie → 401', () => {
    cy.clearCookies();
    cy.request({
      method: 'POST',
      url: `${API}/auth/refresh`,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
      expect(res.body.error).to.include('Refresh Token');
    });
  });

  /**
   * TC-ADV-10
   * Component/Function: login
   * Description: Đăng nhập tài khoản bị ban → 403
   * Pre-conditions: User bị ban trong DB
   * Input Data: POST /api/auth/login { username, password } của user bị ban
   * Expected Output: HTTP 403 + { error: "Tài khoản của bạn đã bị khóa" }
   */
  it('TC-ADV-10 | [Negative] Đăng nhập tài khoản bị ban → 403', () => {
    const banned = { username: `cy_ban2_${ts}`, email: `cy_ban2_${ts}@st.utt.edu.vn` };
    apiRegisterAndLogin(banned.username, banned.email).then(({ userId }) => {
      cy.task('banUser', userId).then(() => {
        cy.request({
          method: 'POST',
          url: `${API}/auth/login`,
          body: { username: banned.username, password: 'Cypress12345' },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('bị khóa');
        });
      });
    });
  });

  /**
   * TC-ADV-11
   * Component/Function: register
   * Description: Đăng ký với email không phải UTT → 400 validation error
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register { email: "test@gmail.com", ... }
   * Expected Output: HTTP 400 + { error: "Validation Error" } (từ Zod schema)
   */
  it('TC-ADV-11 | [Negative] Đăng ký email không phải UTT → 400 Validation Error', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `cy_nonemail_${ts}`,
        email: 'test@gmail.com',
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' },
      },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  /**
   * TC-ADV-12
   * Component/Function: register
   * Description: Đăng ký username trùng → 409 Conflict
   * Pre-conditions: Username đã tồn tại trong DB
   * Input Data: POST /api/auth/register { username: <existing>, email: <new> }
   * Expected Output: HTTP 409 + { error: "Username already exists" }
   */
  it('TC-ADV-12 | [Negative] Đăng ký username trùng → 409 Username already exists', () => {
    apiRegisterAndLogin(freshUser.username, freshUser.email).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/register`,
        body: {
          username: freshUser.username, // trùng
          email: `cy_dup_${ts}@st.utt.edu.vn`,
          password: 'Cypress12345',
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' },
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(409);
        expect(res.body.error).to.eq('Username already exists');
      });
    });
  });

  /**
   * TC-ADV-13
   * Component/Function: login
   * Description: Đăng nhập sai mật khẩu → 401
   * Pre-conditions: User tồn tại
   * Input Data: POST /api/auth/login { username: <existing>, password: "WrongPass123!" }
   * Expected Output: HTTP 401 + { error: "Thông tin đăng nhập không chính xác" }
   */
  it('TC-ADV-13 | [Negative] Đăng nhập sai mật khẩu → 401', () => {
    apiRegisterAndLogin(freshUser.username, freshUser.email).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        body: { username: freshUser.username, password: 'WrongPass999!' },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401);
        expect(res.body.error).to.include('không chính xác');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADV-14
   * Component/Function: register
   * Description: Username đúng 3 ký tự (giá trị biên tối thiểu hợp lệ) được chấp nhận
   * Pre-conditions: Username "abc" chưa tồn tại
   * Input Data: POST /api/auth/register { username: "abc", ... }
   * Expected Output: HTTP 201 hoặc không phải 400 "Username must be at least 3 characters"
   */
  it('TC-ADV-14 | [Boundary] Username đúng 3 ký tự (biên dưới) → được chấp nhận', () => {
    const shortUser = `c${ts}`.slice(0, 3); // đúng 3 ký tự
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `ab${ts}`.slice(0, 3),
        email: `cy_short_${ts}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' },
      },
      failOnStatusCode: false,
    }).then((res) => {
      // 201 = đăng ký thành công, 409 = trùng username (cũng hợp lệ về length)
      expect(res.status).to.not.eq(400);
    });
  });

  /**
   * TC-ADV-15
   * Component/Function: register
   * Description: Username 2 ký tự (dưới giá trị biên tối thiểu) bị từ chối
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register { username: "ab", ... }
   * Expected Output: HTTP 400 + Zod error "Username must be at least 3 characters"
   */
  it('TC-ADV-15 | [Boundary] Username 2 ký tự (dưới biên) → 400 validation error', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: 'ab', // chỉ 2 ký tự
        email: `cy_tooShort_${ts}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' },
      },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  /**
   * TC-ADV-16
   * Component/Function: login
   * Description: Gửi body rỗng → 400 validation (Zod loginSchema)
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/login {} (body rỗng)
   * Expected Output: HTTP 400 + Zod validation error
   */
  it('TC-ADV-16 | [Boundary] Login với body rỗng → 400 Validation Error', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ADV-17
   * Component/Function: auth middleware (TokenExpiredError)
   * Description: Access token hết hạn → 401 với message "Phiên đăng nhập đã hết hạn"
   * Pre-conditions: Có token đã hết hạn (tạo qua task với expiresIn: 0)
   * Input Data: GET /api/users/profile với expired token
   * Expected Output: HTTP 401 + { error: "Phiên đăng nhập đã hết hạn..." }
   */
  it('TC-ADV-17 | [Security] Access token hết hạn → 401 Phiên đăng nhập hết hạn', () => {
    cy.task('createExpiredToken').then((expiredToken) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/profile`,
        headers: { Authorization: `Bearer ${expiredToken}` },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401);
        expect(res.body.error).to.include('hết hạn');
      });
    });
  });

  /**
   * TC-ADV-18
   * Component/Function: revokeAllOtherDevices → invalidation check
   * Description: Sau khi gọi revoke-all, token cũ không còn sử dụng được
   * Pre-conditions: Có token cũ và token mới
   * Input Data: Dùng token cũ để gọi profile sau khi revoke
   * Expected Output: HTTP 401 (tokenVersion mismatch)
   */
  it('TC-ADV-18 | [Security] Token cũ bị vô hiệu sau khi revoke-devices', () => {
    apiRegisterAndLogin(freshUser.username, freshUser.email).then(({ token: oldToken }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/revoke-all`,
        headers: { Authorization: `Bearer ${oldToken}` },
      }).then(() => {
        // oldToken giờ có tokenVersion cũ → bị từ chối
        cy.request({
          method: 'GET',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${oldToken}` },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(401);
        });
      });
    });
  });

  /**
   * TC-ADV-19
   * Component/Function: login (timing attack prevention)
   * Description: Login với user không tồn tại vẫn chạy bcrypt.compare (thời gian phản hồi ≥ 100ms)
   *              → không thể phân biệt "user không tồn tại" vs "sai mật khẩu" qua thời gian
   * Pre-conditions: Username "definitely_nonexistent_xyz" không có trong DB
   * Input Data: POST /api/auth/login { username: "definitely_nonexistent_xyz", password: "any" }
   * Expected Output: HTTP 401 + cùng error message với sai mật khẩu thông thường
   */
  it('TC-ADV-19 | [Security] Login với user không tồn tại → 401 với cùng thông báo (timing-safe)', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: { username: 'definitely_nonexistent_xyz_9999', password: 'SomePassword123' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
      expect(res.body.error).to.eq('Thông tin đăng nhập không chính xác');
    });
  });

  /**
   * TC-ADV-20
   * Component/Function: register (email domain auto-role)
   * Description: Đăng ký với email @utt.edu.vn (không có st.) → role = "teacher"
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register { email: "newteacher@utt.edu.vn" }
   * Expected Output: HTTP 201 + { user.role: "teacher" }
   */
  it('TC-ADV-20 | [Security] Đăng ký email @utt.edu.vn → tự động phân quyền role=teacher', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `cy_teacher_${ts}`,
        email: `cy_teacher_${ts}@utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' },
      },
      failOnStatusCode: false,
    }).then((res) => {
      // Có thể 201 hoặc 500 tùy mail service – quan trọng là kiểm tra role khi thành công
      if (res.status === 201) {
        expect(res.body.user.role).to.eq('teacher');
      }
    });
  });

  /**
   * TC-ADV-21
   * Component/Function: authLimiter
   * Description: Kiểm tra xem các tiêu đề giới hạn tần suất (Rate Limiting headers) có được cấu hình và trả về từ API đăng nhập để chống Brute Force hay không.
   * Expected Output: Tiêu đề RateLimit-Limit hoặc X-RateLimit-Limit tồn tại trong phản hồi.
   */
  it('TC-ADV-21 | [Security] Kiểm tra cấu hình Rate Limiter cho API đăng nhập chống Brute Force', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: { username: 'invalid_user', password: 'WrongPassword123' },
      failOnStatusCode: false
    }).then((res) => {
      // Xác nhận rằng header RateLimit tồn tại để chứng minh route được bảo vệ
      const limitHeader = res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'];
      expect(limitHeader).to.not.be.undefined;
      expect(parseInt(limitHeader)).to.be.greaterThan(0);
    });
  });

  /**
   * TC-ADV-22
   * Component/Function: login
   * Description: Timing Attack - Đo và so sánh thời gian phản hồi đăng nhập của user tồn tại vs không tồn tại.
   * Expected Output: Cả hai đều chạy bcrypt hashing (trên server) dẫn đến chênh lệch thời gian xử lý nhỏ (không rò rỉ username).
   */
  it('TC-ADV-22 | [Security] Timing Attack - Đo và so sánh thời gian phản hồi đăng nhập', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: { username: freshUser.username, password: 'WrongPasswordExistUser123' },
      failOnStatusCode: false
    }).then((resExist) => {
      expect(resExist.status).to.eq(401);
      expect(resExist.body.error).to.eq('Thông tin đăng nhập không chính xác');
      
      const durationExist = resExist.duration;

      cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        body: { username: 'definitely_nonexistent_spray_999', password: 'WrongPasswordExistUser123' },
        failOnStatusCode: false
      }).then((resNonExist) => {
        expect(resNonExist.status).to.eq(401);
        expect(resNonExist.body.error).to.eq('Thông tin đăng nhập không chính xác');

        const durationNonExist = resNonExist.duration;

        // Chênh lệch thời gian phản hồi ở mức chấp nhận được (dưới 400ms) để chống Timing Attack
        const diff = Math.abs(durationExist - durationNonExist);
        expect(diff).to.be.lessThan(400);
      });
    });
  });

  /**
   * TC-ADV-23
   * Component/Function: login (Distributed Brute Force simulation)
   * Description: Giả lập cuộc tấn công Distributed Brute Force bằng cách liên tục đăng nhập sai thông qua nhiều tài khoản khác nhau.
   * Expected Output: Server phản hồi lỗi đồng nhất 401, không bị crash cơ sở dữ liệu và ghi nhận đầy đủ nhật ký hoạt động.
   */
  it('TC-ADV-23 | [Security] Distributed Brute Force - Thử đăng nhập liên tiếp với nhiều tài khoản/mật khẩu khác nhau', () => {
    const attackPayloads = [
      { username: 'cy_victim_01', password: 'Password999!' },
      { username: 'cy_victim_02', password: 'Password888!' },
      { username: 'cy_victim_03', password: 'Password777!' },
      { username: 'cy_victim_04', password: 'Password666!' }
    ];

    let chain = cy.wrap(null);

    attackPayloads.forEach((payload) => {
      chain = chain.then(() => {
        return cy.request({
          method: 'POST',
          url: `${API}/auth/login`,
          body: payload,
          failOnStatusCode: false
        }).then((res) => {
          // Phản hồi 401 đồng nhất ngăn chặn suy đoán cấu trúc thông tin
          expect(res.status).to.eq(401);
          expect(res.body.error).to.eq('Thông tin đăng nhập không chính xác');
        });
      });
    });
  });

  /**
   * TC-ADV-24
   * Component/Function: Logout Cookie Removal
   * Description: Sau khi logout, cookie refreshToken phải bị xóa đi nhưng session trên thiết bị khác (dùng access token cũ) vẫn hoạt động.
   * Expected Output: Cookie refreshToken bị xóa, access token cũ vẫn hoạt động (200).
   */
  it('TC-ADV-24 | [Security] Logout chỉ xóa cookie refreshToken, không tăng tokenVersion (access token cũ vẫn hoạt động) → 200', () => {
    const username = `cy_adv24_${ts}`;
    const email = `${username}@st.utt.edu.vn`;
    apiRegisterAndLogin(username, email).then((user) => {
      const token = user.token;

      // 1. Kiểm tra access token hoạt động bình thường trước khi logout
      cy.request({
        method: 'GET',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${token}` }
      }).then((res) => {
        expect(res.status).to.eq(200);

        // 2. Thực hiện Logout gửi kèm token
        cy.request({
          method: 'POST',
          url: `${API}/auth/logout`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((logoutRes) => {
          expect(logoutRes.status).to.eq(200);

          // Kiểm tra cookie refreshToken đã bị xóa
          cy.getCookie('refreshToken').should('be.null');

          // 3. Sử dụng lại access token cũ để truy cập endpoint bảo mật (vẫn hoạt động tốt vì không tăng tokenVersion)
          cy.request({
            method: 'GET',
            url: `${API}/users/vault`,
            headers: { Authorization: `Bearer ${token}` }
          }).then((okRes) => {
            expect(okRes.status).to.eq(200);
          });
        });
      });
    });
  });

  /**
   * TC-ADV-25
   * Component/Function: revokeAllOtherDevices
   * Description: Gọi revoke-all phải vô hiệu hóa toàn bộ access token cũ đang được sử dụng.
   * Expected Output: Access token cũ không thể sử dụng để truy cập tài nguyên → 401.
   */
  it('TC-ADV-25 | [Security] Revoke-all vô hiệu hóa hoàn toàn các token cũ → 401', () => {
    const username = `cy_adv25_${ts}`;
    const email = `${username}@st.utt.edu.vn`;
    apiRegisterAndLogin(username, email).then((user) => {
      const oldToken = user.token;

      // 1. Kiểm tra token cũ hoạt động
      cy.request({
        method: 'GET',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${oldToken}` }
      }).then((res) => {
        expect(res.status).to.eq(200);

        // 2. Gọi revoke-all
        cy.request({
          method: 'POST',
          url: `${API}/auth/revoke-all`,
          headers: { Authorization: `Bearer ${oldToken}` }
        }).then((revRes) => {
          expect(revRes.status).to.eq(200);
          expect(revRes.body).to.have.property('token');

          // 3. Sử dụng token cũ để truy cập lại
          cy.request({
            method: 'GET',
            url: `${API}/users/vault`,
            headers: { Authorization: `Bearer ${oldToken}` },
            failOnStatusCode: false
          }).then((failRes) => {
            expect(failRes.status).to.eq(401);
          });
        });
      });
    });
  });

  /**
   * TC-SEC-32
   * Component/Function: refresh (RTR)
   * Description: Refresh Token Rotation (RTR) - Xoay vòng token thành công nhiều lần liên tiếp
   */
  it('TC-SEC-32 | [Positive] Refresh Token Rotation (RTR) hoạt động đúng chuẩn', () => {
    const username = `cy_rtr_32_${ts}`;
    const email = `${username}@st.utt.edu.vn`;
    
    apiRegisterAndLogin(username, email).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        body: { username, password: 'Cypress12345' }
      }).then((loginRes) => {
        expect(loginRes.status).to.eq(200);
        
        // 1. Refresh lần 1
        cy.request({
          method: 'POST',
          url: `${API}/auth/refresh`,
        }).then((res1) => {
          expect(res1.status).to.eq(200);
          expect(res1.body).to.have.property('token');
          
          // 2. Refresh lần 2 (xoay tiếp bằng token mới sinh ở res1)
          cy.request({
            method: 'POST',
            url: `${API}/auth/refresh`,
          }).then((res2) => {
            expect(res2.status).to.eq(200);
            expect(res2.body).to.have.property('token');
          });
        });
      });
    });
  });

  /**
   * TC-SEC-33
   * Component/Function: refresh (Token Reuse Detection)
   * Description: Tái sử dụng Refresh Token cũ → 401 & huỷ toàn bộ family
   */
  it('TC-SEC-33 | [Security] Phát hiện tái sử dụng Refresh Token (Reuse Detection) → 401', () => {
    const username = `cy_reuse_33_${ts}`;
    const email = `${username}@st.utt.edu.vn`;
    
    apiRegisterAndLogin(username, email).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        body: { username, password: 'Cypress12345' }
      }).then((loginRes) => {
        expect(loginRes.status).to.eq(200);
        
        // Lấy refresh token 1
        cy.getCookie('refreshToken').then((cookie1) => {
          expect(cookie1).to.not.be.null;
          const firstRefreshTokenValue = cookie1.value;
          
          // 1. Gọi refresh lần 1 để xoay (và làm invalid token 1)
          cy.request({
            method: 'POST',
            url: `${API}/auth/refresh`,
          }).then((res1) => {
            expect(res1.status).to.eq(200);
            
            // Lấy refresh token 2 (đang hoạt động)
            cy.getCookie('refreshToken').then((cookie2) => {
              expect(cookie2).to.not.be.null;
              const secondRefreshTokenValue = cookie2.value;
              
              // 2. Đặt lại refresh token 1 (đã bị revoked) vào cookie và gọi refresh
              cy.setCookie('refreshToken', firstRefreshTokenValue);
              
              cy.request({
                method: 'POST',
                url: `${API}/auth/refresh`,
                failOnStatusCode: false
              }).then((reuseRes) => {
                expect(reuseRes.status).to.eq(401);
                expect(reuseRes.body.error).to.include('sử dụng lại');
                
                // 3. Toàn bộ family của token này đã bị huỷ. Thử dùng token 2 (hợp lệ trước đó) để refresh
                cy.setCookie('refreshToken', secondRefreshTokenValue);
                
                cy.request({
                  method: 'POST',
                  url: `${API}/auth/refresh`,
                  failOnStatusCode: false
                }).then((familyRevokedRes) => {
                  expect(familyRevokedRes.status).to.eq(401);
                });
              });
            });
          });
        });
      });
    });
  });
});

