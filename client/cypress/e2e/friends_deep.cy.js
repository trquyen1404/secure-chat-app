/**
 * MODULE: Friends System - Deep Coverage
 * Controller: friendController.js
 * Routes:
 *   POST /api/friends/request   → sendRequest
 *   POST /api/friends/accept    → acceptRequest
 *   GET  /api/friends           → getFriends
 *   GET  /api/friends/requests  → getRequests
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * sendRequest:
 *   - requesterId === recipientId → 400 'Cannot add yourself'
 *   - existing record (either direction) → 400 'already exists'
 *   - success → 201 Friend record
 *   - uses req.user.id (not req.userId)
 *
 * acceptRequest:
 *   - requestId not found OR recipientId !== userId OR status !== 'pending' → 404
 *   - success → status='accepted'
 *
 * getFriends:
 *   - returns only accepted friends
 *   - maps: if I'm requester → return Recipient; if I'm recipient → return Requester
 *   - data isolation: only see own friends
 *
 * getRequests:
 *   - returns only PENDING where I'm recipient
 *   - data isolation: only see own incoming requests
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';
const ts = Date.now();

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

describe('[Module: Friends Deep] Hệ thống kết bạn - Bao phủ đầy đủ', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-01
   * Component/Function: sendRequest
   * Description: Gửi lời mời kết bạn thành công → 201
   * Pre-conditions: A và B chưa kết bạn, chưa có request
   * Input Data: POST /api/friends/request { recipientId: B.id }
   * Expected Output: HTTP 201 + { id, requesterId, recipientId, status: 'pending' }
   */
  it('TC-FRD-01 | [Positive] Gửi lời mời kết bạn thành công → 201 pending', () => {
    apiUser(`cy_frd_a1_${ts}`, `cy_frd_a1_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b1_${ts}`, `cy_frd_b1_${ts}@st.utt.edu.vn`).then(resB => {
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
   * Description: Chấp nhận lời mời kết bạn thành công → status='accepted'
   * Pre-conditions: B đã nhận request từ A, request ở trạng thái pending
   * Input Data: POST /api/friends/accept { requestId: <friendRequest.id> }
   * Expected Output: HTTP 200 + { status: 'accepted' }
   */
  it('TC-FRD-02 | [Positive] Chấp nhận lời mời kết bạn → status=accepted', () => {
    apiUser(`cy_frd_a2_${ts}`, `cy_frd_a2_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b2_${ts}`, `cy_frd_b2_${ts}@st.utt.edu.vn`).then(resB => {
        // A gửi request đến B
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(reqRes => {
          const requestId = reqRes.body.id;
          // B chấp nhận
          cy.request({
            method: 'POST',
            url: `${API}/friends/accept`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { requestId }
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
   * Description: Lấy danh sách bạn bè sau khi đã kết bạn → trả về đúng người
   * Pre-conditions: A và B đã accept friend request
   * Input Data: GET /api/friends (token A)
   * Expected Output: HTTP 200 + Array có B; GET friends của B cũng có A
   */
  it('TC-FRD-03 | [Positive] getFriends trả về danh sách bạn bè đã accepted', () => {
    apiUser(`cy_frd_a3_${ts}`, `cy_frd_a3_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b3_${ts}`, `cy_frd_b3_${ts}@st.utt.edu.vn`).then(resB => {
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
            // A lấy danh sách bạn → thấy B
            cy.request({
              method: 'GET',
              url: `${API}/friends`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(friendsA => {
              expect(friendsA.status).to.eq(200);
              const bInFriends = friendsA.body.find(f => f.id === resB.userId);
              expect(bInFriends).to.not.be.undefined;
              expect(bInFriends).to.have.property('username');
            });

            // B lấy danh sách bạn → thấy A
            cy.request({
              method: 'GET',
              url: `${API}/friends`,
              headers: { Authorization: `Bearer ${resB.token}` }
            }).then(friendsB => {
              expect(friendsB.status).to.eq(200);
              const aInFriends = friendsB.body.find(f => f.id === resA.userId);
              expect(aInFriends).to.not.be.undefined;
            });
          });
        });
      });
    });
  });

  /**
   * TC-FRD-04
   * Component/Function: getRequests
   * Description: Lấy danh sách lời mời kết bạn đang chờ → trả về request từ A
   * Pre-conditions: A đã gửi request đến B, chưa được accept
   * Input Data: GET /api/friends/requests (token B)
   * Expected Output: HTTP 200 + Array có request với Requester.id = A.id
   */
  it('TC-FRD-04 | [Positive] getRequests trả về lời mời đang pending của B', () => {
    apiUser(`cy_frd_a4_${ts}`, `cy_frd_a4_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b4_${ts}`, `cy_frd_b4_${ts}@st.utt.edu.vn`).then(resB => {
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
            expect(res.body).to.be.an('array').with.length.greaterThan(0);
            const reqFromA = res.body.find(r => r.Requester && r.Requester.id === resA.userId);
            expect(reqFromA).to.not.be.undefined;
            expect(reqFromA.status).to.eq('pending');
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-05
   * Component/Function: sendRequest (self-request)
   * Description: Gửi lời mời kết bạn đến chính mình → 400
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/friends/request { recipientId: <self.id> }
   * Expected Output: HTTP 400 + { error: 'Cannot add yourself' }
   */
  it('TC-FRD-05 | [Negative] Gửi lời mời kết bạn đến chính mình → 400', () => {
    apiUser(`cy_frd_self_${ts}`, `cy_frd_self_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/friends/request`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { recipientId: res.userId },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(400);
        expect(r.body.error).to.include('yourself');
      });
    });
  });

  /**
   * TC-FRD-06
   * Component/Function: sendRequest (duplicate request)
   * Description: Gửi lời mời kết bạn 2 lần → lần 2 trả về 400
   * Pre-conditions: A đã gửi request đến B
   * Input Data: POST /api/friends/request { recipientId: B.id } × 2
   * Expected Output: HTTP 400 + { error: 'Friend request already exists...' }
   */
  it('TC-FRD-06 | [Negative] Gửi lời mời kết bạn trùng lần 2 → 400', () => {
    apiUser(`cy_frd_a5_${ts}`, `cy_frd_a5_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b5_${ts}`, `cy_frd_b5_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(() => {
          // Gửi lại lần 2
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { recipientId: resB.userId },
            failOnStatusCode: false
          }).then(r => {
            expect(r.status).to.eq(400);
            expect(r.body.error).to.include('already exists');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-07
   * Component/Function: sendRequest (reverse direction duplicate)
   * Description: B gửi request đến A khi A đã gửi request đến B → 400 (reverse check)
   * Pre-conditions: A đã gửi request đến B
   * Input Data: POST /api/friends/request { recipientId: A.id } (token B)
   * Expected Output: HTTP 400 (existing record found in either direction)
   */
  it('TC-FRD-07 | [Negative] B gửi request đến A khi A đã gửi → 400 (reverse duplicate)', () => {
    apiUser(`cy_frd_a6_${ts}`, `cy_frd_a6_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b6_${ts}`, `cy_frd_b6_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(() => {
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { recipientId: resA.userId },
            failOnStatusCode: false
          }).then(r => {
            expect(r.status).to.eq(400);
            expect(r.body.error).to.include('already exists');
          });
        });
      });
    });
  });

  /**
   * TC-FRD-08
   * Component/Function: acceptRequest (wrong recipient)
   * Description: C cố chấp nhận request không dành cho mình → 404
   * Pre-conditions: A gửi request đến B, C không liên quan
   * Input Data: POST /api/friends/accept { requestId: <A→B request id> } (token C)
   * Expected Output: HTTP 404 + { error: 'Request not found' }
   */
  it('TC-FRD-08 | [Negative] C chấp nhận request không dành cho mình → 404', () => {
    apiUser(`cy_frd_a7_${ts}`, `cy_frd_a7_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b7_${ts}`, `cy_frd_b7_${ts}@st.utt.edu.vn`).then(resB => {
        apiUser(`cy_frd_c7_${ts}`, `cy_frd_c7_${ts}@st.utt.edu.vn`).then(resC => {
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { recipientId: resB.userId }
          }).then(reqRes => {
            // C cố accept request A→B
            cy.request({
              method: 'POST',
              url: `${API}/friends/accept`,
              headers: { Authorization: `Bearer ${resC.token}` },
              body: { requestId: reqRes.body.id },
              failOnStatusCode: false
            }).then(r => {
              expect(r.status).to.eq(404);
              expect(r.body.error).to.include('not found');
            });
          });
        });
      });
    });
  });

  /**
   * TC-FRD-09
   * Component/Function: acceptRequest (non-existent requestId)
   * Description: Accept request với ID không tồn tại → 404
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/friends/accept { requestId: '00000000-0000-0000-0000-000000000000' }
   * Expected Output: HTTP 404 + { error: 'Request not found' }
   */
  it('TC-FRD-09 | [Negative] acceptRequest với ID không tồn tại → 404', () => {
    apiUser(`cy_frd_a8_${ts}`, `cy_frd_a8_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/friends/accept`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { requestId: '00000000-0000-0000-0000-000000000000' },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(404);
        expect(r.body.error).to.include('not found');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-10
   * Component/Function: getFriends (empty)
   * Description: User mới chưa có bạn bè → GET /friends trả về []
   * Pre-conditions: User mới, chưa gửi/nhận request
   * Input Data: GET /api/friends
   * Expected Output: HTTP 200 + [] (mảng rỗng)
   */
  it('TC-FRD-10 | [Boundary] User mới chưa có bạn → getFriends trả về []', () => {
    apiUser(`cy_frd_empty_${ts}`, `cy_frd_empty_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/friends`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        expect(r.body).to.be.an('array').with.length(0);
      });
    });
  });

  /**
   * TC-FRD-11
   * Component/Function: getRequests (empty)
   * Description: User chưa nhận được lời mời nào → GET /friends/requests trả về []
   * Pre-conditions: User mới, chưa nhận request
   * Input Data: GET /api/friends/requests
   * Expected Output: HTTP 200 + []
   */
  it('TC-FRD-11 | [Boundary] User chưa nhận request nào → getRequests trả về []', () => {
    apiUser(`cy_frd_noreq_${ts}`, `cy_frd_noreq_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/friends/requests`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        expect(r.body).to.be.an('array').with.length(0);
      });
    });
  });

  /**
   * TC-FRD-12
   * Component/Function: getFriends (pending requests NOT included)
   * Description: Request đang pending không xuất hiện trong getFriends
   * Pre-conditions: A đã gửi request đến B nhưng chưa accept
   * Input Data: GET /api/friends (token A)
   * Expected Output: HTTP 200 + Array không chứa B (request chưa accepted)
   */
  it('TC-FRD-12 | [Boundary] Pending request không xuất hiện trong getFriends', () => {
    apiUser(`cy_frd_a9_${ts}`, `cy_frd_a9_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_b9_${ts}`, `cy_frd_b9_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/friends/request`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { recipientId: resB.userId }
        }).then(() => {
          cy.request({
            method: 'GET',
            url: `${API}/friends`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            const bInList = r.body.find(f => f && f.id === resB.userId);
            expect(bInList).to.be.undefined;
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FRD-13
   * Component/Function: getFriends (data isolation)
   * Description: A không thấy danh sách bạn bè của B trong kết quả của mình
   * Pre-conditions: B và C đã kết bạn; A không liên quan
   * Input Data: GET /api/friends (token A)
   * Expected Output: HTTP 200 + Array không chứa C (bạn của B, không phải bạn của A)
   */
  it('TC-FRD-13 | [Security] getFriends cách ly dữ liệu - A không thấy bạn của B', () => {
    apiUser(`cy_frd_iso_a_${ts}`, `cy_frd_iso_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_iso_b_${ts}`, `cy_frd_iso_b_${ts}@st.utt.edu.vn`).then(resB => {
        apiUser(`cy_frd_iso_c_${ts}`, `cy_frd_iso_c_${ts}@st.utt.edu.vn`).then(resC => {
          // B và C kết bạn
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resB.token}` },
            body: { recipientId: resC.userId }
          }).then(reqRes => {
            cy.request({
              method: 'POST',
              url: `${API}/friends/accept`,
              headers: { Authorization: `Bearer ${resC.token}` },
              body: { requestId: reqRes.body.id }
            }).then(() => {
              // A lấy danh sách bạn → không thấy C
              cy.request({
                method: 'GET',
                url: `${API}/friends`,
                headers: { Authorization: `Bearer ${resA.token}` }
              }).then(r => {
                expect(r.status).to.eq(200);
                const cInList = r.body.find(f => f && f.id === resC.userId);
                expect(cInList).to.be.undefined;
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-FRD-14
   * Component/Function: getRequests (data isolation)
   * Description: A không thấy request gửi đến B trong getRequests của mình
   * Pre-conditions: B nhận request từ C; A chưa nhận request nào
   * Input Data: GET /api/friends/requests (token A)
   * Expected Output: HTTP 200 + Array không chứa request của B
   */
  it('TC-FRD-14 | [Security] getRequests cách ly dữ liệu - A không thấy request của B', () => {
    apiUser(`cy_frd_ra_${ts}`, `cy_frd_ra_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_rb_${ts}`, `cy_frd_rb_${ts}@st.utt.edu.vn`).then(resB => {
        apiUser(`cy_frd_rc_${ts}`, `cy_frd_rc_${ts}@st.utt.edu.vn`).then(resC => {
          // C gửi request đến B
          cy.request({
            method: 'POST',
            url: `${API}/friends/request`,
            headers: { Authorization: `Bearer ${resC.token}` },
            body: { recipientId: resB.userId }
          }).then(() => {
            // A lấy requests → không thấy request của B
            cy.request({
              method: 'GET',
              url: `${API}/friends/requests`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(r => {
              expect(r.status).to.eq(200);
              const bRequest = r.body.find(req => req.Requester && req.Requester.id === resC.userId && req.recipientId === resB.userId);
              expect(bRequest).to.be.undefined;
            });
          });
        });
      });
    });
  });

  /**
   * TC-FRD-15
   * Component/Function: All friend endpoints (no token)
   * Description: Tất cả friend endpoints không có token → 401
   * Pre-conditions: N/A
   * Input Data: GET /api/friends (no auth)
   * Expected Output: HTTP 401
   */
  it('TC-FRD-15 | [Security] Tất cả friend endpoints không có token → 401', () => {
    cy.request({ method: 'GET', url: `${API}/friends`, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));

    cy.request({ method: 'GET', url: `${API}/friends/requests`, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));

    cy.request({ method: 'POST', url: `${API}/friends/request`, body: {}, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));

    cy.request({ method: 'POST', url: `${API}/friends/accept`, body: {}, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
  });

  /**
   * TC-FRD-16
   * Component/Function: getFriends (response fields)
   * Description: Dữ liệu bạn bè không lộ email hoặc password
   * Pre-conditions: A và B đã kết bạn
   * Input Data: GET /api/friends (token A)
   * Expected Output: HTTP 200 + users chỉ có fields: id, username, displayName, avatarUrl, online
   */
  it('TC-FRD-16 | [Security] getFriends không lộ email/password của bạn bè', () => {
    apiUser(`cy_frd_sec_a_${ts}`, `cy_frd_sec_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_frd_sec_b_${ts}`, `cy_frd_sec_b_${ts}@st.utt.edu.vn`).then(resB => {
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
            }).then(r => {
              expect(r.status).to.eq(200);
              const friend = r.body.find(f => f && f.id === resB.userId);
              expect(friend).to.not.be.undefined;
              expect(friend).to.not.have.property('email');
              expect(friend).to.not.have.property('password');
              expect(friend).to.have.property('username');
              expect(friend).to.have.property('online');
            });
          });
        });
      });
    });
  });
});
