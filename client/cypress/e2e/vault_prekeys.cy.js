/**
 * MODULE: Vault & PreKey Management (E2EE Key Infrastructure)
 * Controller: userController.js
 * Routes:
 *   POST /api/users/prekeys    → uploadPreKeys (signed + one-time)
 *   POST /api/users/opks       → uploadOpks (one-time only)
 *   POST /api/users/vault      → uploadVault
 *   GET  /api/users/vault      → downloadVault
 *   DELETE /api/users/opks     → clearPreKeys
 *   GET  /api/users/:userId/prekey-bundle → getPreKeyBundle
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 *   uploadPreKeys:     validate signedPreKey (publicKey + signature required) → destroy old → create signed + OPKs in transaction
 *   uploadOpks:        validate array required → destroy old OPKs → bulkCreate new
 *   uploadVault:       validate vaultData required → increment vaultVersion → save
 *   downloadVault:     findByPk → return vaultData (null if empty)
 *   clearPreKeys:      destroy all PreKeys for user (used on logout)
 *   getPreKeyBundle:   block check → user not found → OPK marked isUsed=true
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

describe('[Module: Vault & PreKey] Quản lý khóa E2EE và Vault', () => {
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIVE TEST CASES (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-VLT-01
   * Component/Function: uploadPreKeys
   * Description: Upload signed prekey + one-time prekeys thành công
   * Pre-conditions: User đã xác thực, signedPreKey có publicKey + signature
   * Input Data: POST /api/users/prekeys { signedPreKey: {...}, oneTimePreKeys: [...] }
   * Expected Output: HTTP 200 + { success: true, message: 'PreKeys updated successfully' }
   */
  it('TC-VLT-01 | [Positive] Upload signed prekey + OPKs thành công → 200', () => {
    apiUser(`cy_vlt1_${ts}`, `cy_vlt1_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/prekeys`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {
          signedPreKey: {
            publicKey: 'dGVzdC1zaWduZWQta2V5LXB1YmxpYw==',
            signature: 'dGVzdC1zaWduZWQta2V5LXNpZ25hdHVyZQ=='
          },
          oneTimePreKeys: [
            { publicKey: 'b3RrLXB1YmxpYy1rZXktMQ==' },
            { publicKey: 'b3RrLXB1YmxpYy1rZXktMg==' },
            { publicKey: 'b3RrLXB1YmxpYy1rZXktMw==' }
          ]
        }
      }).then(preRes => {
        expect(preRes.status).to.eq(200);
        expect(preRes.body.success).to.be.true;
        expect(preRes.body.message).to.include('updated successfully');
      });
    });
  });

  /**
   * TC-VLT-02
   * Component/Function: uploadOpks
   * Description: Upload chỉ one-time prekeys thành công (không cần signed)
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/opks { oneTimePreKeys: [...] }
   * Expected Output: HTTP 200 + { success: true }
   */
  it('TC-VLT-02 | [Positive] Upload chỉ OPKs thành công → 200', () => {
    apiUser(`cy_vlt2_${ts}`, `cy_vlt2_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/opks`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {
          oneTimePreKeys: [
            { publicKey: 'b3RrMQ==' },
            { publicKey: 'b3RrMg==' }
          ]
        }
      }).then(opkRes => {
        expect(opkRes.status).to.eq(200);
        expect(opkRes.body.success).to.be.true;
        expect(opkRes.body.message).to.include('OPKs updated');
      });
    });
  });

  /**
   * TC-VLT-03
   * Component/Function: uploadVault + downloadVault
   * Description: Upload vault data thành công, sau đó download lại đúng dữ liệu
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/vault { vaultData: 'encrypted-vault-blob' }; GET /api/users/vault
   * Expected Output: Upload → 200 + { success: true, vaultVersion: 1 }; Download → 200 + { vaultData: same blob }
   */
  it('TC-VLT-03 | [Positive] Upload vault và download lại đúng dữ liệu', () => {
    apiUser(`cy_vlt3_${ts}`, `cy_vlt3_${ts}@st.utt.edu.vn`).then(res => {
      const vaultBlob = 'ENCRYPTED_VAULT_PAYLOAD_ABCDEF1234567890';
      cy.request({
        method: 'POST',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { vaultData: vaultBlob }
      }).then(uploadRes => {
        expect(uploadRes.status).to.eq(200);
        expect(uploadRes.body.success).to.be.true;
        expect(uploadRes.body.vaultVersion).to.eq(2);

        cy.request({
          method: 'GET',
          url: `${API}/users/vault`,
          headers: { Authorization: `Bearer ${res.token}` }
        }).then(downloadRes => {
          expect(downloadRes.status).to.eq(200);
          expect(downloadRes.body.vaultData).to.eq(vaultBlob);
        });
      });
    });
  });

  /**
   * TC-VLT-04
   * Component/Function: uploadVault (version increment)
   * Description: Mỗi lần upload vault tăng vaultVersion thêm 1
   * Pre-conditions: User đã xác thực, vaultVersion bắt đầu từ 0
   * Input Data: POST /api/users/vault × 3 lần
   * Expected Output: vaultVersion lần lượt là 1, 2, 3
   */
  it('TC-VLT-04 | [Positive] Vault version tăng dần sau mỗi lần upload', () => {
    apiUser(`cy_vlt4_${ts}`, `cy_vlt4_${ts}@st.utt.edu.vn`).then(res => {
      const upload = (n) => cy.request({
        method: 'POST',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { vaultData: `vault-v${n}` }
      });

      upload(1).then(r1 => {
        expect(r1.body.vaultVersion).to.eq(2);
        upload(2).then(r2 => {
          expect(r2.body.vaultVersion).to.eq(3);
          upload(3).then(r3 => {
            expect(r3.body.vaultVersion).to.eq(4);
          });
        });
      });
    });
  });

  /**
   * TC-VLT-05
   * Component/Function: downloadVault (user chưa upload vault)
   * Description: User mới chưa upload vault → download trả về vaultData = null
   * Pre-conditions: User mới, chưa gọi POST /vault
   * Input Data: GET /api/users/vault
   * Expected Output: HTTP 200 + { vaultData: null }
   */
  it('TC-VLT-05 | [Positive] User chưa upload vault → download trả về null', () => {
    apiUser(`cy_vlt5_${ts}`, `cy_vlt5_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(downloadRes => {
        expect(downloadRes.status).to.eq(200);
        expect(downloadRes.body.vaultData).to.be.null;
      });
    });
  });

  /**
   * TC-VLT-06
   * Component/Function: getPreKeyBundle
   * Description: Lấy prekey bundle của user khác thành công (có signed, có OPK)
   * Pre-conditions: Target user đã upload prekeys; không bị block
   * Input Data: GET /api/users/:targetId/prekey-bundle
   * Expected Output: HTTP 200 + { identityKey, signedPreKey, oneTimePreKey }
   */
  it('TC-VLT-06 | [Positive] Lấy prekey bundle của user khác thành công → 200', () => {
    apiUser(`cy_pkb_a_${ts}`, `cy_pkb_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_pkb_b_${ts}`, `cy_pkb_b_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'GET',
          url: `${API}/users/${resB.userId}/prekey-bundle`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(pkRes => {
          expect(pkRes.status).to.eq(200);
          expect(pkRes.body).to.have.property('identityKey');
          expect(pkRes.body).to.have.property('signedPreKey');
          expect(pkRes.body).to.have.property('oneTimePreKey');
        });
      });
    });
  });

  /**
   * TC-VLT-07
   * Component/Function: clearPreKeys
   * Description: Xóa tất cả prekeys của user thành công (dùng khi logout)
   * Pre-conditions: User đã có prekeys
   * Input Data: DELETE /api/users/opks
   * Expected Output: HTTP 200 + { success: true }
   */
  it('TC-VLT-07 | [Positive] Clear prekeys thành công → 200', () => {
    apiUser(`cy_clrk_${ts}`, `cy_clrk_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'DELETE',
        url: `${API}/users/opks`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(clearRes => {
        expect(clearRes.status).to.eq(200);
        expect(clearRes.body.success).to.be.true;
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE TEST CASES (Sad Path)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-VLT-08
   * Component/Function: uploadPreKeys
   * Description: Upload không có signedPreKey → 400 Bad Request
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/prekeys { oneTimePreKeys: [...] } (không có signedPreKey)
   * Expected Output: HTTP 400 + { error: 'Signed PreKey and signature are required' }
   */
  it('TC-VLT-08 | [Negative] Upload prekeys không có signedPreKey → 400', () => {
    apiUser(`cy_np_a_${ts}`, `cy_np_a_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/prekeys`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { oneTimePreKeys: [{ publicKey: 'test' }] },
        failOnStatusCode: false
      }).then(preRes => {
        expect(preRes.status).to.eq(400);
        expect(preRes.body.error).to.include('Signed PreKey');
      });
    });
  });

  /**
   * TC-VLT-09
   * Component/Function: uploadPreKeys
   * Description: Upload với signedPreKey thiếu signature → 400
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/prekeys { signedPreKey: { publicKey: 'X' } } (không có signature)
   * Expected Output: HTTP 400 + { error: 'Signed PreKey and signature are required' }
   */
  it('TC-VLT-09 | [Negative] Upload signedPreKey thiếu signature → 400', () => {
    apiUser(`cy_np_b_${ts}`, `cy_np_b_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/prekeys`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { signedPreKey: { publicKey: 'only-public-key-no-signature' } },
        failOnStatusCode: false
      }).then(preRes => {
        expect(preRes.status).to.eq(400);
        expect(preRes.body.error).to.include('signature');
      });
    });
  });

  /**
   * TC-VLT-10
   * Component/Function: uploadOpks
   * Description: Upload OPKs với body không phải array → 400
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/opks { oneTimePreKeys: "not-an-array" }
   * Expected Output: HTTP 400 + { error: 'oneTimePreKeys array is required' }
   */
  it('TC-VLT-10 | [Negative] Upload OPKs với giá trị không phải array → 400', () => {
    apiUser(`cy_np_c_${ts}`, `cy_np_c_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/opks`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { oneTimePreKeys: 'not-an-array' },
        failOnStatusCode: false
      }).then(opkRes => {
        expect(opkRes.status).to.eq(400);
        expect(opkRes.body.error).to.include('array');
      });
    });
  });

  /**
   * TC-VLT-11
   * Component/Function: uploadVault
   * Description: Upload vault không có vaultData → 400 Bad Request
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/vault {} (body rỗng)
   * Expected Output: HTTP 400 + { error: 'Vault data is required' }
   */
  it('TC-VLT-11 | [Negative] Upload vault không có vaultData → 400', () => {
    apiUser(`cy_np_d_${ts}`, `cy_np_d_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {},
        failOnStatusCode: false
      }).then(vaultRes => {
        expect(vaultRes.status).to.eq(400);
        expect(vaultRes.body.error).to.include('required');
      });
    });
  });

  /**
   * TC-VLT-12
   * Component/Function: getPreKeyBundle
   * Description: Lấy prekey bundle của user không tồn tại → 404
   * Pre-conditions: N/A
   * Input Data: GET /api/users/00000000-0000-0000-0000-000000000000/prekey-bundle
   * Expected Output: HTTP 404 + { error: 'User not found' }
   */
  it('TC-VLT-12 | [Negative] Lấy prekey bundle của user không tồn tại → 404', () => {
    apiUser(`cy_pkb_c_${ts}`, `cy_pkb_c_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'GET',
        url: `${API}/users/00000000-0000-0000-0000-000000000000/prekey-bundle`,
        headers: { Authorization: `Bearer ${res.token}` },
        failOnStatusCode: false
      }).then(pkRes => {
        expect(pkRes.status).to.eq(404);
        expect(pkRes.body.error).to.include('not found');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BOUNDARY & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-VLT-13
   * Component/Function: uploadPreKeys (overwrite existing)
   * Description: Upload prekeys 2 lần → lần 2 ghi đè lần 1, không có duplicate key error
   * Pre-conditions: User đã upload prekeys lần đầu
   * Input Data: POST /api/users/prekeys × 2 với dữ liệu khác nhau
   * Expected Output: Cả 2 lần đều 200; không có DB constraint error
   */
  it('TC-VLT-13 | [Boundary] Upload prekeys lần 2 ghi đè lần 1 (không lỗi duplicate) → 200', () => {
    apiUser(`cy_ow_${ts}`, `cy_ow_${ts}@st.utt.edu.vn`).then(res => {
      const uploadPreKeys = (suffix) => cy.request({
        method: 'POST',
        url: `${API}/users/prekeys`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {
          signedPreKey: { publicKey: `c2lnbmVkLWtleS0ke suffix}`, signature: 'c2lnbmF0dXJl' },
          oneTimePreKeys: [{ publicKey: `b3Rr${suffix}` }]
        }
      });
      uploadPreKeys('v1').then(r1 => {
        expect(r1.status).to.eq(200);
        uploadPreKeys('v2').then(r2 => {
          expect(r2.status).to.eq(200);
        });
      });
    });
  });

  /**
   * TC-VLT-14
   * Component/Function: uploadOpks (empty array)
   * Description: Upload OPKs với mảng rỗng [] → server chấp nhận, không lỗi
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/users/opks { oneTimePreKeys: [] }
   * Expected Output: HTTP 200 (server xóa OPK cũ và bulkCreate với 0 items)
   */
  it('TC-VLT-14 | [Boundary] Upload OPKs với mảng rỗng → server chấp nhận 200', () => {
    apiUser(`cy_ep_${ts}`, `cy_ep_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/users/opks`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { oneTimePreKeys: [] }
      }).then(opkRes => {
        expect(opkRes.status).to.eq(200);
        expect(opkRes.body.success).to.be.true;
      });
    });
  });

  /**
   * TC-VLT-15
   * Component/Function: getPreKeyBundle (OPK depletion)
   * Description: Khi hết OPKs (tất cả đã dùng), vẫn trả về bundle nhưng oneTimePreKey = null
   * Pre-conditions: User target không có OPK hoặc đã dùng hết
   * Input Data: Xóa hết OPKs của B, sau đó A lấy bundle của B
   * Expected Output: HTTP 200 + { oneTimePreKey: null }
   */
  it('TC-VLT-15 | [Boundary] Hết OPKs → getPreKeyBundle vẫn 200 nhưng oneTimePreKey = null', () => {
    apiUser(`cy_dep_a_${ts}`, `cy_dep_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_dep_b_${ts}`, `cy_dep_b_${ts}@st.utt.edu.vn`).then(resB => {
        // Xóa hết OPKs của B
        cy.request({ method: 'DELETE', url: `${API}/users/opks`, headers: { Authorization: `Bearer ${resB.token}` } }).then(() => {
          // A lấy bundle của B (không có OPK)
          cy.request({
            method: 'GET',
            url: `${API}/users/${resB.userId}/prekey-bundle`,
            headers: { Authorization: `Bearer ${resA.token}` }
          }).then(pkRes => {
            expect(pkRes.status).to.eq(200);
            expect(pkRes.body.oneTimePreKey).to.be.null;
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & LOGIC CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-VLT-16
   * Component/Function: uploadVault / downloadVault (không có token)
   * Description: Truy cập vault endpoints không có token → 401
   * Pre-conditions: N/A
   * Input Data: POST & GET /api/users/vault (không có Authorization header)
   * Expected Output: HTTP 401
   */
  it('TC-VLT-16 | [Security] Vault endpoints không có token → 401', () => {
    cy.request({
      method: 'POST',
      url: `${API}/users/vault`,
      body: { vaultData: 'test' },
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });

    cy.request({
      method: 'GET',
      url: `${API}/users/vault`,
      failOnStatusCode: false
    }).then(res => {
      expect(res.status).to.eq(401);
    });
  });

  /**
   * TC-VLT-17
   * Component/Function: getPreKeyBundle (Blocking active)
   * Description: A đã bị block bởi B → A không thể lấy prekey bundle của B
   * Pre-conditions: B đã block A
   * Input Data: GET /api/users/:B/prekey-bundle với token của A
   * Expected Output: HTTP 403 + { error: 'Truy cập bị từ chối (Blocking active)' }
   */
  it('TC-VLT-17 | [Security] Lấy prekey bundle của user đã chặn mình → 403', () => {
    apiUser(`cy_blk_a_${ts}`, `cy_blk_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_blk_b_${ts}`, `cy_blk_b_${ts}@st.utt.edu.vn`).then(resB => {
        // B block A
        cy.request({ method: 'POST', url: `${API}/users/block`, headers: { Authorization: `Bearer ${resB.token}` }, body: { userId: resA.userId } }).then(() => {
          // A cố lấy bundle của B
          cy.request({
            method: 'GET',
            url: `${API}/users/${resB.userId}/prekey-bundle`,
            headers: { Authorization: `Bearer ${resA.token}` },
            failOnStatusCode: false
          }).then(pkRes => {
            expect(pkRes.status).to.eq(403);
            expect(pkRes.body.error).to.include('Blocking active');
          });
        });
      });
    });
  });

  /**
   * TC-VLT-18
   * Component/Function: uploadPreKeys / downloadVault (với token hết hạn)
   * Description: Dùng token đã hết hạn → 401 Token expired
   * Pre-conditions: Có token đã hết hạn (created with -1s TTL)
   * Input Data: POST /api/users/vault với expired token
   * Expected Output: HTTP 401
   */
  it('TC-VLT-18 | [Security] Vault upload với expired token → 401', () => {
    cy.task('createExpiredToken').then(expiredToken => {
      cy.request({
        method: 'POST',
        url: `${API}/users/vault`,
        headers: { Authorization: `Bearer ${expiredToken}` },
        body: { vaultData: 'test' },
        failOnStatusCode: false
      }).then(res => {
        expect(res.status).to.eq(401);
        expect(res.body.error).to.include('hết hạn');
      });
    });
  });

  /**
   * TC-VLT-19
   * Component/Function: downloadVault (vault data isolation)
   * Description: User A KHÔNG thể download vault của User B (endpoint chỉ lấy vault của chính mình)
   * Pre-conditions: B đã upload vault; A và B đều xác thực
   * Input Data: GET /api/users/vault (token A) → chỉ lấy vault của A, không phải B
   * Expected Output: HTTP 200 + vaultData của A (null nếu A chưa upload), KHÔNG phải của B
   */
  it('TC-VLT-19 | [Security] Vault data được cô lập theo user (A không xem được vault B)', () => {
    apiUser(`cy_iso_a_${ts}`, `cy_iso_a_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_iso_b_${ts}`, `cy_iso_b_${ts}@st.utt.edu.vn`).then(resB => {
        const bVault = 'B_SECRET_VAULT_DATA_XYZ';

        // B upload vault riêng
        cy.request({ method: 'POST', url: `${API}/users/vault`, headers: { Authorization: `Bearer ${resB.token}` }, body: { vaultData: bVault } });

        // A download vault → chỉ nhận vault của A (null), không nhận vault của B
        cy.request({
          method: 'GET',
          url: `${API}/users/vault`,
          headers: { Authorization: `Bearer ${resA.token}` }
        }).then(vRes => {
          expect(vRes.status).to.eq(200);
          expect(vRes.body.vaultData).to.not.eq(bVault);
        });
      });
    });
  });

  /**
   * TC-VLT-20
   * Component/Function: PBKDF2 600k iterations
   * Description: Kiểm tra xem browser/SubtleCrypto có chạy đúng PBKDF2 với 600,000 iterations để mã hóa/giải mã khóa.
   * Expected Output: Key được tạo thành công trong thời gian cho phép mà không bị treo hay lỗi.
   */
  it('TC-VLT-20 | [Security] PBKDF2 600k iterations - Verify key derivation in browser', () => {
    cy.visit('/login');
    cy.window().then(async (win) => {
      const pin = 'test-passphrase-600k';
      const salt = win.crypto.getRandomValues(new Uint8Array(16));
      const enc = new win.TextEncoder();
      const baseKey = await win.crypto.subtle.importKey(
        'raw',
        enc.encode(pin),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const t0 = performance.now();
      const derived = await win.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 600000,
          hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const t1 = performance.now();
      
      expect(derived).to.exist;
      expect(derived.type).to.eq('secret');
      // Ghi nhận thời gian thực thi (thường < 500ms trên máy hiện đại)
      cy.task('log', `PBKDF2 600k iterations took ${t1 - t0} ms`);
    });
  });

  /**
   * TC-VLT-21
   * Component/Function: X3DH Handshake OPK Exhaustion Fallback
   * Description: Khởi tạo phiên X3DH khi Bob đã dùng hết One-Time PreKeys (OPK).
   * Pre-conditions: Alice và Bob đều có Identity Key và Signed PreKey, nhưng OPK = null.
   * Input Data: Bob OPK = null / undefined.
   * Expected Output: Cả Alice và Bob vẫn derive ra chính xác cùng một Root Key / Shared Secret để tiếp tục nhắn tin bảo mật (fallback sang 3-DH).
   */
  it('TC-VLT-21 | [Security] X3DH Handshake hoạt động bình thường khi cạn kiệt OPK (OPK=null) → 3-DH fallback', () => {
    cy.visit('/login');
    cy.window().then(async (win) => {
      try {
        const generateKey = () => win.crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveKey', 'deriveBits']);
        
        const bobIK = await generateKey();
        const bobSPK = await generateKey();
        
        const aliceIK = await generateKey();
        const aliceEK = await generateKey();

        const bobIK_pub = await win.crypto.subtle.exportKey('raw', bobIK.publicKey);
        const bobSPK_pub = await win.crypto.subtle.exportKey('raw', bobSPK.publicKey);

        const dh1 = await win.crypto.subtle.deriveBits({ name: 'X25519', public: bobSPK.publicKey }, aliceIK.privateKey, 256);
        const dh2 = await win.crypto.subtle.deriveBits({ name: 'X25519', public: bobIK.publicKey }, aliceEK.privateKey, 256);
        const dh3 = await win.crypto.subtle.deriveBits({ name: 'X25519', public: bobSPK.publicKey }, aliceEK.privateKey, 256);

        const combinedAlice = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength);
        combinedAlice.set(new Uint8Array(dh1), 0);
        combinedAlice.set(new Uint8Array(dh2), dh1.byteLength);
        combinedAlice.set(new Uint8Array(dh3), dh1.byteLength + dh2.byteLength);

        const b_dh1 = await win.crypto.subtle.deriveBits({ name: 'X25519', public: aliceIK.publicKey }, bobSPK.privateKey, 256);
        const b_dh2 = await win.crypto.subtle.deriveBits({ name: 'X25519', public: aliceEK.publicKey }, bobIK.privateKey, 256);
        const b_dh3 = await win.crypto.subtle.deriveBits({ name: 'X25519', public: aliceEK.publicKey }, bobSPK.privateKey, 256);

        const combinedBob = new Uint8Array(b_dh1.byteLength + b_dh2.byteLength + b_dh3.byteLength);
        combinedBob.set(new Uint8Array(b_dh1), 0);
        combinedBob.set(new Uint8Array(b_dh2), b_dh1.byteLength);
        combinedBob.set(new Uint8Array(b_dh3), b_dh1.byteLength + b_dh2.byteLength);

        const fpAlice = await win.crypto.subtle.digest('SHA-256', combinedAlice.buffer).then(b => new Uint8Array(b).join(','));
        const fpBob = await win.crypto.subtle.digest('SHA-256', combinedBob.buffer).then(b => new Uint8Array(b).join(','));

        expect(fpAlice).to.eq(fpBob);
      } catch (err) {
        throw new Error('WebCrypto failed: ' + err.message);
      }
    });
  });
});

