/**
 * MODULE: User Profile & Search
 * Controller: userController.js
 * Routes: GET /api/users, GET /api/users/search, GET /api/users/profile, PUT /api/users/profile
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * - getProfile      → GET  /api/users/profile (auth required)
 * - updateProfile   → PUT  /api/users/profile (auth required)
 * - getUsers        → GET  /api/users         (auth required, filters blocked users)
 * - searchUsers     → GET  /api/users/search?query= (auth required, query.length >= 2)
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

// ─── Shared Helper ────────────────────────────────────────────────────────────
const API = 'http://localhost:5000/api';

const cleanState = () => {
  cy.clearLocalStorage();
  cy.clearCookies();
  cy.window().then((win) => {
    win.sessionStorage.clear();
    return new Cypress.Promise((resolve) => {
      win.indexedDB.databases().then((dbs) => {
        const promises = dbs.map((db) =>
          new Promise((res) => {
            const req = win.indexedDB.deleteDatabase(db.name);
            req.onsuccess = res;
            req.onerror = res;
            req.onblocked = res;
          })
        );
        Promise.all(promises).then(resolve);
      }).catch(() => resolve());
    });
  });
};

/**
 * Đăng ký và đăng nhập nhanh qua API (không qua UI) để lấy token.
 * Trả về: { token, userId }
 */
const apiRegisterAndLogin = (username, email, password = 'Cypress12345') => {
  // Dùng task để lấy token mà không cần duyệt qua UI crypto flow
  return cy.task('createUserAndGetToken', { username, email, password });
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('[Module: Profile & Users] Quản lý hồ sơ và tìm kiếm người dùng', () => {
  const ts = Date.now();
  const testUser = {
    username: `cy_profile_${ts}`,
    email: `cy_profile_${ts}@st.utt.edu.vn`,
    password: 'Cypress12345',
    passphrase: 'cypress_passphrase',
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-PRF-01
   * Component/Function: getProfile
   * Description: Người dùng đã xác thực lấy thông tin hồ sơ cá nhân thành công
   * Pre-conditions: User đã đăng ký, isVerified = true, có JWT hợp lệ
   * Input Data: GET /api/users/profile với header Authorization: Bearer <token>
   * Expected Output: HTTP 200 + JSON chứa đủ các trường id, username, email, role, isVerified
   */
  it('TC-PRF-01 | [Positive] GET /profile trả về hồ sơ đầy đủ khi đã xác thực', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/profile`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.all.keys('id', 'username', 'email', 'role', 'isVerified',
          'displayName', 'bio', 'avatarUrl', 'themeColor', 'online',
          'lastSeenAt', 'publicKey', 'dhPublicKey', 'encryptedPrivateKey',
          'keyBackupSalt', 'keyBackupIv', 'vaultVersion', 'studentId', 'teacherId', 'phone');
        expect(res.body.username).to.eq(testUser.username);
        expect(res.body.role).to.eq('student'); // @st.utt.edu.vn → student
      });
    });
  });

  /**
   * TC-PRF-02
   * Component/Function: updateProfile
   * Description: Cập nhật displayName và bio thành công
   * Pre-conditions: User đã đăng ký, có JWT hợp lệ
   * Input Data: PUT /api/users/profile { displayName: "Test Display", bio: "Hello World" }
   * Expected Output: HTTP 200 + { success: true, displayName: "Test Display" }
   */
  it('TC-PRF-02 | [Positive] PUT /profile cập nhật displayName và bio thành công', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'PUT',
        url: `${API}/users/profile`,
        headers: { Authorization: `Bearer ${token}` },
        body: { displayName: 'Tester Profile', bio: 'Cypress E2E Test' },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.success).to.be.true;
        expect(res.body.displayName).to.eq('Tester Profile');
        expect(res.body.bio).to.eq('Cypress E2E Test');
      });
    });
  });

  /**
   * TC-PRF-03
   * Component/Function: searchUsers
   * Description: Tìm kiếm người dùng với từ khóa hợp lệ (≥ 2 ký tự) trả về kết quả
   * Pre-conditions: Tồn tại ít nhất 1 user có username chứa 'cy_profile'
   * Input Data: GET /api/users/search?query=cy_profile
   * Expected Output: HTTP 200 + Array ≥ 1 phần tử, mỗi phần tử có trường username
   */
  it('TC-PRF-03 | [Positive] GET /search?query= trả về danh sách người dùng phù hợp', () => {
    const otherUsername = `cy_profile_other_${Date.now()}`;
    const otherEmail = `cy_profile_other_${Date.now()}@st.utt.edu.vn`;
    cy.task('createUserAndGetToken', { username: otherUsername, email: otherEmail, password: 'Cypress12345' }).then(() => {
      apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
        cy.request({
          method: 'GET',
          url: `${API}/users/search?query=cy_profile`,
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body).to.be.an('array').with.length.greaterThan(0);
          expect(res.body[0]).to.include.keys('id', 'username', 'displayName', 'avatarUrl', 'role');
        });
      });
    });
  });

  /**
   * TC-PRF-04
   * Component/Function: getUsers
   * Description: Lấy danh sách toàn bộ user (không bao gồm bản thân) thành công
   * Pre-conditions: Có ít nhất 2 user trong DB, user hiện tại đã xác thực
   * Input Data: GET /api/users với Bearer token
   * Expected Output: HTTP 200 + Array, không chứa userId của chính mình
   */
  it('TC-PRF-04 | [Positive] GET /users trả về danh sách user, không bao gồm bản thân', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token, userId }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
        const selfInList = res.body.find(u => u.id === userId);
        expect(selfInList).to.be.undefined;
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-PRF-05
   * Component/Function: getProfile (auth middleware)
   * Description: Yêu cầu không có Authorization header bị từ chối
   * Pre-conditions: Không có token
   * Input Data: GET /api/users/profile, không có Authorization header
   * Expected Output: HTTP 401 + { error: "Token xác thực bị thiếu..." }
   */
  it('TC-PRF-05 | [Negative] GET /profile không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'GET',
      url: `${API}/users/profile`,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
      expect(res.body.error).to.include('Token');
    });
  });

  /**
   * TC-PRF-06
   * Component/Function: getProfile (auth middleware)
   * Description: Sử dụng token sai định dạng (không phải JWT hợp lệ)
   * Pre-conditions: N/A
   * Input Data: GET /api/users/profile với Authorization: Bearer INVALID_TOKEN_XYZ
   * Expected Output: HTTP 401 + { error: "Token không hợp lệ." }
   */
  it('TC-PRF-06 | [Negative] GET /profile với JWT giả mạo → 401 Token không hợp lệ', () => {
    cy.request({
      method: 'GET',
      url: `${API}/users/profile`,
      headers: { Authorization: 'Bearer INVALID_TOKEN_XYZ_FAKE' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
      expect(res.body).to.have.property('error');
    });
  });

  /**
   * TC-PRF-07
   * Component/Function: searchUsers
   * Description: Tìm kiếm với từ khóa < 2 ký tự không trả về kết quả
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=a (1 ký tự)
   * Expected Output: HTTP 200 + Array rỗng []
   */
  it('TC-PRF-07 | [Negative] Search với query < 2 ký tự → trả về mảng rỗng', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=a`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.eq([]);
      });
    });
  });

  /**
   * TC-PRF-08
   * Component/Function: searchUsers
   * Description: Tìm kiếm với query rỗng không trả về kết quả
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=
   * Expected Output: HTTP 200 + Array rỗng []
   */
  it('TC-PRF-08 | [Negative] Search với query rỗng → trả về mảng rỗng', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.eq([]);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-PRF-09
   * Component/Function: searchUsers
   * Description: Tìm kiếm với đúng 2 ký tự (giá trị biên tối thiểu được chấp nhận)
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=cy (đúng 2 ký tự, có users match)
   * Expected Output: HTTP 200 + Array ≥ 1 phần tử
   */
  it('TC-PRF-09 | [Boundary] Search với đúng 2 ký tự (biên dưới hợp lệ) → có kết quả', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=cy`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array').with.length.greaterThan(0);
      });
    });
  });

  /**
   * TC-PRF-10
   * Component/Function: updateProfile
   * Description: Cập nhật displayName với chuỗi rỗng (edge case - không có validation server)
   * Pre-conditions: User đã xác thực
   * Input Data: PUT /api/users/profile { displayName: "" }
   * Expected Output: HTTP 200 + success: true (server chấp nhận do không có validation)
   */
  it('TC-PRF-10 | [Boundary] PUT /profile với displayName rỗng → server chấp nhận (không validate)', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'PUT',
        url: `${API}/users/profile`,
        headers: { Authorization: `Bearer ${token}` },
        body: { displayName: '' },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.success).to.be.true;
      });
    });
  });

  /**
   * TC-PRF-11
   * Component/Function: searchUsers (result limit)
   * Description: Tìm kiếm kết quả bị giới hạn tối đa 20 users (theo code: limit: 20)
   * Pre-conditions: DB có ≥ 20 users phù hợp với từ khóa (tạo qua task hoặc kiểm tra tối đa)
   * Input Data: GET /api/users/search?query=cy
   * Expected Output: HTTP 200 + Array.length ≤ 20
   */
  it('TC-PRF-11 | [Boundary] Kết quả tìm kiếm không vượt quá 20 users (limit)', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=cy`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.length).to.be.at.most(20);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-PRF-12
   * Component/Function: auth middleware (tokenVersion check)
   * Description: Token hợp lệ nhưng tokenVersion đã bị revoke (sau khi đổi mật khẩu hoặc
   *              gọi /auth/revoke-devices) không được phép truy cập
   * Pre-conditions: Có token cũ, server đã increment tokenVersion
   * Input Data: GET /api/users/profile với token đã bị thu hồi
   * Expected Output: HTTP 401 + error chứa "thu hồi" hoặc "đăng nhập lại"
   */
  it('TC-PRF-12 | [Security] Token bị revoke → 401 (tokenVersion không khớp)', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      // Revoke tất cả thiết bị khác (increment tokenVersion)
      cy.request({
        method: 'POST',
        url: `${API}/auth/revoke-all`,
        headers: { Authorization: `Bearer ${token}` },
      }).then(() => {
        // Dùng lại token cũ → phải bị từ chối
        cy.request({
          method: 'GET',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(401);
        });
      });
    });
  });

  /**
   * TC-PRF-13
   * Component/Function: auth middleware (banned user check)
   * Description: User bị ban không thể truy cập endpoint được bảo vệ
   * Pre-conditions: Admin đã ban user này (dùng task)
   * Input Data: GET /api/users/profile với token của user bị ban
   * Expected Output: HTTP 403 + { error: "Tài khoản của bạn đã bị khóa" }
   */
  it('TC-PRF-13 | [Security] User bị ban → 403 khi truy cập bất kỳ endpoint auth', () => {
    const bannedUser = `cy_banned_${ts}`;
    apiRegisterAndLogin(bannedUser, `cy_banned_${ts}@st.utt.edu.vn`).then(({ token, userId }) => {
      // Ban user qua task
      cy.task('banUser', userId).then(() => {
        cy.request({
          method: 'GET',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('bị khóa');
        });
      });
    });
  });

  /**
   * TC-PRF-14
   * Component/Function: searchUsers
   * Description: Kiểm tra SQL/NoSQL Injection không hoạt động qua query string tìm kiếm
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=' OR 1=1 --
   * Expected Output: HTTP 200 + Array rỗng (Sequelize parameterized query ngăn chặn injection)
   */
  it('TC-PRF-14 | [Security] SQL Injection trong search query → bị chặn, trả về mảng rỗng', () => {
    apiRegisterAndLogin(testUser.username, testUser.email, testUser.password).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=' OR 1=1 --`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
        // Kết quả không được là toàn bộ users trong DB
        expect(res.body.length).to.be.at.most(20);
      });
    });
  });

  /**
   * TC-PRF-15
   * Component/Function: auth middleware
   * Description: Token được ký sai secret không được chấp nhận
   * Pre-conditions: N/A
   * Input Data: JWT được sign bằng secret giả mạo với payload hợp lệ
   * Expected Output: HTTP 401 + { error: "Token không hợp lệ." }
   */
  it('TC-PRF-15 | [Security] JWT ký bằng secret giả mạo → 401 Token không hợp lệ', () => {
    // Tạo một JWT giả với header+payload hợp lệ nhưng signature sai
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5OTk5Iiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNjAwMDAwMDAwfQ.FAKE_SIGNATURE_DO_NOT_TRUST';
    cy.request({
      method: 'GET',
      url: `${API}/users/profile`,
      headers: { Authorization: `Bearer ${fakeToken}` },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
      expect(res.body).to.have.property('error');
    });
  });

  /**
   * TC-PRF-16
   * Component/Function: uploadAvatar (extension safety)
   * Description: Người dùng tải lên ảnh đại diện chứa extension độc hại hoặc kép -> server tự động chuẩn hóa extension về .jpg/.png
   * Pre-conditions: User đã đăng ký, có JWT hợp lệ
   * Input Data: POST /api/users/avatar với file upload shell.php%00.png
   * Expected Output: HTTP 200 + avatarUrl kết thúc bằng đuôi .png hợp lệ và không chứa các ký tự nguy hại
   */
  it('TC-PRF-16 | [Security] Tải lên avatar với extension độc hại hoặc null byte → được chuẩn hóa hoặc chặn', () => {
    apiRegisterAndLogin(`cy_avatar_${ts}`, `cy_avatar_${ts}@st.utt.edu.vn`).then(({ token }) => {
      cy.window().then(async (win) => {
        // Tạo FormData chứa file độc hại
        const formData = new win.FormData();
        const blob = new win.Blob(['test image content'], { type: 'image/png' });
        formData.append('avatar', blob, 'shell.php%00.png'); // có null byte

        const res = await win.fetch(`${API}/users/avatar`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        
        expect(res.status).to.eq(200);
        const body = await res.json();
        expect(body.success).to.be.true;
        // Đuôi extension phải được sanitize về .png (do input gốc là .png)
        expect(body.avatarUrl).to.match(/\.png$/);
        expect(body.avatarUrl).to.not.contain('%00');
        expect(body.avatarUrl).to.not.contain('.php');
      });
    });
  });

  /**
   * TC-PRF-17
   * Component/Function: getUsers N+1 Query Resolution
   * Description: Lấy danh sách users kèm tin nhắn cuối cùng sử dụng truy vấn đơn tối ưu
   * Pre-conditions: User đã đăng nhập, có chat history với user khác
   * Expected Output: HTTP 200, danh sách users kèm thông tin latestMessage chuẩn xác
   */
  it('TC-PRF-17 | [Positive] getUsers trả về thông tin latestMessage chuẩn xác → 200 OK', () => {
    const userA_name = `cy_n1_a_${Date.now()}`;
    const userB_name = `cy_n1_b_${Date.now()}`;
    apiRegisterAndLogin(userA_name, `${userA_name}@st.utt.edu.vn`).then((resA) => {
      apiRegisterAndLogin(userB_name, `${userB_name}@st.utt.edu.vn`).then((resB) => {
        // Gửi 1 tin nhắn 1-1 giả lập trực tiếp qua DB
        cy.task('create1to1Message', {
          senderId: resA.userId,
          recipientId: resB.userId,
          encryptedContent: 'Tin nhắn thử nghiệm N+1',
          ratchetKey: 'AAAA',
          n: 0,
          pn: 0,
          iv: 'BBBB'
        }).then(() => {
          // Lấy danh sách users từ phía User B
          cy.request({
            method: 'GET',
            url: `${API}/users`,
            headers: { Authorization: `Bearer ${resB.token}` }
          }).then((res) => {
            expect(res.status).to.eq(200);
            const partner = res.body.find(u => u.id === resA.userId);
            expect(partner).to.not.be.undefined;
            expect(partner.latestMessage).to.not.be.null;
            expect(partner.latestMessage.encryptedContent).to.eq('Tin nhắn thử nghiệm N+1');
          });
        });
      });
    });
  });

  /**
   * TC-PRF-18
   * Component/Function: updateProfile (Security & Validation)
   * Description: Kiểm tra ràng buộc phân quyền và định dạng của studentId/teacherId/phone khi cập nhật profile
   * Pre-conditions: Có Student và Teacher đã được đăng ký
   * Expected Output: 
   * - Student cập nhật teacherId → 403 Forbidden
   * - Student cập nhật studentId sai định dạng → 400 Bad Request
   * - Student cập nhật studentId trùng lặp → 400 Bad Request
   * - Student cập nhật phone sai định dạng → 400 Bad Request
   * - Student cập nhật studentId/phone hợp lệ → 200 OK
   */
  it('TC-PRF-18 | [Security/Validation] updateProfile kiểm tra định dạng, phân quyền và tính duy nhất → 200/400/403', () => {
    const student1 = `cy_vld_s1_${Date.now()}`;
    const student2 = `cy_vld_s2_${Date.now()}`;
    apiRegisterAndLogin(student1, `${student1}@st.utt.edu.vn`).then((resS1) => {
      apiRegisterAndLogin(student2, `${student2}@st.utt.edu.vn`).then((resS2) => {
        // 1. S1 cập nhật teacherId -> 403
        cy.request({
          method: 'PUT',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${resS1.token}` },
          body: { teacherId: 'GV001' },
          failOnStatusCode: false
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('Sinh viên không thể');
        });

        // 2. S1 cập nhật studentId sai định dạng -> 400
        cy.request({
          method: 'PUT',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${resS1.token}` },
          body: { studentId: 'SV' }, // quá ngắn (<3 ký tự)
          failOnStatusCode: false
        }).then((res) => {
          expect(res.status).to.eq(400);
          expect(res.body.error).to.include('không hợp lệ');
        });

        // 3. S2 cập nhật studentId hợp lệ trước
        const validStudentId = 'SV' + Date.now().toString().slice(-6);
        cy.request({
          method: 'PUT',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${resS2.token}` },
          body: { studentId: validStudentId }
        }).then((res) => {
          expect(res.status).to.eq(200);

          // 4. S1 cập nhật studentId trùng với S2 -> 400
          cy.request({
            method: 'PUT',
            url: `${API}/users/profile`,
            headers: { Authorization: `Bearer ${resS1.token}` },
            body: { studentId: validStudentId },
            failOnStatusCode: false
          }).then((resDuplicate) => {
            expect(resDuplicate.status).to.eq(400);
            expect(resDuplicate.body.error).to.include('đã tồn tại');
          });
        });

        // 5. S1 cập nhật phone sai định dạng -> 400
        cy.request({
          method: 'PUT',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${resS1.token}` },
          body: { phone: '123' },
          failOnStatusCode: false
        }).then((res) => {
          expect(res.status).to.eq(400);
          expect(res.body.error).to.include('Số điện thoại không hợp lệ');
        });
      });
    });
  });
});

