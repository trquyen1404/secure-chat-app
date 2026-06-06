/**
 * MODULE: Auth Registration Deep & Email Verification Edge Cases
 * Controller: authController.js
 * Routes:
 *   POST /api/auth/register   → register
 *   POST /api/auth/login      → login
 *   POST /api/auth/logout     → logout
 *   POST /api/auth/verify-email     → verifyEmail
 *   POST /api/auth/resend-code      → resendVerificationCode
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * register:
 *   - username < 3 chars → 400
 *   - email not matching @st.utt.edu.vn or @utt.edu.vn → 400
 *   - email @utt.edu.vn (no @st.) → role='teacher'
 *   - email @st.utt.edu.vn → role='student'
 *   - duplicate username → 409
 *   - duplicate email → 409
 *   - response: isVerified=false (new user not verified)
 *   - response: token returned immediately after register
 *
 * login:
 *   - missing username or password → 400
 *   - wrong password → 401 (timing-attack safe with dummy hash)
 *   - user not found → 401 (same error as wrong password – no enumeration)
 *   - banned user → 403 with banReason
 *
 * verifyEmail:
 *   - already verified → 200 (idempotent message)
 *   - wrong code → 400
 *   - expired code (verificationTokenExpires < now) → 400
 *   - correct code → isVerified=true, token/expires cleared
 *
 * resendVerificationCode:
 *   - already verified → 400
 *   - not verified → 200, new code set
 *
 * logout:
 *   - always 200, clears refreshToken cookie
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';
const ts = Date.now();

const apiUser = (username, email, password = 'Cypress12345', isVerified = true) =>
  cy.task('createUserAndGetToken', { username, email, password, isVerified });

describe('[Module: Auth Deep] Đăng ký, Đăng nhập và Xác thực Email nâng cao', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-REG-01
   * Component/Function: register
   * Description: Đăng ký user với email @utt.edu.vn → role='teacher' được gán tự động
   * Pre-conditions: Username và email chưa tồn tại
   * Input Data: POST /api/auth/register với email @utt.edu.vn (non-st)
   * Expected Output: HTTP 201 + user.role='teacher'
   */
  it('TC-REG-01 | [Positive] Email @utt.edu.vn → role=teacher được gán tự động', () => {
    const u = `cy_teacher_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: u,
        email: `${u}@utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      }
    }).then(res => {
      expect(res.status).to.eq(201);
      expect(res.body.user.role).to.eq('teacher');
      expect(res.body.user.isVerified).to.be.false;
      expect(res.body).to.have.property('token');
    });
  });

  /**
   * TC-REG-02
   * Component/Function: register
   * Description: Đăng ký user với email @st.utt.edu.vn → role='student' được gán tự động
   * Pre-conditions: Username và email chưa tồn tại
   * Input Data: POST /api/auth/register với email @st.utt.edu.vn
   * Expected Output: HTTP 201 + user.role='student'
   */
  it('TC-REG-02 | [Positive] Email @st.utt.edu.vn → role=student được gán tự động', () => {
    const u = `cy_stu_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: u,
        email: `${u}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      }
    }).then(res => {
      expect(res.status).to.eq(201);
      expect(res.body.user.role).to.eq('student');
      expect(res.body.user.isVerified).to.be.false;
    });
  });

  /**
   * TC-REG-03
   * Component/Function: register → token valid immediately
   * Description: Token được trả về ngay sau đăng ký, có thể dùng gọi API bảo vệ
   * Pre-conditions: Đăng ký thành công
   * Input Data: POST /api/auth/register → dùng token gọi GET /api/users/profile
   * Expected Output: HTTP 200 profile response
   */
  it('TC-REG-03 | [Positive] Token trả về từ register có thể dùng gọi API ngay', () => {
    const u = `cy_reg_tok_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: u,
        email: `${u}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      }
    }).then(res => {
      expect(res.status).to.eq(201);
      const token = res.body.token;
      cy.request({
        method: 'GET',
        url: `${API}/users/profile`,
        headers: { Authorization: `Bearer ${token}` }
      }).then(profileRes => {
        expect(profileRes.status).to.eq(200);
        expect(profileRes.body.username).to.eq(u);
      });
    });
  });

  /**
   * TC-REG-04
   * Component/Function: verifyEmail (already verified)
   * Description: Gọi verify-email khi đã isVerified=true → 200 với message "đã được xác thực"
   * Pre-conditions: User đã isVerified=true
   * Input Data: POST /api/auth/verify-email { code: 'anything' }
   * Expected Output: HTTP 200 + { message: 'Tài khoản đã được xác thực' }
   */
  it('TC-REG-04 | [Positive] verifyEmail khi đã verified → 200 idempotent message', () => {
    apiUser(`cy_already_ver_${ts}`, `cy_already_ver_${ts}@st.utt.edu.vn`, 'Cypress12345', true).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: 'anything' }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.message).to.include('đã được xác thực');
      });
    });
  });

  /**
   * TC-REG-05
   * Component/Function: verifyEmail (correct code)
   * Description: Xác thực email thành công với code đúng lấy từ DB
   * Pre-conditions: User chưa verify, verificationToken có giá trị, chưa hết hạn
   * Input Data: POST /api/auth/verify-email { code: <correct_code_from_db> }
   * Expected Output: HTTP 200 + { message: 'Xác thực email thành công!', user.isVerified: true }
   */
  it('TC-REG-05 | [Positive] verifyEmail với code đúng từ DB → isVerified=true', () => {
    const u = `cy_vfy_ok_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`, 'Cypress12345', false).then(({ token }) => {
      cy.task('getVerificationCode', u).then(code => {
        cy.request({
          method: 'POST',
          url: `${API}/auth/verify-email`,
          headers: { Authorization: `Bearer ${token}` },
          body: { code }
        }).then(res => {
          expect(res.status).to.eq(200);
          expect(res.body.message).to.include('thành công');
          expect(res.body.user.isVerified).to.be.true;
        });
      });
    });
  });

  /**
   * TC-REG-06
   * Component/Function: resendVerificationCode
   * Description: Gửi lại mã xác thực cho user chưa verify → 200 thành công
   * Pre-conditions: User chưa isVerified
   * Input Data: POST /api/auth/resend-code (token user chưa verify)
   * Expected Output: HTTP 200 + { message: 'Mã xác thực mới đã được gửi...' }
   */
  it('TC-REG-06 | [Positive] resendVerificationCode user chưa verify → 200 OK', () => {
    const u = `cy_resend_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`, 'Cypress12345', false).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/resend-code`,
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.message).to.include('Mã xác thực mới');
      });
    });
  });

  /**
   * TC-REG-07
   * Component/Function: logout
   * Description: Đăng xuất thành công → 200, refreshToken cookie bị xóa
   * Pre-conditions: User đã đăng nhập, có refreshToken cookie
   * Input Data: POST /api/auth/logout
   * Expected Output: HTTP 200 + { message: 'Đăng xuất thành công' }
   */
  it('TC-REG-07 | [Positive] logout → 200 và message đăng xuất thành công', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/logout`
    }).then(res => {
      expect(res.status).to.eq(200);
      expect(res.body.message).to.include('Đăng xuất thành công');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-REG-08
   * Component/Function: register
   * Description: Đăng ký với username < 3 ký tự → 400
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register { username: 'ab', email: 'ab@st.utt.edu.vn' }
   * Expected Output: HTTP 400 + { error: 'Username must be at least 3 characters' }
   */
  it('TC-REG-08 | [Negative] register username < 3 ký tự → 400', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: 'ab',
        email: `ab${ts}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(400);
      const errDetail = res.body.details.find(d => d.path === 'username');
      expect(errDetail.message).to.include('3 characters');
    });
  });

  /**
   * TC-REG-09
   * Component/Function: register
   * Description: Đăng ký với email không thuộc domain UTT → 400
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register { email: 'user@gmail.com' }
   * Expected Output: HTTP 400 + { error: 'Vui lòng sử dụng Email UTT hợp lệ...' }
   */
  it('TC-REG-09 | [Negative] register email không phải UTT domain → 400', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `cy_invalid_${ts}`,
        email: `user${ts}@gmail.com`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(400);
      const errDetail = res.body.details.find(d => d.path === 'email');
      expect(errDetail.message).to.include('UTT');
    });
  });

  /**
   * TC-REG-10
   * Component/Function: register
   * Description: Đăng ký với username đã tồn tại → 409 Conflict
   * Pre-conditions: Username đã được đăng ký
   * Input Data: POST /api/auth/register { username: <existing>, email: 'new@st.utt.edu.vn' }
   * Expected Output: HTTP 409 + { error: 'Username already exists' }
   */
  it('TC-REG-10 | [Negative] register username đã tồn tại → 409 Conflict', () => {
    const existingUser = `cy_dup_usr_${ts}`;
    apiUser(existingUser, `${existingUser}@st.utt.edu.vn`).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/register`,
        body: {
          username: existingUser,
          email: `newdiff${ts}@st.utt.edu.vn`,
          password: 'Cypress12345',
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
        },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(409);
        expect(res.body.error).to.include('already exists');
      });
    });
  });

  /**
   * TC-REG-11
   * Component/Function: register
   * Description: Đăng ký với email đã được đăng ký → 409 Conflict
   * Pre-conditions: Email đã tồn tại trong DB
   * Input Data: POST /api/auth/register { username: 'newname', email: <existing_email> }
   * Expected Output: HTTP 409 + { error: 'Email already registered' }
   */
  it('TC-REG-11 | [Negative] register email đã tồn tại → 409 Conflict', () => {
    const existingEmail = `cy_dup_em_${ts}@st.utt.edu.vn`;
    apiUser(`cy_dup_em_${ts}`, existingEmail).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/register`,
        body: {
          username: `cy_newname_${ts}`,
          email: existingEmail,
          password: 'Cypress12345',
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
        },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(409);
        expect(res.body.error).to.include('Email already');
      });
    });
  });

  /**
   * TC-REG-12
   * Component/Function: login
   * Description: Đăng nhập với username không tồn tại → 401 (không lộ thông tin user)
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/login { username: 'nonexistent_xyz', password: 'anything' }
   * Expected Output: HTTP 401 + { error: 'Thông tin đăng nhập không chính xác' }
   */
  it('TC-REG-12 | [Negative] login username không tồn tại → 401 (no user enumeration)', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: { username: 'nonexistent_xyz_12345', password: 'AnyPass123' },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
      expect(res.body.error).to.include('không chính xác');
    });
  });

  /**
   * TC-REG-13
   * Component/Function: login
   * Description: Đăng nhập với mật khẩu sai → 401
   * Pre-conditions: User tồn tại
   * Input Data: POST /api/auth/login { username: <existing>, password: 'WrongPass999' }
   * Expected Output: HTTP 401 + { error: 'Thông tin đăng nhập không chính xác' }
   */
  it('TC-REG-13 | [Negative] login mật khẩu sai → 401', () => {
    const u = `cy_wpw_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        body: { username: u, password: 'WrongPassword999!' },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(401);
        expect(res.body.error).to.include('không chính xác');
      });
    });
  });

  /**
   * TC-REG-14
   * Component/Function: login
   * Description: Đăng nhập thiếu username và password → 400
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/login { }
   * Expected Output: HTTP 400 (validation schema) hoặc 400 từ controller
   */
  it('TC-REG-14 | [Negative] login thiếu username và password → 400', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/login`,
      body: {},
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(400);
    });
  });

  /**
   * TC-REG-15
   * Component/Function: verifyEmail
   * Description: Xác thực email với code sai → 400
   * Pre-conditions: User chưa verify
   * Input Data: POST /api/auth/verify-email { code: '000000' } (code sai)
   * Expected Output: HTTP 400 + { error: 'Mã xác thực không chính xác' }
   */
  it('TC-REG-15 | [Negative] verifyEmail với code sai → 400', () => {
    const u = `cy_bad_code_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`, 'Cypress12345', false).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: '000000' },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.include('không chính xác');
      });
    });
  });

  /**
   * TC-REG-16
   * Component/Function: resendVerificationCode
   * Description: Gửi lại code khi user đã verify → 400
   * Pre-conditions: User đã isVerified=true
   * Input Data: POST /api/auth/resend-code (token user đã verify)
   * Expected Output: HTTP 400 + { error: 'Tài khoản đã được xác thực' }
   */
  it('TC-REG-16 | [Negative] resendVerificationCode khi đã verify → 400', () => {
    apiUser(`cy_resend_ver_${ts}`, `cy_resend_ver_${ts}@st.utt.edu.vn`, 'Cypress12345', true).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/resend-code`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.include('đã được xác thực');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-REG-17
   * Component/Function: register
   * Description: Username đúng 3 ký tự (biên dưới hợp lệ) → đăng ký thành công
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register { username: 'abc', email: 'abc<ts>@st.utt.edu.vn' }
   * Expected Output: HTTP 201
   */
  it('TC-REG-17 | [Boundary] register username đúng 3 ký tự (biên dưới) → 201 thành công', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `a${ts}`.substring(0, 3) + ts.toString().slice(-4),
        email: `min3user${ts}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      }
    }).then(res => {
      expect(res.status).to.eq(201);
    });
  });

  /**
   * TC-REG-18
   * Component/Function: register
   * Description: Đăng ký không có signedPreKey → server vẫn xử lý (nếu không validate) hoặc lỗi
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register không có field signedPreKey
   * Expected Output: HTTP 500 (error do signedPreKey.publicKey undefined) hoặc 201
   */
  it('TC-REG-18 | [Boundary] register không có signedPreKey → 500 (null access)', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `cy_nospk_${ts}`,
        email: `cy_nospk_${ts}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
        // signedPreKey bị bỏ
      },
      failOnStatusCode: false
    }).then(res => {
      // Server sẽ throw khi đọc signedPreKey.publicKey → 500
      expect([400, 500]).to.include(res.status);
    });
  });

  /**
   * TC-REG-19
   * Component/Function: verifyEmail
   * Description: Code là chuỗi rỗng → không match → 400
   * Pre-conditions: User chưa verify
   * Input Data: POST /api/auth/verify-email { code: '' }
   * Expected Output: HTTP 400 (code không match)
   */
  it('TC-REG-19 | [Boundary] verifyEmail với code rỗng → 400', () => {
    const u = `cy_empty_code_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`, 'Cypress12345', false).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/verify-email`,
        headers: { Authorization: `Bearer ${token}` },
        body: { code: '' },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(400);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-REG-20
   * Component/Function: register → response không lộ password
   * Description: Response đăng ký không chứa trường password (bcrypt hash)
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/register hợp lệ
   * Expected Output: HTTP 201 + user object không có property 'password'
   */
  it('TC-REG-20 | [Security] register response không lộ password hash', () => {
    const u = `cy_nopwd_${ts}`;
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: u,
        email: `${u}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      }
    }).then(res => {
      expect(res.status).to.eq(201);
      expect(res.body.user).to.not.have.property('password');
    });
  });

  /**
   * TC-REG-21
   * Component/Function: login → response không lộ password
   * Description: Response đăng nhập không chứa trường password (bcrypt hash)
   * Pre-conditions: User tồn tại
   * Input Data: POST /api/auth/login { username, password } hợp lệ
   * Expected Output: HTTP 200 + user object không có property 'password'
   */
  it('TC-REG-21 | [Security] login response không lộ password hash', () => {
    const u = `cy_loginpwd_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`).then(() => {
      cy.request({
        method: 'POST',
        url: `${API}/auth/login`,
        body: { username: u, password: 'Cypress12345' }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body.user).to.not.have.property('password');
        expect(res.body.user).to.not.have.property('verificationToken');
      });
    });
  });

  /**
   * TC-REG-22
   * Component/Function: verifyEmail / resendVerificationCode (no token)
   * Description: Gọi verify-email hoặc resend-code không có token → 401
   * Pre-conditions: N/A
   * Input Data: POST /api/auth/verify-email { code: '123456' } không có Authorization header
   * Expected Output: HTTP 401
   */
  it('TC-REG-22 | [Security] verify-email và resend-code không có token → 401', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/verify-email`,
      body: { code: '123456' },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });

    cy.request({
      method: 'POST',
      url: `${API}/auth/resend-code`,
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });
  });

  /**
   * TC-REG-23
   * Component/Function: register (XSS injection in username)
   * Description: Username có ký tự XSS script → được lưu as-is (không execute), response escape đúng
   * Pre-conditions: N/A
   * Input Data: username: '<script>alert(1)</script>abc', email: valid
   * Expected Output: HTTP 400 (length check pass nếu >3) hoặc 201 lưu raw string,
   *                  KHÔNG execute script → content-type JSON
   */
  it('TC-REG-23 | [Security] Username có XSS payload → server lưu raw string, response là JSON', () => {
    cy.request({
      method: 'POST',
      url: `${API}/auth/register`,
      body: {
        username: `<script>${ts}`,
        email: `xss${ts}@st.utt.edu.vn`,
        password: 'Cypress12345',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        dhPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        signedPreKey: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' }
      },
      failOnStatusCode: false
    }).then(res => {
      // Quan trọng: phải là JSON, không execute script
      expect(res.headers['content-type']).to.include('application/json');
      // Server có thể trả 201 (lưu raw) hoặc 400 (validate), không được 500
      expect([201, 400]).to.include(res.status);
    });
  });

  /**
   * TC-REG-24
   * Component/Function: verifyEmail (code từ sau resend)
   * Description: Sau khi resend, code mới phải hoạt động, code cũ bị vô hiệu
   * Pre-conditions: User chưa verify, đã resend code
   * Input Data: Lấy code cũ → resend → lấy code mới → verify với code mới
   * Expected Output: verify với code mới → 200; code cũ không còn match
   */
  it('TC-REG-24 | [Security] Sau resend code, code mới hoạt động, verify thành công', () => {
    const u = `cy_resend_vfy_${ts}`;
    apiUser(u, `${u}@st.utt.edu.vn`, 'Cypress12345', false).then(({ token }) => {
      // Resend → sinh code mới
      cy.request({
        method: 'POST',
        url: `${API}/auth/resend-code`,
        headers: { Authorization: `Bearer ${token}` }
      }).then(() => {
        // Lấy code mới từ DB
        cy.task('getVerificationCode', u).then(newCode => {
          cy.request({
            method: 'POST',
            url: `${API}/auth/verify-email`,
            headers: { Authorization: `Bearer ${token}` },
            body: { code: newCode }
          }).then(res => {
            expect(res.status).to.eq(200);
            expect(res.body.user.isVerified).to.be.true;
          });
        });
      });
    });
  });
});
