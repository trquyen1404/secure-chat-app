/**
 * MODULE: Block / Unblock Users
 * Controller: userController.js (blockUser, unblockUser, getBlockedUsers, getPreKeyBundle, getMessages)
 * Routes:
 *   POST   /api/users/block
 *   POST   /api/users/unblock
 *   GET    /api/users/blocked
 *   GET    /api/users/:userId/prekey-bundle
 *   GET    /api/messages/:userId
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * Logic branches:
 *   blockUser:       !userId → 400 | userId === self → 400 | findOrCreate (idempotent)
 *   unblockUser:     destroy (soft-delete, no error on missing)
 *   getBlockedUsers: simple findAll, include BlockedUser join
 *   getPreKeyBundle: block check → 403 | user not found → 404 | OTPK marked used
 *   getMessages:     block check → 403 | cursor-based pagination
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';
const apiRegisterAndLogin = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('[Module: Block/Unblock] Chặn và bỏ chặn người dùng', () => {
  const ts = Date.now();
  const blocker = { username: `cy_blocker_${ts}`, email: `cy_blocker_${ts}@st.utt.edu.vn` };
  const target  = { username: `cy_target_${ts}`,  email: `cy_target_${ts}@st.utt.edu.vn`  };

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-BLK-01
   * Component/Function: blockUser
   * Description: User A chặn User B thành công, lấy danh sách blocked trả về User B
   * Pre-conditions: Cả 2 user đã đăng ký
   * Input Data: POST /api/users/block { userId: targetId }
   * Expected Output: HTTP 200 + { success: true, message: "User blocked" }
   */
  it('TC-BLK-01 | [Positive] Chặn user thành công → 200 success', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        cy.request({
          method: 'POST',
          url: `${API}/users/block`,
          headers: { Authorization: `Bearer ${tokenA}` },
          body: { userId: targetId },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.eq('User blocked');
        });
      });
    });
  });

  /**
   * TC-BLK-02
   * Component/Function: getBlockedUsers
   * Description: Sau khi block, danh sách /blocked chứa user đã bị chặn
   * Pre-conditions: TC-BLK-01 đã chạy, User B bị chặn bởi User A
   * Input Data: GET /api/users/blocked với token của User A
   * Expected Output: HTTP 200 + Array ≥ 1, chứa object có username = target.username
   */
  it('TC-BLK-02 | [Positive] GET /blocked trả về danh sách user đã bị chặn', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        // Block trước
        cy.request({
          method: 'POST',
          url: `${API}/users/block`,
          headers: { Authorization: `Bearer ${tokenA}` },
          body: { userId: targetId },
        });
        // Lấy danh sách blocked
        cy.request({
          method: 'GET',
          url: `${API}/users/blocked`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body).to.be.an('array').with.length.greaterThan(0);
          const blockedUser = res.body.find(b => b.BlockedUser?.username === target.username);
          expect(blockedUser).to.not.be.undefined;
        });
      });
    });
  });

  /**
   * TC-BLK-03
   * Component/Function: unblockUser
   * Description: Bỏ chặn user đã bị chặn thành công
   * Pre-conditions: User A đã chặn User B
   * Input Data: POST /api/users/unblock { userId: targetId }
   * Expected Output: HTTP 200 + { success: true, message: "User unblocked" }
   */
  it('TC-BLK-03 | [Positive] Bỏ chặn user thành công → 200 success', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        // Block trước
        cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${tokenA}` }, body: { userId: targetId } });
        // Unblock
        cy.request({
          method: 'POST',
          url: `${API}/users/unblock`,
          headers: { Authorization: `Bearer ${tokenA}` },
          body: { userId: targetId },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.eq('User unblocked');
        });
        // Kiểm tra danh sách blocked không còn targetId
        cy.request({
          method: 'GET',
          url: `${API}/users/blocked`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          const still = res.body.find(b => b.BlockedUser?.username === target.username);
          expect(still).to.be.undefined;
        });
      });
    });
  });

  /**
   * TC-BLK-04
   * Component/Function: blockUser (findOrCreate – idempotent)
   * Description: Chặn cùng một user 2 lần → vẫn trả về thành công (idempotent, không lỗi)
   * Pre-conditions: User A đã chặn User B
   * Input Data: POST /api/users/block { userId: targetId } × 2
   * Expected Output: HTTP 200 × 2, không có lỗi duplicate key
   */
  it('TC-BLK-04 | [Positive] Block cùng user 2 lần → idempotent, không báo lỗi', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        const blockReq = () =>
          cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${tokenA}` }, body: { userId: targetId } });
        blockReq().then(r1 => {
          expect(r1.status).to.eq(200);
          blockReq().then(r2 => expect(r2.status).to.eq(200));
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-BLK-05
   * Component/Function: blockUser
   * Description: Chặn chính mình → trả về lỗi 400
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/block { userId: <own userId> }
   * Expected Output: HTTP 400 + { error: "You cannot block yourself" }
   */
  it('TC-BLK-05 | [Negative] Chặn chính mình → 400 You cannot block yourself', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token, userId }) => {
      cy.request({
        method: 'POST',
        url: `${API}/users/block`,
        headers: { Authorization: `Bearer ${token}` },
        body: { userId },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.eq('You cannot block yourself');
      });
    });
  });

  /**
   * TC-BLK-06
   * Component/Function: blockUser
   * Description: Thiếu userId trong body → trả về lỗi 400
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/block {} (body rỗng)
   * Expected Output: HTTP 400 + { error: "User ID to block is required" }
   */
  it('TC-BLK-06 | [Negative] Block không có userId trong body → 400', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token }) => {
      cy.request({
        method: 'POST',
        url: `${API}/users/block`,
        headers: { Authorization: `Bearer ${token}` },
        body: {},
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.eq('User ID to block is required');
      });
    });
  });

  /**
   * TC-BLK-07
   * Component/Function: getPreKeyBundle
   * Description: User B đã bị User A chặn → A không thể lấy PreKey Bundle của B (403)
   * Pre-conditions: A đã block B
   * Input Data: GET /api/users/:targetId/prekey-bundle với token của A
   * Expected Output: HTTP 403 + { error: "Truy cập bị từ chối (Blocking active)" }
   */
  it('TC-BLK-07 | [Negative] Lấy PreKey Bundle của user đã bị chặn → 403 Forbidden', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${tokenA}` }, body: { userId: targetId } });
        cy.request({
          method: 'GET',
          url: `${API}/users/${targetId}/prekey-bundle`,
          headers: { Authorization: `Bearer ${tokenA}` },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('Blocking active');
        });
      });
    });
  });

  /**
   * TC-BLK-08
   * Component/Function: getMessages (messageController)
   * Description: User bị chặn không thể lấy lịch sử chat với người đã chặn mình → 403
   * Pre-conditions: A đã block B
   * Input Data: GET /api/messages/:blockerId với token của B
   * Expected Output: HTTP 403 + { error: "Truy cập bị từ chối (Blocking active)" }
   */
  it('TC-BLK-08 | [Negative] Lấy tin nhắn với user đã chặn mình → 403 Forbidden', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA, userId: blockerUserId }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ token: tokenB, userId: targetId }) => {
        // A block B
        cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${tokenA}` }, body: { userId: targetId } });
        // B cố lấy tin nhắn với A
        cy.request({
          method: 'GET',
          url: `${API}/messages/${blockerUserId}`,
          headers: { Authorization: `Bearer ${tokenB}` },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body.error).to.include('Blocking active');
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-BLK-09
   * Component/Function: unblockUser
   * Description: Bỏ chặn user chưa từng bị chặn → không lỗi (Block.destroy là noop)
   * Pre-conditions: Không có bản ghi block giữa A và C
   * Input Data: POST /api/users/unblock { userId: <userId chưa bị block> }
   * Expected Output: HTTP 200 + { success: true, message: "User unblocked" }
   */
  it('TC-BLK-09 | [Boundary] Unblock user chưa bị chặn → 200 (noop, không lỗi)', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        // Không block trước, gọi unblock thẳng
        cy.request({
          method: 'POST',
          url: `${API}/users/unblock`,
          headers: { Authorization: `Bearer ${tokenA}` },
          body: { userId: targetId },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.success).to.be.true;
        });
      });
    });
  });

  /**
   * TC-BLK-10
   * Component/Function: getPreKeyBundle
   * Description: Lấy PreKey Bundle của user không tồn tại → 404
   * Pre-conditions: userId không tồn tại trong DB
   * Input Data: GET /api/users/999999999/prekey-bundle
   * Expected Output: HTTP 404 + { error: "User not found" }
   */
  it('TC-BLK-10 | [Boundary] Lấy PreKey Bundle của userId không tồn tại → 404', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token }) => {
      cy.request({
        method: 'GET',
        url: `${API}/users/00000000-0000-0000-0000-000000000000/prekey-bundle`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expect(res.body.error).to.eq('User not found');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-BLK-11
   * Component/Function: getBlockedUsers
   * Description: User bị chặn KHÔNG thể thấy mình trong danh sách user của người đã chặn
   * Pre-conditions: A đã block B
   * Input Data: GET /api/users (danh sách user của A)
   * Expected Output: HTTP 200 + Array KHÔNG chứa B
   */
  it('TC-BLK-11 | [Security] User bị chặn không xuất hiện trong danh sách /users của blocker', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${tokenA}` }, body: { userId: targetId } });
        cy.request({
          method: 'GET',
          url: `${API}/users`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          const found = res.body.find(u => u.id === targetId);
          expect(found).to.be.undefined;
        });
      });
    });
  });

  /**
   * TC-BLK-12
   * Component/Function: searchUsers
   * Description: Kết quả tìm kiếm không hiển thị user đã bị chặn
   * Pre-conditions: A đã block B, B có username "cy_target_<ts>"
   * Input Data: GET /api/users/search?query=cy_target (token của A)
   * Expected Output: HTTP 200 + Array KHÔNG chứa B
   */
  it('TC-BLK-12 | [Security] Search không trả về user đã bị chặn', () => {
    apiRegisterAndLogin(blocker.username, blocker.email).then(({ token: tokenA }) => {
      apiRegisterAndLogin(target.username, target.email).then(({ userId: targetId }) => {
        cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${tokenA}` }, body: { userId: targetId } });
        cy.request({
          method: 'GET',
          url: `${API}/users/search?query=${target.username.slice(0, 10)}`,
          headers: { Authorization: `Bearer ${tokenA}` },
        }).then((res) => {
          expect(res.status).to.eq(200);
          const found = res.body.find(u => u.id === targetId);
          expect(found).to.be.undefined;
        });
      });
    });
  });

  /**
   * TC-BLK-13
   * Component/Function: blockUser / getBlockedUsers (không có token)
   * Description: Truy cập block endpoint không có token → 401
   * Pre-conditions: N/A
   * Input Data: POST /api/users/block không có Authorization header
   * Expected Output: HTTP 401
   */
  it('TC-BLK-13 | [Security] Block endpoint không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'POST',
      url: `${API}/users/block`,
      body: { userId: '00000000-0000-0000-0000-000000000000' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });
});
