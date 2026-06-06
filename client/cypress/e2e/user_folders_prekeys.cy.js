/**
 * MODULE: User Folders, PreKey Cleanup & User Listing
 * Controller: userController.js
 * Routes:
 *   GET    /api/users/folders        → getFolders
 *   POST   /api/users/folders        → updateFolders
 *   DELETE /api/users/opks           → clearPreKeys
 *   GET    /api/users                → getUsers (filter blocked)
 *   GET    /api/users/search         → searchUsers (by studentId, teacherId, phone, displayName)
 *   GET    /api/users/:userId/prekey-bundle → getPreKeyBundle (user not found)
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * - getFolders:        SELECT folders FROM users WHERE id=req.userId
 * - updateFolders:     folders must be array → update; if not array → 400
 * - clearPreKeys:      destroy all PreKeys for userId → success
 * - getUsers:          filters out blocked users; excludes self; attaches latestMessage
 * - searchUsers:       iLike on username/displayName/studentId/teacherId/phone; length<2 → []
 * - getPreKeyBundle:   block check → user not found → 404; marks OPK as used
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

describe('[Module: User Folders, PreKeys & Listing] Quản lý Folders, PreKey và Danh sách User', () => {
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FLD-01
   * Component/Function: getFolders
   * Description: Lấy danh sách folders khi user chưa tạo folder nào → trả về []
   * Pre-conditions: User mới đăng ký, chưa tạo folder
   * Input Data: GET /api/users/folders
   * Expected Output: HTTP 200 + [] (mảng rỗng)
   */
  it('TC-FLD-01 | [Positive] GET /folders khi chưa có folder → trả về []', () => {
    apiUser(`cy_fld_a_${ts}`, `cy_fld_a_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/users/folders`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        expect(r.body).to.be.an('array').with.length(0);
      });
    });
  });

  /**
   * TC-FLD-02
   * Component/Function: updateFolders & getFolders
   * Description: Tạo và lấy danh sách folders thành công
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/folders { folders: [{ id: '1', name: 'Work', userIds: [] }] }
   * Expected Output: HTTP 200 + { success: true, folders: [...] }; GET lại → cùng dữ liệu
   */
  it('TC-FLD-02 | [Positive] POST /folders tạo folder thành công, GET trả lại đúng dữ liệu', () => {
    const folderData = [
      { id: 'folder-1', name: 'Nhóm Học', userIds: [] },
      { id: 'folder-2', name: 'Gia Đình', userIds: [] }
    ];
    apiUser(`cy_fld_b_${ts}`, `cy_fld_b_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/folders`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { folders: folderData }
      }).then(postRes => {
        expect(postRes.status).to.eq(200);
        expect(postRes.body.success).to.be.true;
        expect(postRes.body.folders).to.deep.eq(folderData);

        // Xác nhận GET lại cũng trả đúng dữ liệu
        cy.request({
          method: 'GET',
          url: `${API}/users/folders`,
          headers: { Authorization: `Bearer ${res.token}` }
        }).then(getRes => {
          expect(getRes.status).to.eq(200);
          expect(getRes.body).to.deep.eq(folderData);
        });
      });
    });
  });

  /**
   * TC-FLD-03
   * Component/Function: updateFolders
   * Description: Cập nhật (ghi đè) toàn bộ danh sách folders thành công
   * Pre-conditions: User đã có folders
   * Input Data: POST /api/users/folders { folders: [{ id: '3', name: 'Updated' }] }
   * Expected Output: HTTP 200 + folders mới, GET lại không còn folder cũ
   */
  it('TC-FLD-03 | [Positive] POST /folders ghi đè toàn bộ folder cũ thành công', () => {
    const originalFolders = [{ id: 'old-1', name: 'Old Folder', userIds: [] }];
    const newFolders = [{ id: 'new-1', name: 'New Folder', userIds: [] }];

    apiUser(`cy_fld_c_${ts}`, `cy_fld_c_${ts}@st.utt.edu.vn`).then(res => {
      // Tạo folder cũ
      cy.request({
        method: 'POST',
        url: `${API}/users/folders`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { folders: originalFolders }
      }).then(() => {
        // Ghi đè bằng folder mới
        cy.request({
          method: 'POST',
          url: `${API}/users/folders`,
          headers: { Authorization: `Bearer ${res.token}` },
          body: { folders: newFolders }
        }).then(updateRes => {
          expect(updateRes.status).to.eq(200);
          expect(updateRes.body.folders).to.deep.eq(newFolders);

          // Xác nhận GET trả về folder mới, không còn folder cũ
          cy.request({
            method: 'GET',
            url: `${API}/users/folders`,
            headers: { Authorization: `Bearer ${res.token}` }
          }).then(getRes => {
            expect(getRes.body).to.deep.eq(newFolders);
            const oldFound = getRes.body.find(f => f.id === 'old-1');
            expect(oldFound).to.be.undefined;
          });
        });
      });
    });
  });

  /**
   * TC-FLD-04
   * Component/Function: clearPreKeys (DELETE /api/users/opks)
   * Description: Xóa toàn bộ PreKeys thành công khi logout
   * Pre-conditions: User đã upload PreKeys và OPKs
   * Input Data: DELETE /api/users/opks
   * Expected Output: HTTP 200 + { success: true }
   */
  it('TC-FLD-04 | [Positive] DELETE /opks xóa toàn bộ PreKeys thành công', () => {
    apiUser(`cy_fld_d_${ts}`, `cy_fld_d_${ts}@st.utt.edu.vn`).then(res => {
      // Upload PreKeys trước
      cy.request({
        method: 'POST',
        url: `${API}/users/prekeys`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {
          signedPreKey: { publicKey: 'spk_pub_key_data', signature: 'spk_signature_data' },
          oneTimePreKeys: [{ publicKey: 'opk1' }, { publicKey: 'opk2' }]
        }
      }).then(() => {
        // Xóa toàn bộ PreKeys
        cy.request({
          method: 'DELETE',
          url: `${API}/users/opks`,
          headers: { Authorization: `Bearer ${res.token}` }
        }).then(delRes => {
          expect(delRes.status).to.eq(200);
          expect(delRes.body.success).to.be.true;
        });
      });
    });
  });

  /**
   * TC-USR-01
   * Component/Function: getUsers (blocked filter)
   * Description: User bị block không xuất hiện trong danh sách GET /users
   * Pre-conditions: A đã block B
   * Input Data: GET /api/users (token A)
   * Expected Output: HTTP 200 + Array không chứa userId của B
   */
  it('TC-USR-01 | [Positive] getUsers không trả về user bị block', () => {
    apiUser(`cy_usr_a_${ts}`, `cy_usr_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_b_${ts}`, `cy_usr_b_${ts}@st.utt.edu.vn`).then(resB => {
        // A chặn B
        cy.request({
          method: 'POST',
          url: `${API}/users/block`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { userId: resB.userId }
        }).then(() => {
          cy.request({
            method: 'GET',
            url: `${API}/users`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            expect(r.body).to.be.an('array');
            const bInList = r.body.find(u => u.id === resB.userId);
            expect(bInList).to.be.undefined;
          });
        });
      });
    });
  });

  /**
   * TC-USR-02
   * Component/Function: getUsers (blocked by other side also hidden)
   * Description: User đã block mình cũng không xuất hiện trong danh sách
   * Pre-conditions: B đã block A; A lấy danh sách users
   * Input Data: GET /api/users (token A)
   * Expected Output: HTTP 200 + Array không chứa userId của B (người đã block mình)
   */
  it('TC-USR-02 | [Positive] getUsers không trả về user đã block mình (blocked-by)', () => {
    apiUser(`cy_usr_c_${ts}`, `cy_usr_c_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_d_${ts}`, `cy_usr_d_${ts}@st.utt.edu.vn`).then(resB => {
        // B chặn A
        cy.request({
          method: 'POST',
          url: `${API}/users/block`,
          headers: { Authorization: `Bearer ${resB.token}` },
          body: { userId: resA.userId }
        }).then(() => {
          // A lấy danh sách users → không nên thấy B
          cy.request({
            method: 'GET',
            url: `${API}/users`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            const bInList = r.body.find(u => u.id === resB.userId);
            expect(bInList).to.be.undefined;
          });
        });
      });
    });
  });

  /**
   * TC-USR-03
   * Component/Function: searchUsers (by studentId)
   * Description: Tìm kiếm người dùng theo studentId thành công
   * Pre-conditions: User B có studentId được set
   * Input Data: GET /api/users/search?query=<studentId của B>
   * Expected Output: HTTP 200 + Array chứa user B
   */
  it('TC-USR-03 | [Positive] searchUsers tìm thấy user theo studentId', () => {
    const studentId = `STU${ts}`;
    apiUser(`cy_usr_e_${ts}`, `cy_usr_e_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_f_${ts}`, `cy_usr_f_${ts}@st.utt.edu.vn`).then(resB => {
        // Set studentId cho B
        cy.request({
          method: 'PUT',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${resB.token}` },
          body: { studentId }
        }).then(() => {
          // A tìm kiếm theo studentId của B
          cy.request({
            method: 'GET',
            url: `${API}/users/search?query=${studentId}`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            expect(r.body).to.be.an('array').with.length.greaterThan(0);
            const found = r.body.find(u => u.id === resB.userId);
            expect(found).to.not.be.undefined;
            expect(found.studentId).to.eq(studentId);
          });
        });
      });
    });
  });

  /**
   * TC-USR-04
   * Component/Function: searchUsers (by displayName)
   * Description: Tìm kiếm người dùng theo displayName thành công
   * Pre-conditions: User B có displayName đặc biệt
   * Input Data: GET /api/users/search?query=<displayName của B>
   * Expected Output: HTTP 200 + Array chứa user B
   */
  it('TC-USR-04 | [Positive] searchUsers tìm thấy user theo displayName', () => {
    const displayName = `DisplayName_${ts}`;
    apiUser(`cy_usr_g_${ts}`, `cy_usr_g_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_h_${ts}`, `cy_usr_h_${ts}@st.utt.edu.vn`).then(resB => {
        // Set displayName cho B
        cy.request({
          method: 'PUT',
          url: `${API}/users/profile`,
          headers: { Authorization: `Bearer ${resB.token}` },
          body: { displayName }
        }).then(() => {
          cy.request({
            method: 'GET',
            url: `${API}/users/search?query=${displayName.substring(0, 10)}`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            expect(r.body).to.be.an('array').with.length.greaterThan(0);
            const found = r.body.find(u => u.id === resB.userId);
            expect(found).to.not.be.undefined;
          });
        });
      });
    });
  });

  /**
   * TC-USR-05
   * Component/Function: getPreKeyBundle (prekey bundle không tìm thấy user)
   * Description: Lấy prekey bundle của userId không tồn tại → 404
   * Pre-conditions: userId không có trong DB
   * Input Data: GET /api/users/00000000-0000-0000-0000-000000000000/prekey-bundle
   * Expected Output: HTTP 404 + { error: 'User not found' }
   */
  it('TC-USR-05 | [Positive] getPreKeyBundle user không tồn tại → 404', () => {
    apiUser(`cy_usr_i_${ts}`, `cy_usr_i_${ts}@st.utt.edu.vn`).then(resA => {
      cy.request({
        method: 'GET',
        url: `${API}/users/00000000-0000-0000-0000-000000000000/prekey-bundle`,
        headers: { Authorization: `Bearer ${resA.token}` },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(404);
        expect(r.body.error).to.include('not found');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FLD-05
   * Component/Function: updateFolders
   * Description: Gửi folders không phải array → 400 Bad Request
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/folders { folders: "not-an-array" }
   * Expected Output: HTTP 400 + { error: 'Folders must be an array' }
   */
  it('TC-FLD-05 | [Negative] POST /folders với folders không phải array → 400', () => {
    apiUser(`cy_fld_e_${ts}`, `cy_fld_e_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/folders`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { folders: 'not-an-array' },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(400);
        expect(r.body.error).to.include('array');
      });
    });
  });

  /**
   * TC-FLD-06
   * Component/Function: updateFolders
   * Description: Gửi folders là null → 400 Bad Request
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/folders { folders: null }
   * Expected Output: HTTP 400 + { error: 'Folders must be an array' }
   */
  it('TC-FLD-06 | [Negative] POST /folders với folders=null → 400', () => {
    apiUser(`cy_fld_f_${ts}`, `cy_fld_f_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/folders`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { folders: null },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(400);
        expect(r.body.error).to.include('array');
      });
    });
  });

  /**
   * TC-FLD-07
   * Component/Function: getFolders (unauthorized)
   * Description: Lấy folders không có token → 401
   * Pre-conditions: Không có Authorization header
   * Input Data: GET /api/users/folders
   * Expected Output: HTTP 401
   */
  it('TC-FLD-07 | [Negative] GET /folders không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'GET',
      url: `${API}/users/folders`,
      failOnStatusCode: false
    }).then(r => {
      expect(r.status).to.eq(401);
    });
  });

  /**
   * TC-USR-06
   * Component/Function: getUsers (unauthorized)
   * Description: GET /users không có token → 401
   * Pre-conditions: Không có Authorization header
   * Input Data: GET /api/users
   * Expected Output: HTTP 401
   */
  it('TC-USR-06 | [Negative] GET /users không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'GET',
      url: `${API}/users`,
      failOnStatusCode: false
    }).then(r => {
      expect(r.status).to.eq(401);
    });
  });

  /**
   * TC-USR-07
   * Component/Function: getPreKeyBundle (blocked user)
   * Description: Không thể lấy prekey bundle của user đã block mình → 403
   * Pre-conditions: B đã block A
   * Input Data: GET /api/users/:B.userId/prekey-bundle (token A)
   * Expected Output: HTTP 403 + { error: 'Truy cập bị từ chối (Blocking active)' }
   */
  it('TC-USR-07 | [Negative] getPreKeyBundle khi bị block → 403 Forbidden', () => {
    apiUser(`cy_usr_j_${ts}`, `cy_usr_j_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_k_${ts}`, `cy_usr_k_${ts}@st.utt.edu.vn`).then(resB => {
        // B block A
        cy.request({
          method: 'POST',
          url: `${API}/users/block`,
          headers: { Authorization: `Bearer ${resB.token}` },
          body: { userId: resA.userId }
        }).then(() => {
          // A cố lấy prekey bundle của B
          cy.request({
            method: 'GET',
            url: `${API}/users/${resB.userId}/prekey-bundle`,
            headers: { Authorization: `Bearer ${resA.token}` },
            failOnStatusCode: false
          }).then(r => {
            expect(r.status).to.eq(403);
            expect(r.body.error).to.include('Truy cập bị từ chối');
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-FLD-08
   * Component/Function: updateFolders
   * Description: Gửi mảng folders rỗng [] → xóa toàn bộ folders
   * Pre-conditions: User đã có folders
   * Input Data: POST /api/users/folders { folders: [] }
   * Expected Output: HTTP 200 + { success: true, folders: [] }; GET → []
   */
  it('TC-FLD-08 | [Boundary] POST /folders với mảng rỗng [] → xóa toàn bộ folders', () => {
    apiUser(`cy_fld_g_${ts}`, `cy_fld_g_${ts}@st.utt.edu.vn`).then(res => {
      // Tạo folder trước
      cy.request({
        method: 'POST',
        url: `${API}/users/folders`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { folders: [{ id: 'f1', name: 'Test', userIds: [] }] }
      }).then(() => {
        // Gửi mảng rỗng → xóa hết
        cy.request({
          method: 'POST',
          url: `${API}/users/folders`,
          headers: { Authorization: `Bearer ${res.token}` },
          body: { folders: [] }
        }).then(r => {
          expect(r.status).to.eq(200);
          expect(r.body.success).to.be.true;
          expect(r.body.folders).to.deep.eq([]);
        });
      });
    });
  });

  /**
   * TC-USR-08
   * Component/Function: searchUsers
   * Description: Tìm kiếm với đúng 1 ký tự (dưới ngưỡng min 2) → []
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=x
   * Expected Output: HTTP 200 + []
   */
  it('TC-USR-08 | [Boundary] searchUsers với 1 ký tự (< min 2) → trả về []', () => {
    apiUser(`cy_usr_l_${ts}`, `cy_usr_l_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=x`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        expect(r.body).to.deep.eq([]);
      });
    });
  });

  /**
   * TC-USR-09
   * Component/Function: searchUsers
   * Description: Tìm kiếm với query không tìm thấy user nào → []
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=zzzzz_nonexistent_12345
   * Expected Output: HTTP 200 + []
   */
  it('TC-USR-09 | [Boundary] searchUsers với query không match user nào → trả về []', () => {
    apiUser(`cy_usr_m_${ts}`, `cy_usr_m_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=zzzzz_nonexistent_9999`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        expect(r.body).to.deep.eq([]);
      });
    });
  });

  /**
   * TC-USR-10
   * Component/Function: getUsers
   * Description: GET /users trả về latestMessage cho các user đã nhắn tin
   * Pre-conditions: A và B đã nhắn tin với nhau, A lấy danh sách users
   * Input Data: GET /api/users (token A)
   * Expected Output: HTTP 200 + B trong danh sách có trường latestMessage không null
   */
  it('TC-USR-10 | [Boundary] GET /users trả về latestMessage cho user đã nhắn tin', () => {
    apiUser(`cy_usr_n_${ts}`, `cy_usr_n_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_o_${ts}`, `cy_usr_o_${ts}@st.utt.edu.vn`).then(resB => {
        // Tạo tin nhắn giữa A và B qua task
        cy.task('create1to1Message', {
          senderId: resA.userId,
          recipientId: resB.userId,
          encryptedContent: 'Latest message test'
        }).then(() => {
          cy.request({
            method: 'GET',
            url: `${API}/users`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            const userBEntry = r.body.find(u => u.id === resB.userId);
            expect(userBEntry).to.not.be.undefined;
            // latestMessage phải không null (có tin nhắn)
            expect(userBEntry.latestMessage).to.not.be.null;
            expect(userBEntry.latestMessage.encryptedContent).to.eq('Latest message test');
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-USR-11
   * Component/Function: searchUsers (isolation between users)
   * Description: User bị block không xuất hiện trong kết quả tìm kiếm
   * Pre-conditions: A đã block B
   * Input Data: GET /api/users/search?query=<B's username> (token A)
   * Expected Output: HTTP 200 + Array không chứa userId của B
   */
  it('TC-USR-11 | [Security] searchUsers không trả về user đã bị block', () => {
    const nameB = `cy_usr_p_${ts}`;
    apiUser(`cy_usr_pp_${ts}`, `cy_usr_pp_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(nameB, `${nameB}@st.utt.edu.vn`).then(resB => {
        // A chặn B
        cy.request({
          method: 'POST',
          url: `${API}/users/block`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { userId: resB.userId }
        }).then(() => {
          // A tìm kiếm B theo username
          cy.request({
            method: 'GET',
            url: `${API}/users/search?query=${nameB}`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            const bInResults = r.body.find(u => u.id === resB.userId);
            expect(bInResults).to.be.undefined;
          });
        });
      });
    });
  });

  /**
   * TC-USR-12
   * Component/Function: searchUsers (does not return self)
   * Description: Tìm kiếm với username của chính mình không trả về chính mình
   * Pre-conditions: User đã xác thực
   * Input Data: GET /api/users/search?query=<own username>
   * Expected Output: HTTP 200 + Array không chứa userId của chính mình
   */
  it('TC-USR-12 | [Security] searchUsers không trả về chính mình trong kết quả', () => {
    const myName = `cy_usr_q_${ts}`;
    apiUser(myName, `${myName}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/users/search?query=${myName}`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        const selfInResults = r.body.find(u => u.id === res.userId);
        expect(selfInResults).to.be.undefined;
      });
    });
  });

  /**
   * TC-USR-13
   * Component/Function: clearPreKeys (no token)
   * Description: Xóa PreKeys không có token → 401
   * Pre-conditions: Không có Authorization header
   * Input Data: DELETE /api/users/opks
   * Expected Output: HTTP 401
   */
  it('TC-USR-13 | [Security] DELETE /opks không có token → 401 Unauthorized', () => {
    cy.request({
      method: 'DELETE',
      url: `${API}/users/opks`,
      failOnStatusCode: false
    }).then(r => {
      expect(r.status).to.eq(401);
    });
  });

  /**
   * TC-USR-14
   * Component/Function: getPreKeyBundle (OPK mark-as-used after fetch)
   * Description: OPK bị đánh dấu đã dùng sau khi lấy prekey bundle lần đầu,
   *              lần thứ 2 oneTimePreKey sẽ là null (không còn OPK chưa dùng)
   * Pre-conditions: B có đúng 1 OPK, A lấy bundle 2 lần
   * Input Data: GET /api/users/:B/prekey-bundle × 2 (token A)
   * Expected Output: Lần 1: oneTimePreKey != null; Lần 2: oneTimePreKey = null
   */
  it('TC-USR-14 | [Security] OPK bị đánh used sau khi lấy bundle → lần 2 oneTimePreKey=null', () => {
    apiUser(`cy_usr_r_${ts}`, `cy_usr_r_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_usr_s_${ts}`, `cy_usr_s_${ts}@st.utt.edu.vn`).then(resB => {
        // B upload đúng 1 OPK
        cy.request({
          method: 'POST',
          url: `${API}/users/prekeys`,
          headers: { Authorization: `Bearer ${resB.token}` },
          body: {
            signedPreKey: { publicKey: 'spk_pub', signature: 'spk_sig' },
            oneTimePreKeys: [{ publicKey: 'single_opk' }]
          }
        }).then(() => {
          // A lấy bundle lần 1 → có OPK
          cy.request({
            method: 'GET',
            url: `${API}/users/${resB.userId}/prekey-bundle`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(r1 => {
            expect(r1.status).to.eq(200);
            expect(r1.body.oneTimePreKey).to.not.be.null;
            expect(r1.body.oneTimePreKey.publicKey).to.eq('single_opk');

            // A lấy bundle lần 2 → OPK đã dùng, không còn OPK mới
            cy.request({
              method: 'GET',
              url: `${API}/users/${resB.userId}/prekey-bundle`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(r2 => {
              expect(r2.status).to.eq(200);
              expect(r2.body.oneTimePreKey).to.be.null;
            });
          });
        });
      });
    });
  });
});
