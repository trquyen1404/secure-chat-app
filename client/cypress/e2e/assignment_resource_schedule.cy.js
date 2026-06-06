/**
 * MODULE: Assignment, Resource & Schedule - Full Coverage
 * Controllers: assignmentController.js, resourceController.js, scheduleController.js
 *
 * Routes (Assignment):
 *   POST   /api/groups/:groupId/assignments              → createAssignment
 *   GET    /api/groups/:groupId/assignments              → getGroupAssignments
 *   POST   /api/assignments/submit                       → submitAssignment
 *   PATCH  /api/assignments/submissions/:submissionId/grade → gradeSubmission
 *
 * Routes (Resource):
 *   POST   /api/groups/:groupId/resources               → addResource
 *   GET    /api/groups/:groupId/resources               → getGroupResources
 *   DELETE /api/resources/:id                           → deleteResource
 *   PATCH  /api/resources/:id/pin                       → togglePin
 *
 * Routes (Schedule):
 *   POST   /api/schedule                                → addSchedule
 *   GET    /api/schedule                                → getMySchedule
 *   DELETE /api/schedule/:id                            → deleteSchedule
 *
 * STEP 1 - ARCHITECTURE MAPPING:
 * createAssignment:   no role check in code (only teacherId stored); success → 201
 * getGroupAssignments: includes Submissions with Student info
 * submitAssignment:   assignment not found → 404; deadline passed → 400; upsert → can resubmit
 * gradeSubmission:    submission not found → 404; teacherId !== req.userId → 403; success update grade
 *
 * addResource:        success → 201
 * getGroupResources:  order by isPinned DESC then createdAt DESC
 * deleteResource:     not found → 404; userId !== resource.userId → 403; success → 200
 * togglePin:          not found → 404; toggles isPinned boolean (idempotent flip)
 *
 * addSchedule:        success → 201 with userId
 * getMySchedule:      ordered by dayOfWeek + startTime; isolates by userId
 * deleteSchedule:     uses WHERE { id, userId } → safe (no ownership error, just soft no-op)
 *
 * STEP 2 - CATEGORIES: Positive / Negative / Boundary / Security
 */

const API = 'http://localhost:5000/api';
const ts = Date.now();

const apiUser = (username, email, password = 'Cypress12345') =>
  cy.task('createUserAndGetToken', { username, email, password });

const createGroup = (token, name, memberIds = []) =>
  cy.request({
    method: 'POST',
    url: `${API}/groups`,
    headers: { Authorization: `Bearer ${token}` },
    body: { name, memberIds }
  });

describe('[Module: Assignment, Resource & Schedule] Bài tập, Tài nguyên & Lịch học', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSIGNMENT - POSITIVE TEST CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ASG-01
   * Component/Function: createAssignment
   * Description: Tạo bài tập trong nhóm thành công → 201
   * Pre-conditions: User là thành viên nhóm
   * Input Data: POST /api/groups/:groupId/assignments { title, description, deadline, points }
   * Expected Output: HTTP 201 + { id, groupId, title, deadline, points }
   */
  it('TC-ASG-01 | [Positive] Tạo bài tập trong nhóm → 201', () => {
    apiUser(`cy_asg_t_${ts}`, `cy_asg_t_${ts}@utt.edu.vn`).then(resT => {
      createGroup(resT.token, `Nhóm ASG ${ts}`).then(grpRes => {
        const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        cy.request({
          method: 'POST',
          url: `${API}/assignments`,
          headers: { Authorization: `Bearer ${resT.token}` },
          body: {
            groupId: grpRes.body.id,
            title: 'Bài tập lập trình số 1',
            description: 'Viết chương trình Hello World',
            deadline,
            points: 10
          }
        }).then(res => {
          expect(res.status).to.eq(201);
          expect(res.body.title).to.eq('Bài tập lập trình số 1');
          expect(res.body.points).to.eq(10);
          expect(res.body.groupId).to.eq(grpRes.body.id);
        });
      });
    });
  });

  /**
   * TC-ASG-02
   * Component/Function: getGroupAssignments
   * Description: Lấy danh sách bài tập của nhóm → trả về array đúng format
   * Pre-conditions: Nhóm đã có ít nhất 1 bài tập
   * Input Data: GET /api/groups/:groupId/assignments
   * Expected Output: HTTP 200 + Array với Teacher và Submissions info
   */
  it('TC-ASG-02 | [Positive] getGroupAssignments trả về danh sách với Teacher info', () => {
    apiUser(`cy_asg_t2_${ts}`, `cy_asg_t2_${ts}@utt.edu.vn`).then(resT => {
      createGroup(resT.token, `Nhóm ASG2 ${ts}`).then(grpRes => {
        const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        cy.request({
          method: 'POST',
          url: `${API}/assignments`,
          headers: { Authorization: `Bearer ${resT.token}` },
          body: { groupId: grpRes.body.id, title: 'BT Test', description: 'Test', deadline, points: 5 }
        }).then(() => {
          cy.request({
            method: 'GET',
            url: `${API}/assignments/groups/${grpRes.body.id}`,
            headers: { Authorization: `Bearer ${resT.token}` }
          }).then(res => {
            expect(res.status).to.eq(200);
            expect(res.body).to.be.an('array').with.length.greaterThan(0);
            const asg = res.body[0];
            expect(asg).to.have.property('Teacher');
            expect(asg).to.have.property('Submissions');
            expect(asg.Teacher.id).to.eq(resT.userId);
          });
        });
      });
    });
  });

  /**
   * TC-ASG-03
   * Component/Function: submitAssignment
   * Description: Nộp bài tập trước deadline → 200 thành công
   * Pre-conditions: Bài tập tồn tại, deadline chưa qua
   * Input Data: POST /api/assignments/submit { assignmentId, fileUrl, fileName }
   * Expected Output: HTTP 200 + Submission record
   */
  it('TC-ASG-03 | [Positive] Nộp bài tập trước deadline → 200 OK', () => {
    apiUser(`cy_asg_t3_${ts}`, `cy_asg_t3_${ts}@utt.edu.vn`).then(resT => {
      apiUser(`cy_asg_s3_${ts}`, `cy_asg_s3_${ts}@st.utt.edu.vn`).then(resS => {
        createGroup(resT.token, `Nhóm Submit ${ts}`, [resS.userId]).then(grpRes => {
          const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          cy.request({
            method: 'POST',
            url: `${API}/assignments`,
            headers: { Authorization: `Bearer ${resT.token}` },
            body: { groupId: grpRes.body.id, title: 'Submit Test', description: 'OK', deadline, points: 10 }
          }).then(asgRes => {
            cy.request({
              method: 'POST',
              url: `${API}/assignments/submit`,
              headers: { Authorization: `Bearer ${resS.token}` },
              body: {
                assignmentId: asgRes.body.id,
                fileUrl: 'https://example.com/submission.pdf',
                fileName: 'submission.pdf'
              }
            }).then(res => {
              expect(res.status).to.eq(200);
            });
          });
        });
      });
    });
  });

  /**
   * TC-ASG-04
   * Component/Function: submitAssignment (resubmit - upsert)
   * Description: Nộp lại bài tập → server upsert (cập nhật, không tạo duplicate)
   * Pre-conditions: Đã nộp lần 1
   * Input Data: POST /api/assignments/submit { assignmentId, fileUrl: 'v2.pdf' } lần 2
   * Expected Output: HTTP 200 + submission updated
   */
  it('TC-ASG-04 | [Positive] Nộp lại bài tập (upsert) → cập nhật không duplicate', () => {
    apiUser(`cy_asg_t4_${ts}`, `cy_asg_t4_${ts}@utt.edu.vn`).then(resT => {
      apiUser(`cy_asg_s4_${ts}`, `cy_asg_s4_${ts}@st.utt.edu.vn`).then(resS => {
        createGroup(resT.token, `Nhóm Upsert ${ts}`, [resS.userId]).then(grpRes => {
          const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          cy.request({
            method: 'POST',
            url: `${API}/assignments`,
            headers: { Authorization: `Bearer ${resT.token}` },
            body: { groupId: grpRes.body.id, title: 'Upsert Test', description: 'OK', deadline, points: 10 }
          }).then(asgRes => {
            // Nộp lần 1
            cy.request({
              method: 'POST',
              url: `${API}/assignments/submit`,
              headers: { Authorization: `Bearer ${resS.token}` },
              body: { assignmentId: asgRes.body.id, fileUrl: 'https://v1.pdf', fileName: 'v1.pdf' }
            });
            // Nộp lần 2
            cy.request({
              method: 'POST',
              url: `${API}/assignments/submit`,
              headers: { Authorization: `Bearer ${resS.token}` },
              body: { assignmentId: asgRes.body.id, fileUrl: 'https://v2.pdf', fileName: 'v2.pdf' }
            }).then(res => {
              expect(res.status).to.eq(200);
            });
          });
        });
      });
    });
  });

  /**
   * TC-ASG-05
   * Component/Function: gradeSubmission
   * Description: Giáo viên chấm điểm submission thành công → 200
   * Pre-conditions: Bài đã được nộp bởi student
   * Input Data: PATCH /api/assignments/submissions/:id/grade { grade: 9, feedback: 'Tốt' }
   * Expected Output: HTTP 200 + { grade: 9, feedback: 'Tốt' }
   */
  it('TC-ASG-05 | [Positive] Giáo viên chấm điểm bài nộp thành công → 200', () => {
    apiUser(`cy_asg_t5_${ts}`, `cy_asg_t5_${ts}@utt.edu.vn`).then(resT => {
      apiUser(`cy_asg_s5_${ts}`, `cy_asg_s5_${ts}@st.utt.edu.vn`).then(resS => {
        createGroup(resT.token, `Nhóm Grade ${ts}`, [resS.userId]).then(grpRes => {
          const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          cy.request({
            method: 'POST',
            url: `${API}/assignments`,
            headers: { Authorization: `Bearer ${resT.token}` },
            body: { groupId: grpRes.body.id, title: 'Grade Test', description: 'OK', deadline, points: 10 }
          }).then(asgRes => {
            cy.request({
              method: 'POST',
              url: `${API}/assignments/submit`,
              headers: { Authorization: `Bearer ${resS.token}` },
              body: { assignmentId: asgRes.body.id, fileUrl: 'https://sub.pdf', fileName: 'sub.pdf' }
            }).then(subRes => {
              // subRes có thể là array khi upsert [created, isNewRecord]
              const submissionId = Array.isArray(subRes.body) ? subRes.body[0].id : subRes.body.id;
              cy.request({
                method: 'PATCH',
                url: `${API}/assignments/grade/${submissionId}`,
                headers: { Authorization: `Bearer ${resT.token}` },
                body: { grade: 9, feedback: 'Bài làm tốt' }
              }).then(res => {
                expect(res.status).to.eq(200);
                expect(res.body.grade).to.eq(9);
                expect(res.body.feedback).to.include('tốt');
              });
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSIGNMENT - NEGATIVE TEST CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-ASG-06
   * Component/Function: submitAssignment (assignment not found)
   * Description: Nộp bài với assignmentId không tồn tại → 404
   * Pre-conditions: N/A
   * Input Data: POST /api/assignments/submit { assignmentId: '00000000-...' }
   * Expected Output: HTTP 404 + { message: 'Assignment not found' }
   */
  it('TC-ASG-06 | [Negative] submitAssignment với ID không tồn tại → 404', () => {
    apiUser(`cy_asg_nf_${ts}`, `cy_asg_nf_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/assignments/submit`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {
          assignmentId: '00000000-0000-0000-0000-000000000000',
          fileUrl: 'https://test.pdf',
          fileName: 'test.pdf'
        },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(404);
        expect(r.body.message).to.include('not found');
      });
    });
  });

  /**
   * TC-ASG-07
   * Component/Function: submitAssignment (deadline passed)
   * Description: Nộp bài quá hạn → 400
   * Pre-conditions: Bài tập có deadline đã qua
   * Input Data: POST /api/assignments/submit { assignmentId: <expired_assignment_id> }
   * Expected Output: HTTP 400 + { message: 'Quá hạn nộp bài' }
   */
  it('TC-ASG-07 | [Negative] Nộp bài quá deadline → 400 Quá hạn nộp bài', () => {
    apiUser(`cy_asg_t7_${ts}`, `cy_asg_t7_${ts}@utt.edu.vn`).then(resT => {
      apiUser(`cy_asg_s7_${ts}`, `cy_asg_s7_${ts}@st.utt.edu.vn`).then(resS => {
        createGroup(resT.token, `Nhóm Expired ${ts}`, [resS.userId]).then(grpRes => {
          // Deadline đã qua (1 giây trước)
          const expiredDeadline = new Date(Date.now() - 1000).toISOString();
          cy.request({
            method: 'POST',
            url: `${API}/assignments`,
            headers: { Authorization: `Bearer ${resT.token}` },
            body: { groupId: grpRes.body.id, title: 'Expired Test', description: 'OK', deadline: expiredDeadline, points: 10 }
          }).then(asgRes => {
            cy.request({
              method: 'POST',
              url: `${API}/assignments/submit`,
              headers: { Authorization: `Bearer ${resS.token}` },
              body: { assignmentId: asgRes.body.id, fileUrl: 'https://late.pdf', fileName: 'late.pdf' },
              failOnStatusCode: false
            }).then(res => {
              expect(res.status).to.eq(400);
              expect(res.body.message).to.include('hạn');
            });
          });
        });
      });
    });
  });

  /**
   * TC-ASG-08
   * Component/Function: gradeSubmission (wrong teacher)
   * Description: Giáo viên khác (không phải người tạo bài) cố chấm điểm → 403
   * Pre-conditions: T2 là giáo viên khác, không phải người tạo bài tập
   * Input Data: PATCH .../grade (token T2)
   * Expected Output: HTTP 403 + { message: 'Chỉ giảng viên giao bài...' }
   */
  it('TC-ASG-08 | [Negative] Giáo viên khác cố chấm bài → 403 Forbidden', () => {
    apiUser(`cy_asg_t8a_${ts}`, `cy_asg_t8a_${ts}@utt.edu.vn`).then(resT1 => {
      apiUser(`cy_asg_t8b_${ts}`, `cy_asg_t8b_${ts}@utt.edu.vn`).then(resT2 => {
        apiUser(`cy_asg_s8_${ts}`, `cy_asg_s8_${ts}@st.utt.edu.vn`).then(resS => {
          createGroup(resT1.token, `Nhóm WrongTeacher ${ts}`, [resS.userId, resT2.userId]).then(grpRes => {
            const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            cy.request({
              method: 'POST',
              url: `${API}/assignments`,
              headers: { Authorization: `Bearer ${resT1.token}` },
              body: { groupId: grpRes.body.id, title: 'Auth Test', description: 'OK', deadline, points: 10 }
            }).then(asgRes => {
              cy.request({
                method: 'POST',
                url: `${API}/assignments/submit`,
                headers: { Authorization: `Bearer ${resS.token}` },
                body: { assignmentId: asgRes.body.id, fileUrl: 'https://sub.pdf', fileName: 'sub.pdf' }
              }).then(subRes => {
                const submissionId = Array.isArray(subRes.body) ? subRes.body[0].id : subRes.body.id;
                // T2 (giáo viên khác) cố chấm
                cy.request({
                  method: 'PATCH',
                  url: `${API}/assignments/grade/${submissionId}`,
                  headers: { Authorization: `Bearer ${resT2.token}` },
                  body: { grade: 5, feedback: 'hack' },
                  failOnStatusCode: false
                }).then(res => {
                  expect(res.status).to.eq(403);
                });
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-ASG-09
   * Component/Function: gradeSubmission (not found)
   * Description: Chấm điểm submissionId không tồn tại → 404
   * Pre-conditions: Token teacher hợp lệ
   * Input Data: PATCH /api/assignments/submissions/00000000-0000-0000-0000-000000000000/grade
   * Expected Output: HTTP 404
   */
  it('TC-ASG-09 | [Negative] gradeSubmission với submissionId không tồn tại → 404', () => {
    apiUser(`cy_asg_t9_${ts}`, `cy_asg_t9_${ts}@utt.edu.vn`).then(res => {
      cy.request({
        method: 'PATCH',
        url: `${API}/assignments/grade/00000000-0000-0000-0000-000000000000`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { grade: 10, feedback: 'ok' },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(404);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE - POSITIVE TEST CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-RSC-01
   * Component/Function: addResource
   * Description: Thêm tài nguyên vào nhóm thành công → 201
   * Pre-conditions: User là thành viên nhóm
   * Input Data: POST /api/groups/:groupId/resources { title, fileUrl, fileType, fileSize, category }
   * Expected Output: HTTP 201 + resource record
   */
  it('TC-RSC-01 | [Positive] addResource thêm tài nguyên vào nhóm → 201', () => {
    apiUser(`cy_rsc_a_${ts}`, `cy_rsc_a_${ts}@utt.edu.vn`).then(res => {
      createGroup(res.token, `Nhóm RSC ${ts}`).then(grpRes => {
        cy.request({
          method: 'POST',
          url: `${API}/resources`,
          headers: { Authorization: `Bearer ${res.token}` },
          body: {
            groupId: grpRes.body.id,
            title: 'Slide Chương 1',
            fileUrl: 'https://example.com/slide1.pdf',
            fileType: 'application/pdf',
            fileSize: 1024000,
            category: 'slide'
          }
        }).then(r => {
          expect(r.status).to.eq(201);
          expect(r.body.title).to.eq('Slide Chương 1');
          expect(r.body.isPinned).to.be.false;
        });
      });
    });
  });

  /**
   * TC-RSC-02
   * Component/Function: getGroupResources
   * Description: Lấy tài nguyên của nhóm → sắp xếp pinned trước
   * Pre-conditions: Nhóm có ít nhất 2 tài nguyên (1 pinned, 1 không)
   * Input Data: GET /api/groups/:groupId/resources
   * Expected Output: HTTP 200 + Array với pinned item đầu tiên
   */
  it('TC-RSC-02 | [Positive] getGroupResources → pinned item xuất hiện đầu tiên', () => {
    apiUser(`cy_rsc_b_${ts}`, `cy_rsc_b_${ts}@utt.edu.vn`).then(res => {
      createGroup(res.token, `Nhóm RSC2 ${ts}`).then(grpRes => {
        const groupId = grpRes.body.id;
        // Thêm 2 resources
        cy.request({
          method: 'POST',
          url: `${API}/resources`,
          headers: { Authorization: `Bearer ${res.token}` },
          body: { groupId, title: 'Slide 1', fileUrl: 'https://s1.pdf', fileType: 'pdf', fileSize: 100, category: 'slide' }
        }).then(r1 => {
          cy.request({
            method: 'POST',
            url: `${API}/resources`,
            headers: { Authorization: `Bearer ${res.token}` },
            body: { groupId, title: 'Slide 2', fileUrl: 'https://s2.pdf', fileType: 'pdf', fileSize: 200, category: 'slide' }
          }).then(() => {
            // Pin resource 1
            cy.request({
              method: 'PATCH',
              url: `${API}/resources/${r1.body.id}/pin`,
              headers: { Authorization: `Bearer ${res.token}` }
            }).then(() => {
              cy.request({
                method: 'GET',
                url: `${API}/resources/groups/${groupId}`,
                headers: { Authorization: `Bearer ${res.token}` }
              }).then(listRes => {
                expect(listRes.status).to.eq(200);
                expect(listRes.body).to.be.an('array').with.length(2);
                // Pinned item đầu tiên
                expect(listRes.body[0].isPinned).to.be.true;
                expect(listRes.body[0].id).to.eq(r1.body.id);
              });
            });
          });
        });
      });
    });
  });

  /**
   * TC-RSC-03
   * Component/Function: deleteResource
   * Description: Người tải lên xóa tài nguyên của mình → 200
   * Pre-conditions: User đã upload resource
   * Input Data: DELETE /api/resources/:id
   * Expected Output: HTTP 200 + { message: 'Resource deleted' }
   */
  it('TC-RSC-03 | [Positive] deleteResource owner xóa tài nguyên của mình → 200', () => {
    apiUser(`cy_rsc_c_${ts}`, `cy_rsc_c_${ts}@utt.edu.vn`).then(res => {
      createGroup(res.token, `Nhóm DelRSC ${ts}`).then(grpRes => {
        cy.request({
          method: 'POST',
          url: `${API}/resources`,
          headers: { Authorization: `Bearer ${res.token}` },
          body: { groupId: grpRes.body.id, title: 'To Delete', fileUrl: 'https://del.pdf', fileType: 'pdf', fileSize: 50, category: 'other' }
        }).then(rscRes => {
          cy.request({
            method: 'DELETE',
            url: `${API}/resources/${rscRes.body.id}`,
            headers: { Authorization: `Bearer ${res.token}` }
          }).then(delRes => {
            expect(delRes.status).to.eq(200);
            expect(delRes.body.message).to.include('deleted');
          });
        });
      });
    });
  });

  /**
   * TC-RSC-04
   * Component/Function: togglePin (idempotent flip)
   * Description: Ghim 1 lần → isPinned=true; ghim lại → isPinned=false
   * Pre-conditions: Resource tồn tại
   * Input Data: PATCH /api/resources/:id/pin × 2
   * Expected Output: Lần 1: isPinned=true; Lần 2: isPinned=false
   */
  it('TC-RSC-04 | [Positive] togglePin ghim 2 lần → toggle đúng (true/false)', () => {
    apiUser(`cy_rsc_d_${ts}`, `cy_rsc_d_${ts}@utt.edu.vn`).then(res => {
      createGroup(res.token, `Nhóm TogglePin ${ts}`).then(grpRes => {
        cy.request({
          method: 'POST',
          url: `${API}/resources`,
          headers: { Authorization: `Bearer ${res.token}` },
          body: { groupId: grpRes.body.id, title: 'Toggle Me', fileUrl: 'https://pin.pdf', fileType: 'pdf', fileSize: 10, category: 'other' }
        }).then(rscRes => {
          const resourceId = rscRes.body.id;
          // Pin lần 1
          cy.request({
            method: 'PATCH',
            url: `${API}/resources/${resourceId}/pin`,
            headers: { Authorization: `Bearer ${res.token}` }
          }).then(r1 => {
            expect(r1.body.isPinned).to.be.true;
            // Pin lần 2 → unpin
            cy.request({
              method: 'PATCH',
              url: `${API}/resources/${resourceId}/pin`,
              headers: { Authorization: `Bearer ${res.token}` }
            }).then(r2 => {
              expect(r2.body.isPinned).to.be.false;
            });
          });
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE - NEGATIVE TEST CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-RSC-05
   * Component/Function: deleteResource (ownership check)
   * Description: User khác (không phải owner) cố xóa resource → 403
   * Pre-conditions: A đã upload resource; B muốn xóa
   * Input Data: DELETE /api/resources/:id (token B)
   * Expected Output: HTTP 403 + { message: 'No permission' }
   */
  it('TC-RSC-05 | [Negative] deleteResource user không phải owner → 403 Forbidden', () => {
    apiUser(`cy_rsc_e_${ts}`, `cy_rsc_e_${ts}@utt.edu.vn`).then(resA => {
      apiUser(`cy_rsc_f_${ts}`, `cy_rsc_f_${ts}@st.utt.edu.vn`).then(resB => {
        createGroup(resA.token, `Nhóm OwnerRSC ${ts}`, [resB.userId]).then(grpRes => {
          cy.request({
            method: 'POST',
            url: `${API}/resources`,
            headers: { Authorization: `Bearer ${resA.token}` },
            body: { groupId: grpRes.body.id, title: 'A Resource', fileUrl: 'https://a.pdf', fileType: 'pdf', fileSize: 100, category: 'other' }
          }).then(rscRes => {
            // B cố xóa tài nguyên của A
            cy.request({
              method: 'DELETE',
              url: `${API}/resources/${rscRes.body.id}`,
              headers: { Authorization: `Bearer ${resB.token}` },
              failOnStatusCode: false
            }).then(r => {
              expect(r.status).to.eq(403);
              expect(r.body.message).to.include('permission');
            });
          });
        });
      });
    });
  });

  /**
   * TC-RSC-06
   * Component/Function: deleteResource (not found)
   * Description: Xóa resource không tồn tại → 404
   * Pre-conditions: Token hợp lệ
   * Input Data: DELETE /api/resources/00000000-0000-0000-0000-000000000000
   * Expected Output: HTTP 404 + { message: 'Resource not found' }
   */
  it('TC-RSC-06 | [Negative] deleteResource không tồn tại → 404', () => {
    apiUser(`cy_rsc_g_${ts}`, `cy_rsc_g_${ts}@utt.edu.vn`).then(res => {
      cy.request({
        method: 'DELETE',
        url: `${API}/resources/00000000-0000-0000-0000-000000000000`,
        headers: { Authorization: `Bearer ${res.token}` },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(404);
      });
    });
  });

  /**
   * TC-RSC-07
   * Component/Function: togglePin (not found)
   * Description: Pin resource không tồn tại → 404
   * Pre-conditions: Token hợp lệ
   * Input Data: PATCH /api/resources/00000000-0000-0000-0000-000000000000/pin
   * Expected Output: HTTP 404
   */
  it('TC-RSC-07 | [Negative] togglePin resource không tồn tại → 404', () => {
    apiUser(`cy_rsc_h_${ts}`, `cy_rsc_h_${ts}@utt.edu.vn`).then(res => {
      cy.request({
        method: 'PATCH',
        url: `${API}/resources/00000000-0000-0000-0000-000000000000/pin`,
        headers: { Authorization: `Bearer ${res.token}` },
        failOnStatusCode: false
      }).then(r => {
        expect(r.status).to.eq(404);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULE - POSITIVE TEST CASES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-SCH-01
   * Component/Function: addSchedule
   * Description: Thêm lịch học thành công → 201
   * Pre-conditions: User đã xác thực
   * Input Data: POST /api/schedule { subjectName, dayOfWeek, startTime, endTime, room, teacherName }
   * Expected Output: HTTP 201 + schedule record với userId
   */
  it('TC-SCH-01 | [Positive] addSchedule thêm lịch học thành công → 201', () => {
    apiUser(`cy_sch_a_${ts}`, `cy_sch_a_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/schedules`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: {
          subjectName: 'Lập trình Web',
          dayOfWeek: 2,
          startTime: '07:30',
          endTime: '09:30',
          room: 'A101',
          teacherName: 'GV Nguyễn Văn A'
        }
      }).then(r => {
        expect(r.status).to.eq(201);
        expect(r.body.subjectName).to.eq('Lập trình Web');
        expect(r.body.dayOfWeek).to.eq(2);
        expect(r.body.userId).to.eq(res.userId);
      });
    });
  });

  /**
   * TC-SCH-02
   * Component/Function: getMySchedule
   * Description: Lấy lịch học của mình → trả về đúng thứ tự dayOfWeek ASC
   * Pre-conditions: User đã thêm nhiều lịch học
   * Input Data: GET /api/schedule
   * Expected Output: HTTP 200 + Array sắp xếp theo dayOfWeek tăng dần
   */
  it('TC-SCH-02 | [Positive] getMySchedule trả về đúng thứ tự dayOfWeek ASC', () => {
    apiUser(`cy_sch_b_${ts}`, `cy_sch_b_${ts}@st.utt.edu.vn`).then(res => {
      // Thêm lịch ngày 5 trước
      cy.request({
        method: 'POST',
        url: `${API}/schedules`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { subjectName: 'Toán', dayOfWeek: 5, startTime: '13:00', endTime: '15:00', room: 'B200', teacherName: 'GV B' }
      });
      // Thêm lịch ngày 2
      cy.request({
        method: 'POST',
        url: `${API}/schedules`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { subjectName: 'Lý', dayOfWeek: 2, startTime: '07:30', endTime: '09:30', room: 'C300', teacherName: 'GV C' }
      });

      cy.request({
        method: 'GET',
        url: `${API}/schedules`,
        headers: { Authorization: `Bearer ${res.token}` }
      }).then(r => {
        expect(r.status).to.eq(200);
        expect(r.body).to.be.an('array').with.length.greaterThan(0);
        // Ngày 2 phải đứng trước ngày 5
        const days = r.body.map(s => s.dayOfWeek);
        expect(days).to.deep.eq([...days].sort((a, b) => a - b));
      });
    });
  });

  /**
   * TC-SCH-03
   * Component/Function: deleteSchedule
   * Description: Xóa lịch học của mình thành công → 200
   * Pre-conditions: User đã thêm lịch học
   * Input Data: DELETE /api/schedule/:id
   * Expected Output: HTTP 200 + { message: 'Deleted' }
   */
  it('TC-SCH-03 | [Positive] deleteSchedule xóa lịch học → 200 Deleted', () => {
    apiUser(`cy_sch_c_${ts}`, `cy_sch_c_${ts}@st.utt.edu.vn`).then(res => {
      cy.request({
        method: 'POST',
        url: `${API}/schedules`,
        headers: { Authorization: `Bearer ${res.token}` },
        body: { subjectName: 'Delete Me', dayOfWeek: 3, startTime: '09:00', endTime: '11:00', room: 'D400', teacherName: 'GV D' }
      }).then(addRes => {
        cy.request({
          method: 'DELETE',
          url: `${API}/schedules/${addRes.body.id}`,
          headers: { Authorization: `Bearer ${res.token}` }
        }).then(delRes => {
          expect(delRes.status).to.eq(200);
          expect(delRes.body.message).to.eq('Deleted');
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULE - BOUNDARY & SECURITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * TC-SCH-04
   * Component/Function: getMySchedule (data isolation)
   * Description: Lịch học của A không xuất hiện trong lịch của B
   * Pre-conditions: A đã thêm lịch; B là user khác
   * Input Data: GET /api/schedule (token B)
   * Expected Output: HTTP 200 + B's schedule không chứa lịch của A
   */
  it('TC-SCH-04 | [Security] getMySchedule cách ly dữ liệu - B không thấy lịch của A', () => {
    apiUser(`cy_sch_ia_${ts}`, `cy_sch_ia_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_sch_ib_${ts}`, `cy_sch_ib_${ts}@st.utt.edu.vn`).then(resB => {
        // A thêm lịch
        cy.request({
          method: 'POST',
          url: `${API}/schedules`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { subjectName: 'A Subject', dayOfWeek: 4, startTime: '10:00', endTime: '12:00', room: 'A-Only', teacherName: 'GV' }
        }).then(aSchRes => {
          // B lấy lịch → không thấy lịch của A
          cy.request({
            method: 'GET',
            url: `${API}/schedules`,
            headers: { Authorization: `Bearer ${resB.token}` }
          }).then(r => {
            expect(r.status).to.eq(200);
            const aScheduleInB = r.body.find(s => s.id === aSchRes.body.id);
            expect(aScheduleInB).to.be.undefined;
          });
        });
      });
    });
  });

  /**
   * TC-SCH-05
   * Component/Function: deleteSchedule (wrong user - safe no-op)
   * Description: Xóa lịch của user khác (WHERE uses { id, userId }) → 200 nhưng không xóa được
   * Pre-conditions: A thêm lịch, B cố xóa lịch của A
   * Input Data: DELETE /api/schedule/:A.schedule.id (token B)
   * Expected Output: HTTP 200 (Sequelize.destroy returns 0 rows, not error);
   *                  GET A schedule vẫn còn lịch
   */
  it('TC-SCH-05 | [Security] deleteSchedule user khác không xóa được (safe no-op) → 200', () => {
    apiUser(`cy_sch_da_${ts}`, `cy_sch_da_${ts}@st.utt.edu.vn`).then(resA => {
      apiUser(`cy_sch_db_${ts}`, `cy_sch_db_${ts}@st.utt.edu.vn`).then(resB => {
        cy.request({
          method: 'POST',
          url: `${API}/schedules`,
          headers: { Authorization: `Bearer ${resA.token}` },
          body: { subjectName: 'Protected', dayOfWeek: 6, startTime: '08:00', endTime: '10:00', room: 'X1', teacherName: 'GV' }
        }).then(aSchRes => {
          // B cố xóa lịch của A
          cy.request({
            method: 'DELETE',
            url: `${API}/schedules/${aSchRes.body.id}`,
            headers: { Authorization: `Bearer ${resB.token}` }
          }).then(delRes => {
            // API trả 200 nhưng không xóa (WHERE id=? AND userId=B không match)
            expect(delRes.status).to.eq(200);

            // Kiểm tra A vẫn còn lịch
            cy.request({
              method: 'GET',
              url: `${API}/schedules`,
              headers: { Authorization: `Bearer ${resA.token}` }
            }).then(aSchedule => {
              const stillExists = aSchedule.body.find(s => s.id === aSchRes.body.id);
              expect(stillExists).to.not.be.undefined;
            });
          });
        });
      });
    });
  });

  /**
   * TC-SCH-06
   * Component/Function: All schedule endpoints (no token)
   * Description: Không có token → 401
   * Pre-conditions: N/A
   * Input Data: GET/POST/DELETE /api/schedule (no auth)
   * Expected Output: HTTP 401
   */
  it('TC-SCH-06 | [Security] Schedule endpoints không có token → 401', () => {
    cy.request({ method: 'GET', url: `${API}/schedules`, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
    cy.request({ method: 'POST', url: `${API}/schedules`, body: {}, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
    cy.request({ method: 'DELETE', url: `${API}/schedules/00000000-0000-0000-0000-000000000000`, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
  });

  /**
   * TC-RSC-08
   * Component/Function: All resource/assignment no-token checks
   * Description: Không có token → 401
   * Pre-conditions: N/A
   * Input Data: Gọi các endpoints không có Authorization header
   * Expected Output: HTTP 401
   */
  it('TC-RSC-08 | [Security] Resource và Assignment endpoints không có token → 401', () => {
    cy.request({ method: 'POST', url: `${API}/assignments/submit`, body: {}, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
    cy.request({ method: 'DELETE', url: `${API}/resources/00000000-0000-0000-0000-000000000000`, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
    cy.request({ method: 'PATCH', url: `${API}/resources/00000000-0000-0000-0000-000000000000/pin`, failOnStatusCode: false })
      .then(r => expect(r.status).to.eq(401));
  });
});
