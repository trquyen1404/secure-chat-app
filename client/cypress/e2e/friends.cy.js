/**
 * MODULE: Friend Request System
 * Controller: friendController.js
 * Routes:
 *   POST  /api/friends/request  → sendRequest
 *   POST  /api/friends/accept   → acceptRequest
 *   GET   /api/friends          → getFriends
 *   GET   /api/friends/requests → getRequests
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 *   sendRequest:    self-add guard → duplicate check (Op.or) → create pending
 *   acceptRequest:  recipientId guard → 404 if not found/not pending → status='accepted'
 *   getFriends:     findAll accepted, map requester/recipient
 *   getRequests:    findAll pending where recipientId = me
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

describe('[Module: Friends] Hệ thống kết bạn', () => {
  const ts = Date.now();

  // Seed users once per suite
  let userA, tokenA;
  let userB, tokenB;
  let userC, tokenC;

  before(() => {
    apiUser(`cy_fa_${ts}`, `cy_fa_${ts}@st.utt.edu.vn`).then(r => { userA = r; tokenA = r.token; });
    apiUser(`cy_fb_${ts}`, `cy_fb_${ts}@st.utt.edu.vn`).then(r => { userB = r; tokenB = r.token; });
    apiUser(`cy_fc_${ts}`, `cy_fc_${ts}@st.utt.edu.vn`).then(r => { userC = r; tokenC = r.token; });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-01
   * Component/Function: sendRequest
   * Description: Gửi lời mời kết bạn từ A → B thành công
   * Pre-conditions: A và B đã đăng ký, chưa có quan hệ bạn bè
   * Input Data: POST /api/friends/request { recipientId: userB.userId }
   * Expected Output: HTTP 201 + { status: 'pending', requesterId, recipientId }
   */
  it('TC-FRD-01 | [Positive] Gửi lời mời kết bạn thành công → 201', () => {
    const ts2 = Date.now();
    apiUser(`cy_fa2_${ts2}`, `cy_fa2_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_fb2_${ts2}`, `cy_fb2_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(res => {
          expect(res.status).to.eq(201);
          expect(res.body.status).to.eq('pending');
          expect(res.body.requesterId).to.eq(resA.userId);
          expect(res.body.recipientId).to.eq(resB.userId);
        });
      });
    });
  });

  /**
   * TC-FRD-02
   * Component/Function: acceptRequest
   * Description: B chấp nhận lời mời từ A → trạng thái 'accepted'
   * Pre-conditions: A đã gửi lời mời tới B
   * Input Data: POST /api/friends/accept { requestId: friendReq.id }
   * Expected Output: HTTP 200 + { status: 'accepted' }
   */
  it('TC-FRD-02 | [Positive] Chấp nhận lời mời kết bạn thành công → 200 accepted', () => {
    const ts2 = Date.now();
    apiUser(`cy_fa3_${ts2}`, `cy_fa3_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_fb3_${ts2}`, `cy_fb3_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(reqRes => {
          expect(reqRes.status).to.eq(201);
          cy.request({
            method: 'POST',
            url: `${API}/friends/accept`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { requestId: reqRes.body.id }
          }).then(acceptRes => {
            expect(acceptRes.status).to.eq(200);
            expect(acceptRes.body.status).to.eq('accepted');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-03
   * Component/Function: getFriends
   * Description: Sau khi accepted, GET /friends trả về danh sách bạn bè chứa B
   * Pre-conditions: A và B đã là bạn bè (status=accepted)
   * Input Data: GET /api/friends (token A)
   * Expected Output: HTTP 200 + Array chứa object { id: userB.userId }
   */
  it('TC-FRD-03 | [Positive] GET /friends trả về danh sách bạn bè đã accepted', () => {
    const ts2 = Date.now();
    apiUser(`cy_fa4_${ts2}`, `cy_fa4_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_fb4_${ts2}`, `cy_fb4_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(reqRes => {
          cy.request({
            method: 'POST',
            url: `${API}/friends/accept`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { requestId: reqRes.body.id }
          }).then(() => {
            cy.request({
              method: 'GET',
              url: `${API}/friends`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(res => {
              expect(res.status).to.eq(200);
              expect(res.body).to.be.an('array');
              const found = res.body.find(u => u.id === resB.userId);
              expect(found).to.not.be.undefined;
            });
          });
        });
      });
    });
  });

  /**
   * TC-FRD-04
   * Component/Function: getRequests
   * Description: B nhận được lời mời từ A trong /friends/requests
   * Pre-conditions: A đã gửi lời mời, B chưa chấp nhận
   * Input Data: GET /api/friends/requests (token B)
   * Expected Output: HTTP 200 + Array có phần tử với Requester.id = userA.userId
   */
  it('TC-FRD-04 | [Positive] GET /friends/requests trả về danh sách lời mời đến B', () => {
    const ts2 = Date.now();
    apiUser(`cy_fa5_${ts2}`, `cy_fa5_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_fb5_${ts2}`, `cy_fb5_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(() => {
          cy.request({
            method: 'GET',
            url: `${API}/friends/requests`,
            headers: { Authorization: `Bearer ${resB.token}` }
          }).then(res => {
            expect(res.status).to.eq(200);
            expect(res.body).to.be.an('array');
            const found = res.body.find(r => r.Requester?.id === resA.userId);
            expect(found).to.not.be.undefined;
            expect(found.status).to.eq('pending');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-05
   * Component/Function: getFriends (bidirectional)
   * Description: Cả A và B đều thấy nhau trong danh sách bạn bè sau khi accepted
   * Pre-conditions: A và B đã accepted
   * Input Data: GET /api/friends cho cả A và B
   * Expected Output: Mỗi bên đều có bên kia trong danh sách
   */
  it('TC-FRD-05 | [Positive] Quan hệ bạn bè là hai chiều - cả A và B thấy nhau', () => {
    const ts2 = Date.now();
    apiUser(`cy_fa6_${ts2}`, `cy_fa6_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_fb6_${ts2}`, `cy_fb6_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/friends/request`, headers: { Authorization: `Bearer ${resA.token}` }, body: { recipientId: resB.userId } }).then(reqRes => {
          cy.request({ method: 'POST', url: `${API}/friends/accept`, headers: { Authorization: `Bearer ${resB.token}` }, body: { requestId: reqRes.body.id } }).then(() => {
            // A thấy B
            cy.request({ method: 'GET', url: `${API}/friends`, headers: { Authorization: `Bearer ${resA.token}` } }).then(res => {
              expect(res.body.find(u => u.id === resB.userId)).to.not.be.undefined;
            });
            // B thấy A
            cy.request({ method: 'GET', url: `${API}/friends`, headers: { Authorization: `Bearer ${resB.token}` } }).then(res => {
              expect(res.body.find(u => u.id === resA.userId)).to.not.be.undefined;
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-06
   * Component/Function: sendRequest
   * Description: Gửi lời mời kết bạn với chính mình → 400
   * Pre-conditions: User A đã đăng nhập
   * Input Data: POST /api/friends/request { recipientId: userA.userId }
   * Expected Output: HTTP 400 + { error: 'Cannot add yourself' }
   */
  it('TC-FRD-06 | [Negative] Gửi lời mời kết bạn với chính mình → 400', () => {
    apiUser(`cy_self_${ts}`, `cy_self_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/friends/request`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: { recipientId: resA.userId },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.include('yourself');
      });
    });
  });

  /**
   * TC-FRD-07
   * Component/Function: sendRequest (duplicate guard)
   * Description: Gửi lời mời 2 lần tới cùng 1 người → 400 duplicate
   * Pre-conditions: A đã gửi lời mời tới B (pending)
   * Input Data: POST /api/friends/request { recipientId: userB } × 2
   * Expected Output: HTTP 400 + { error: 'Friend request already exists...' }
   */
  it('TC-FRD-07 | [Negative] Gửi lời mời kết bạn 2 lần → 400 duplicate', () => {
    const ts2 = Date.now();
    apiUser(`cy_dup_a_${ts2}`, `cy_dup_a_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_dup_b_${ts2}`, `cy_dup_b_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(() => {
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { recipientId: resB.userId },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(400);
            expect(res.body.error).to.include('already exists');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-08
   * Component/Function: sendRequest (reverse duplicate)
   * Description: B gửi lời mời lại cho A khi A đang có lời mời pending tới B → 400
   * Pre-conditions: A đã gửi lời mời tới B (pending, chưa accepted)
   * Input Data: POST /api/friends/request { recipientId: userA.userId } từ B
   * Expected Output: HTTP 400 + { error: 'Friend request already exists...' }
   */
  it('TC-FRD-08 | [Negative] B gửi lời mời ngược cho A trong khi A đang có lời mời pending → 400', () => {
    const ts2 = Date.now();
    apiUser(`cy_rev_a_${ts2}`, `cy_rev_a_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_rev_b_${ts2}`, `cy_rev_b_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/friends/request`, headers: { Authorization: `Bearer ${resA.token}` }, body: { recipientId: resB.userId } }).then(() => {
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { recipientId: resA.userId },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(400);
            expect(res.body.error).to.include('already exists');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-09
   * Component/Function: acceptRequest
   * Description: A cố gắng chấp nhận lời mời của chính A gửi cho B → 404 (không tìm thấy với recipientId=A)
   * Pre-conditions: A đã gửi lời mời tới B
   * Input Data: POST /api/friends/accept { requestId } từ A (người gửi, không phải người nhận)
   * Expected Output: HTTP 404 + { error: 'Request not found' }
   */
  it('TC-FRD-09 | [Negative] Người gửi cố tự accept lời mời của mình → 404', () => {
    const ts2 = Date.now();
    apiUser(`cy_sa_a_${ts2}`, `cy_sa_a_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_sa_b_${ts2}`, `cy_sa_b_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/friends/request`, headers: { Authorization: `Bearer ${resA.token}` }, body: { recipientId: resB.userId } }).then(reqRes => {
          cy.request({
            method: 'POST',
            url: `${API}/friends/accept`,
            headers: { Authorization: `Bearer ${resA.token}` }, // A tự chấp nhận
            body: { requestId: reqRes.body.id },
            failOnStatusCode: false
          }).then(res => {
            expect(res.status).to.eq(404);
            expect(res.body.error).to.include('Request not found');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-10
   * Component/Function: acceptRequest
   * Description: Accept một requestId không tồn tại → 404
   * Pre-conditions: N/A
   * Input Data: POST /api/friends/accept { requestId: '00000000-0000-0000-0000-000000000000' }
   * Expected Output: HTTP 404 + { error: 'Request not found' }
   */
  it('TC-FRD-10 | [Negative] Accept requestId không tồn tại → 404 Request not found', () => {
    apiUser(`cy_na_a_${ts}`, `cy_na_a_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'POST',
        url: `${API}/friends/accept`,
        headers: { Authorization: `Bearer ${resA.token}` },
        body: { requestId: '00000000-0000-0000-0000-000000000000' },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(404);
        expect(res.body.error).to.include('Request not found');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-11
   * Component/Function: getFriends
   * Description: User mới đăng ký chưa có bạn → GET /friends trả về mảng rỗng
   * Pre-conditions: User mới chưa có bất kỳ quan hệ bạn bè nào
   * Input Data: GET /api/friends (token user mới)
   * Expected Output: HTTP 200 + [] (mảng rỗng)
   */
  it('TC-FRD-11 | [Boundary] User mới chưa có bạn → GET /friends trả về mảng rỗng', () => {
    const ts2 = Date.now();
    apiUser(`cy_nf_${ts2}`, `cy_nf_${ts2}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'GET',
        url: `${API}/friends`,
        headers: { Authorization: `Bearer ${resA.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array').with.length(0);
      });
    });
  });

  /**
   * TC-FRD-12
   * Component/Function: getRequests
   * Description: User không có lời mời nào → GET /friends/requests trả về mảng rỗng
   * Pre-conditions: User chưa nhận lời mời nào
   * Input Data: GET /api/friends/requests
   * Expected Output: HTTP 200 + [] (mảng rỗng)
   */
  it('TC-FRD-12 | [Boundary] Không có lời mời nào → GET /friends/requests trả về mảng rỗng', () => {
    const ts2 = Date.now();
    apiUser(`cy_nr_${ts2}`, `cy_nr_${ts2}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'GET',
        url: `${API}/friends/requests`,
        headers: { Authorization: `Bearer ${resA.token}` }
      }).then(res => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array').with.length(0);
      });
    });
  });

  /**
   * TC-FRD-13
   * Component/Function: sendRequest + acceptRequest (chuỗi đầy đủ)
   * Description: Vừa kết bạn xong, gửi lại lời mời → 400 already friends/exists
   * Pre-conditions: A và B đã là bạn (accepted)
   * Input Data: POST /api/friends/request { recipientId: userB.userId } lần 2
   * Expected Output: HTTP 400 + error
   */
  it('TC-FRD-13 | [Boundary] Gửi lời mời kết bạn khi đã là bạn rồi → 400', () => {
    const ts2 = Date.now();
    apiUser(`cy_ab_a_${ts2}`, `cy_ab_a_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_ab_b_${ts2}`, `cy_ab_b_${ts2}@st.utt.edu.vn`).then(resB => {
        cy.request({ method: 'POST', url: `${API}/friends/request`, headers: { Authorization: `Bearer ${resA.token}` }, body: { recipientId: resB.userId } }).then(reqRes => {
          cy.request({ method: 'POST', url: `${API}/friends/accept`, headers: { Authorization: `Bearer ${resB.token}` }, body: { requestId: reqRes.body.id } }).then(() => {
            cy.request({
              method: 'POST',
              url: `${API}/friends/request`,
              headers: { Authorization: `Bearer ${resA.token}` },
              body: { recipientId: resB.userId },
              failOnStatusCode: false
            }).then(res => {
              expect(res.status).to.eq(400);
              expect(res.body.error).to.include('already');
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-14
   * Component/Function: sendRequest (không có token)
   * Description: Gửi lời mời kết bạn không có token xác thực → 401
   * Pre-conditions: N/A
   * Input Data: POST /api/friends/request (không có Authorization header)
   * Expected Output: HTTP 401 Unauthorized
   */
  it('TC-FRD-14 | [Security] Gửi lời mời kết bạn không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'POST',
      url: `${API}/friends/request`,
      body: { recipientId: '00000000-0000-0000-0000-000000000000' },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });
  });

  /**
   * TC-FRD-15
   * Component/Function: acceptRequest (IDOR - Insecure Direct Object Reference)
   * Description: C cố chấp nhận lời mời giữa A và B mà C không phải recipient → 404
   * Pre-conditions: A đã gửi lời mời tới B (C là bên thứ 3)
   * Input Data: POST /api/friends/accept { requestId } từ C
   * Expected Output: HTTP 404 (hệ thống chỉ tìm request có recipientId = C, không tìm thấy)
   */
  it('TC-FRD-15 | [Security] IDOR: C cố chấp nhận lời mời giữa A và B → 404', () => {
    const ts2 = Date.now();
    apiUser(`cy_id_a_${ts2}`, `cy_id_a_${ts2}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_id_b_${ts2}`, `cy_id_b_${ts2}@st.utt.edu.vn`).then(resB => {
        apiUser(`cy_id_c_${ts2}`, `cy_id_c_${ts2}@st.utt.edu.vn`).then(resC => {
          cy.request({ method: 'POST', url: `${API}/friends/request`, headers: { Authorization: `Bearer ${resA.token}` }, body: { recipientId: resB.userId } }).then(reqRes => {
            cy.request({
              method: 'POST',
              url: `${API}/friends/accept`,
              headers: { Authorization: `Bearer ${resC.token}` },
              body: { requestId: reqRes.body.id },
              failOnStatusCode: false
            }).then(res => {
              expect(res.status).to.eq(404);
            });
          });
        });
      });
    });
  });

  /**
   * TC-FRD-16
   * Component/Function: getRequests (không có token)
   * Description: Truy cập danh sách lời mời không có token → 401
   * Pre-conditions: N/A
   * Input Data: GET /api/friends/requests (không có Authorization header)
   * Expected Output: HTTP 401
   */
  it('TC-FRD-16 | [Security] GET /friends/requests không có token → 401', () => {
    cy.request({
      method: 'GET',
      url: `${API}/friends/requests`,
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });
  });
});
