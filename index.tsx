import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// 타입 정의
type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ------------------------------------------------------------------
// API Routes
// ------------------------------------------------------------------

// 1. 그룹 목록 조회
app.get('/api/groups', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM groups ORDER BY type, name').all()
  return c.json(results)
})

// 2. 그룹 추가
app.post('/api/groups', async (c) => {
  try {
    const body = await c.req.json()
    const { name, type, category, description, members } = body
    await c.env.DB.prepare(
      'INSERT INTO groups (name, type, category, description, members) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, type, category, description, members).run()
    return c.json({ success: true })
  } catch (e) {
    console.error(e)
    return c.json({ error: e.message }, 500)
  }
})

// 2-1. 그룹 수정
app.put('/api/groups/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { name, type, category, description, members } = body
    await c.env.DB.prepare(
      'UPDATE groups SET name = ?, type = ?, category = ?, description = ?, members = ? WHERE id = ?'
    ).bind(name, type, category, description, members, id).run()
    return c.json({ success: true })
  } catch (e) {
    console.error(e)
    return c.json({ error: e.message }, 500)
  }
})

// 2-2. 그룹 삭제
app.delete('/api/groups/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e) {
    console.error(e)
    return c.json({ error: e.message }, 500)
  }
})

// 3. 교육 의뢰 등록
app.post('/api/requests', async (c) => {
  try {
    const body = await c.req.json()
    let { 
      institution_name, education_type, target_date, target_audience, student_count, note,
      edu_time, total_hours, class_count, budget 
    } = body
    
    student_count = student_count ? parseInt(student_count) : 0
    total_hours = total_hours ? parseInt(total_hours) : 0
    class_count = class_count ? parseInt(class_count) : 0
    budget = budget ? parseInt(budget) : 0
    if (!target_date) target_date = null
    
    await c.env.DB.prepare(
      `INSERT INTO requests (
        institution_name, education_type, target_date, target_audience, student_count, note,
        edu_time, total_hours, class_count, budget
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      institution_name, education_type, target_date, target_audience, student_count, note,
      edu_time, total_hours, class_count, budget
    ).run()
    return c.json({ success: true })
  } catch (e) {
    console.error('Request Error:', e)
    return c.json({ error: e.message }, 500)
  }
})

// 4. 의뢰 목록 조회 (날짜순 정렬)
app.get('/api/requests', async (c) => {
  const query = `
    SELECT 
      r.*, 
      m.id as match_id,
      m.admin_status,
      m.doc_agreement,
      m.doc_estimate,
      m.doc_plan,
      m.doc_sex_offender,
      m.doc_etc,
      g.name as matched_group_name,
      g.type as matched_group_type
    FROM requests r
    LEFT JOIN matches m ON r.id = m.request_id
    LEFT JOIN groups g ON m.group_id = g.id
    ORDER BY r.target_date DESC, r.created_at DESC
  `
  const { results } = await c.env.DB.prepare(query).all()
  return c.json(results)
})

// 5. 매칭 실행
app.post('/api/matches', async (c) => {
  const body = await c.req.json()
  const { request_id, group_id } = body
  
  const existing = await c.env.DB.prepare('SELECT id FROM matches WHERE request_id = ?').bind(request_id).first()
  
  if (existing) {
    await c.env.DB.prepare(
      'UPDATE matches SET group_id = ?, admin_status = ? WHERE request_id = ?'
    ).bind(group_id, 'assigned', request_id).run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO matches (request_id, group_id, admin_status) VALUES (?, ?, ?)'
    ).bind(request_id, group_id, 'assigned').run()
  }
  
  await c.env.DB.prepare("UPDATE requests SET status = 'matched' WHERE id = ?").bind(request_id).run()
  return c.json({ success: true })
})

// 5-1. 의뢰 상세 수정 (PUT)
app.put('/api/requests/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    let { 
      institution_name, education_type, target_date, target_audience, student_count, note,
      edu_time, total_hours, class_count, budget 
    } = body
    
    student_count = student_count ? parseInt(student_count) : 0
    total_hours = total_hours ? parseInt(total_hours) : 0
    class_count = class_count ? parseInt(class_count) : 0
    budget = budget ? parseInt(budget) : 0
    if (!target_date) target_date = null

    await c.env.DB.prepare(
      `UPDATE requests SET
        institution_name = ?, education_type = ?, target_date = ?, target_audience = ?, 
        student_count = ?, note = ?, edu_time = ?, total_hours = ?, class_count = ?, budget = ?
       WHERE id = ?`
    ).bind(
      institution_name, education_type, target_date, target_audience, student_count, note,
      edu_time, total_hours, class_count, budget, id
    ).run()
    
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// 5-2. 의뢰 삭제 (DELETE)
app.delete('/api/requests/:id', async (c) => {
  try {
    const id = c.req.param('id')
    // 관련된 매칭 정보 먼저 삭제
    await c.env.DB.prepare('DELETE FROM matches WHERE request_id = ?').bind(id).run()
    // 의뢰 삭제
    await c.env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// 5-3. 상태 업데이트 (교육 완료 처리용)
app.put('/api/requests/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json()
    await c.env.DB.prepare('UPDATE requests SET status = ? WHERE id = ?').bind(status, id).run()
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// 7. 서류 제출 상태 업데이트
app.post('/api/matches/:id/docs', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { doc_agreement, doc_estimate, doc_plan, doc_sex_offender, doc_etc } = body
    
    await c.env.DB.prepare(
      `UPDATE matches SET 
        doc_agreement = ?, doc_estimate = ?, doc_plan = ?, doc_sex_offender = ?, doc_etc = ? 
       WHERE id = ?`
    ).bind(doc_agreement, doc_estimate, doc_plan, doc_sex_offender, doc_etc, id).run()
    
    return c.json({ success: true })
  } catch (e) {
    console.error(e)
    return c.json({ error: e.message }, 500)
  }
})

// 6. 엑셀 다운로드
app.get('/api/export', async (c) => {
  const query = `
    SELECT 
      r.created_at as '접수일자',
      r.institution_name as '기관명',
      r.education_type as '교육분야',
      r.target_date as '교육일자',
      r.edu_time as '시간',
      r.total_hours as '총교시',
      r.class_count as '학급수',
      r.student_count as '인원',
      r.budget as '예산(강사료)',
      g.name as '매칭강사그룹',
      CASE 
        WHEN g.type = 'CLUB' THEN '동아리'
        WHEN g.type = 'COOP' THEN '협동조합'
        ELSE ''
      END as '유형',
      g.members as '소속강사',
      CASE WHEN r.status = 'completed' THEN '완료' ELSE '진행중' END as '상태',
      CASE WHEN m.doc_agreement = 1 THEN 'O' ELSE 'X' END as '협약서',
      CASE WHEN m.doc_estimate = 1 THEN 'O' ELSE 'X' END as '견적서',
      CASE WHEN m.doc_plan = 1 THEN 'O' ELSE 'X' END as '계획서',
      CASE WHEN m.doc_sex_offender = 1 THEN 'O' ELSE 'X' END as '성범죄동의'
    FROM requests r
    LEFT JOIN matches m ON r.id = m.request_id
    LEFT JOIN groups g ON m.group_id = g.id
    ORDER BY r.target_date DESC
  `
  const { results } = await c.env.DB.prepare(query).all()
  
  if (!results || results.length === 0) return c.text('데이터가 없습니다.')

  const headers = Object.keys(results[0]).join(',')
  const rows = results.map(row => Object.values(row).map(v => `"${v || ''}"`).join(',')).join('\n')
  const csv = `\uFEFF${headers}\n${rows}`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="education_report_${new Date().toISOString().slice(0,10)}.csv"`
    }
  })
})

// ------------------------------------------------------------------
// Frontend UI
// ------------------------------------------------------------------

// [NEW] 외부 기관용 접수 페이지 (로그인 불필요)
app.get('/apply', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>교육 프로그램 의뢰 신청서</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
    </head>
    <body class="bg-gray-100 font-sans text-gray-800">
        <div class="max-w-2xl mx-auto py-8 px-4">
            <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                <!-- 헤더 -->
                <div class="bg-indigo-600 p-6 text-center">
                    <h1 class="text-2xl font-bold text-white mb-2">🎓 교육 프로그램 의뢰 신청서</h1>
                    <p class="text-indigo-100 text-sm mb-1">아래 내용을 작성해 주시면 담당자가 확인 후 연락드리겠습니다.</p>
                    <div class="inline-block bg-indigo-700 text-indigo-100 px-3 py-1 rounded-full text-xs font-medium mt-2">
                        <i class="fas fa-phone-alt mr-1"></i> 성남여성인력개발센터 강사뱅크 담당자 : 070-4048-6413
                    </div>
                </div>

                <!-- 폼 -->
                <div class="p-8">
                    <form id="apply-form" onsubmit="submitExternalRequest(event)" class="space-y-6">
                        
                        <div class="border-b pb-6">
                            <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-school text-indigo-500 mr-2"></i>기관 정보</h2>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">학교/기관명 <span class="text-red-500">*</span></label>
                                    <input type="text" name="institution_name" required class="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="예: 서울중학교">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">담당 선생님 성함/직위</label>
                                    <input type="text" name="contact_name" class="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="예: 김선생 / 진로부장">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">담당자 연락처</label>
                                    <input type="text" name="contact_phone" class="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="예: 010-1234-5678">
                                </div>
                            </div>
                            <p class="text-xs text-gray-400 mt-2">* 연락받으실 분 정보를 정확히 입력해주세요</p>
                        </div>

                        <div class="border-b pb-6">
                            <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-chalkboard text-indigo-500 mr-2"></i>교육 희망 내용</h2>
                            <div class="space-y-4">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">희망 교육 분야 <span class="text-red-500">*</span></label>
                                        <select name="education_type" class="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                                            <option value="직업체험">직업체험</option>
                                            <option value="학습코칭">학습코칭</option>
                                            <option value="실버인지">실버인지</option>
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">교육 희망 일자</label>
                                        <input type="date" name="target_date" required class="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">희망 시간</label>
                                        <input type="text" name="edu_time" class="w-full border border-gray-300 rounded-md p-2" placeholder="예: 13:00~15:00">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">총 교시</label>
                                        <input type="number" name="total_hours" class="w-full border border-gray-300 rounded-md p-2" placeholder="예: 2">
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">교육 대상</label>
                                        <input type="text" name="target_audience" class="w-full border border-gray-300 rounded-md p-2" placeholder="예: 1학년 전체">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">예상 인원 (명)</label>
                                        <input type="number" name="student_count" class="w-full border border-gray-300 rounded-md p-2">
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">학급 수</label>
                                        <input type="number" name="class_count" class="w-full border border-gray-300 rounded-md p-2" placeholder="반 개수">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">예산 (선택)</label>
                                        <input type="number" name="budget" class="w-full border border-gray-300 rounded-md p-2" placeholder="책정 예산">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">기타 문의사항</label>
                            <textarea name="note_detail" rows="3" class="w-full border border-gray-300 rounded-md p-2" placeholder="특별히 요청하실 내용이 있다면 적어주세요."></textarea>
                        </div>

                        <div class="pt-4">
                            <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-4 rounded-lg shadow-md transition transform hover:scale-[1.02]">
                                신청서 제출하기
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <div class="text-center mt-6 text-gray-500 text-sm">
                &copy; 강사뱅크 운영 시스템
            </div>
        </div>

        <script>
            async function submitExternalRequest(e) {
                e.preventDefault();
                if(!confirm('작성하신 내용으로 신청하시겠습니까?')) return;

                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                
                // 담당자 정보(이름, 연락처)를 비고란에 합침
                let contactInfo = '';
                if (data.contact_name || data.contact_phone) {
                    contactInfo = \`[담당자: \${data.contact_name || ''} / \${data.contact_phone || ''}] \n\`;
                }
                
                const detailInfo = data.note_detail ? data.note_detail : '';
                data.note = contactInfo + detailInfo;

                try {
                    await axios.post('/api/requests', data);
                    alert('✅ 신청이 성공적으로 접수되었습니다.\\n담당자가 확인 후 연락드리겠습니다.');
                    window.location.reload(); // 폼 초기화
                } catch (e) {
                    alert('신청 중 오류가 발생했습니다. 다시 시도해주세요.');
                    console.error(e);
                }
            }
        </script>
    </body>
    </html>
  `)
})

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>강사뱅크 운영 관리 시스템</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/locale/ko.js"></script>
    </head>
    <body class="bg-gray-50 font-sans text-gray-800">
        <!-- 네비게이션 -->
        <nav class="bg-indigo-600 text-white shadow-lg">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between h-16">
                    <div class="flex items-center">
                        <i class="fas fa-chalkboard-teacher text-2xl mr-3"></i>
                        <span class="font-bold text-xl">강사뱅크 매니저</span>
                    </div>
                    <div class="hidden md:block">
                        <div class="ml-10 flex items-baseline space-x-4">
                            <button onclick="showTab('dashboard')" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-500 bg-indigo-700 transition" id="btn-dashboard">대시보드</button>
                            <button onclick="showTab('request')" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-500 transition" id="btn-request">교육 의뢰 등록</button>
                            <button onclick="showTab('groups')" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-500 transition" id="btn-groups">강사 그룹 관리</button>
                            <button onclick="copyApplyLink()" class="px-3 py-2 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 transition flex items-center shadow-sm">
                                <i class="fas fa-link mr-2"></i> 외부 접수 링크 복사
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>

        <!-- 메인 컨텐츠 -->
        <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            
            <!-- 1. 대시보드 탭 -->
            <div id="tab-dashboard" class="space-y-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold text-gray-800">📋 교육 운영 현황</h2>
                    <a href="/api/export" target="_blank" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow flex items-center transition">
                        <i class="fas fa-file-excel mr-2"></i> 자료 다운로드 (N드라이브 저장용)
                    </a>
                </div>

                <!-- 통계 카드 (5개) - 클릭형 필터링 적용 -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <!-- 1. 진행중 (Matched) -->
                    <div onclick="filterRequests('matched')" class="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500 cursor-pointer hover:bg-blue-50 transition transform hover:scale-105" id="card-matched">
                        <div class="text-gray-500 text-xs font-bold uppercase">진행중</div>
                        <div class="text-2xl font-bold mt-1 text-blue-600" id="stat-processing">0</div>
                    </div>
                    
                    <!-- 2. 대기 (Pending) -->
                    <div onclick="filterRequests('pending')" class="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500 cursor-pointer hover:bg-yellow-50 transition transform hover:scale-105" id="card-pending">
                        <div class="text-gray-500 text-xs font-bold uppercase">대기</div>
                        <div class="text-2xl font-bold mt-1 text-yellow-600" id="stat-waiting">0</div>
                    </div>

                    <!-- 3. 완료 (Completed) -->
                    <div onclick="filterRequests('completed')" class="bg-white p-4 rounded-lg shadow border-l-4 border-gray-500 cursor-pointer hover:bg-gray-50 transition transform hover:scale-105" id="card-completed">
                        <div class="text-gray-500 text-xs font-bold uppercase">완료</div>
                        <div class="text-2xl font-bold mt-1 text-gray-600" id="stat-completed">0</div>
                    </div>

                    <!-- 4. 이번달 교육 -->
                    <div onclick="filterRequests('month')" class="bg-white p-4 rounded-lg shadow border-l-4 border-green-500 cursor-pointer hover:bg-green-50 transition transform hover:scale-105" id="card-month">
                        <div class="text-gray-500 text-xs font-bold uppercase">이번 달 교육</div>
                        <div class="text-2xl font-bold mt-1 text-green-600" id="stat-month">0</div>
                    </div>

                    <!-- 5. 전체 운영 교육 (수정됨) -->
                    <div onclick="filterRequests('total')" class="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500 cursor-pointer hover:bg-purple-50 transition transform hover:scale-105" id="card-total">
                        <div class="text-gray-500 text-xs font-bold uppercase">전체 운영 교육</div>
                        <div class="text-2xl font-bold mt-1 text-purple-600" id="stat-total">0</div>
                    </div>
                </div>

                <!-- 의뢰 목록 -->
                <div class="bg-white shadow rounded-lg overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">일시/장소</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">교육정보</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">매칭/행정</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                                </tr>
                            </thead>
                            <tbody id="request-list" class="bg-white divide-y divide-gray-200"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 2. 교육 의뢰 등록 탭 -->
            <div id="tab-request" class="hidden max-w-3xl mx-auto">
                <!-- (기존과 동일) -->
                <div class="bg-white shadow rounded-lg p-6">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">✏️ 새 교육 의뢰 등록</h2>
                    <form id="request-form" onsubmit="submitRequest(event)" class="space-y-4">
                        <div class="grid grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">학교/기관명</label>
                                <input type="text" name="institution_name" required class="mt-1 block w-full border rounded-md shadow-sm p-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">교육 분야</label>
                                <select name="education_type" class="mt-1 block w-full border rounded-md shadow-sm p-2">
                                    <option value="직업체험">직업체험</option>
                                    <option value="학습코칭">학습코칭</option>
                                    <option value="실버인지">실버인지</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                        </div>

                        <div class="bg-gray-50 p-4 rounded-md space-y-4">
                            <h3 class="font-bold text-gray-700 text-sm">🗓️ 교육 상세 정보</h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-medium text-gray-500">교육 일자</label>
                                    <input type="date" name="target_date" class="mt-1 block w-full border rounded p-2">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-500">교육 시간 (예: 13:00~15:00)</label>
                                    <input type="text" name="edu_time" class="mt-1 block w-full border rounded p-2">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-500">총 교시</label>
                                    <input type="number" name="total_hours" class="mt-1 block w-full border rounded p-2" placeholder="예: 2">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-500">학급 수</label>
                                    <input type="number" name="class_count" class="mt-1 block w-full border rounded p-2" placeholder="예: 3">
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">교육 대상 (예: 중2)</label>
                                <input type="text" name="target_audience" class="mt-1 block w-full border rounded-md shadow-sm p-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">전체 학생 수</label>
                                <input type="number" name="student_count" class="mt-1 block w-full border rounded-md shadow-sm p-2">
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">예산 (강사료)</label>
                            <input type="number" name="budget" class="mt-1 block w-full border rounded-md shadow-sm p-2" placeholder="원 단위 입력">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">비고</label>
                            <textarea name="note" rows="3" class="mt-1 block w-full border rounded-md shadow-sm p-2"></textarea>
                        </div>

                        <div class="pt-4">
                            <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded transition">
                                의뢰 등록 완료
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- 3. 강사 그룹 관리 탭 -->
            <div id="tab-groups" class="hidden">
                <!-- (기존과 동일) -->
                <div class="bg-white shadow rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">➕ 새 강사 그룹 등록</h2>
                    <form id="group-form" onsubmit="submitGroup(event)" class="space-y-4">
                        <div class="flex flex-wrap gap-4">
                            <div class="flex-1 min-w-[200px]">
                                <label class="block text-xs font-medium text-gray-500 mb-1">그룹명</label>
                                <input type="text" name="name" required class="w-full p-2 border rounded text-sm">
                            </div>
                            <div class="w-32">
                                <label class="block text-xs font-medium text-gray-500 mb-1">유형</label>
                                <select name="type" class="w-full p-2 border rounded text-sm">
                                    <option value="CLUB">동아리</option>
                                    <option value="COOP">협동조합</option>
                                </select>
                            </div>
                            <div class="w-32">
                                <label class="block text-xs font-medium text-gray-500 mb-1">분야</label>
                                <input type="text" name="category" class="w-full p-2 border rounded text-sm">
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">설명</label>
                            <input type="text" name="description" class="w-full p-2 border rounded text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">소속 강사 명단 (콤마나 줄바꿈으로 구분)</label>
                            <textarea name="members" rows="2" class="w-full p-2 border rounded text-sm" placeholder="예: 김철수, 이영희, 박지성"></textarea>
                        </div>
                        <div class="text-right">
                            <button type="submit" class="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-700">추가하기</button>
                        </div>
                    </form>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="group-list"></div>
            </div>

        </main>

        <!-- 모달: 의뢰 상세 및 수정 -->
        <div id="request-detail-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 class="text-xl font-bold text-gray-800">📝 교육 의뢰 상세 정보</h3>
                    <button onclick="closeModal('request-detail-modal')" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
                </div>
                <form id="request-detail-form" onsubmit="submitEditRequest(event)" class="space-y-4">
                    <input type="hidden" name="id" id="detail-id">
                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">학교/기관명</label>
                            <input type="text" name="institution_name" id="detail-institution_name" required class="mt-1 block w-full border rounded-md p-2 bg-yellow-50">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">교육 분야</label>
                            <select name="education_type" id="detail-education_type" class="mt-1 block w-full border rounded-md p-2">
                                <option value="직업체험">직업체험</option>
                                <option value="학습코칭">학습코칭</option>
                                <option value="실버인지">실버인지</option>
                                <option value="기타">기타</option>
                            </select>
                        </div>
                    </div>

                    <div class="bg-gray-50 p-4 rounded-md space-y-4">
                        <h3 class="font-bold text-gray-700 text-sm">🗓️ 교육 상세 정보</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-gray-500">교육 일자</label>
                                <input type="date" name="target_date" id="detail-target_date" class="mt-1 block w-full border rounded p-2">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-500">교육 시간</label>
                                <input type="text" name="edu_time" id="detail-edu_time" class="mt-1 block w-full border rounded p-2">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-500">총 교시</label>
                                <input type="number" name="total_hours" id="detail-total_hours" class="mt-1 block w-full border rounded p-2">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-500">학급 수</label>
                                <input type="number" name="class_count" id="detail-class_count" class="mt-1 block w-full border rounded p-2">
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">교육 대상</label>
                            <input type="text" name="target_audience" id="detail-target_audience" class="mt-1 block w-full border rounded-md p-2">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">전체 학생 수</label>
                            <input type="number" name="student_count" id="detail-student_count" class="mt-1 block w-full border rounded-md p-2">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">예산 (강사료)</label>
                        <input type="number" name="budget" id="detail-budget" class="mt-1 block w-full border rounded-md p-2">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">비고</label>
                        <textarea name="note" id="detail-note" rows="3" class="mt-1 block w-full border rounded-md p-2"></textarea>
                    </div>

                    <div class="flex justify-between pt-4 border-t mt-4">
                        <button type="button" onclick="deleteRequest()" class="text-red-600 hover:text-red-800 text-sm flex items-center">
                            <i class="fas fa-trash-alt mr-1"></i> 의뢰 삭제
                        </button>
                        <div class="space-x-2">
                            <button type="button" onclick="closeModal('request-detail-modal')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">닫기</button>
                            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">수정사항 저장</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <!-- 모달: 매칭 선택 -->
        <div id="match-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white p-5 rounded-lg shadow-xl w-96">
                <h3 class="text-lg font-bold mb-4">강사 그룹 매칭</h3>
                <p class="text-sm text-gray-600 mb-4" id="match-target-info"></p>
                <div class="space-y-3 max-h-60 overflow-y-auto" id="match-group-options"></div>
                <div class="mt-6 flex justify-end">
                    <button onclick="closeModal('match-modal')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">취소</button>
                </div>
            </div>
        </div>

        <!-- 모달: 그룹 수정 -->
        <div id="edit-group-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h3 class="text-lg font-bold mb-4">강사 그룹 정보 수정</h3>
                <form id="edit-group-form" onsubmit="submitEditGroup(event)" class="space-y-4">
                    <input type="hidden" name="id" id="edit-group-id">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2">
                            <label class="block text-sm font-medium text-gray-700">그룹명</label>
                            <input type="text" name="name" id="edit-group-name" required class="mt-1 block w-full border rounded p-2">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">유형</label>
                            <select name="type" id="edit-group-type" class="mt-1 block w-full border rounded p-2">
                                <option value="CLUB">동아리</option>
                                <option value="COOP">협동조합</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">분야</label>
                            <input type="text" name="category" id="edit-group-category" class="mt-1 block w-full border rounded p-2">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">설명</label>
                        <textarea name="description" id="edit-group-description" rows="2" class="mt-1 block w-full border rounded p-2"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">소속 강사 명단</label>
                        <textarea name="members" id="edit-group-members" rows="3" class="mt-1 block w-full border rounded p-2 bg-gray-50"></textarea>
                    </div>
                    <div class="flex justify-between pt-4">
                        <button type="button" onclick="deleteGroup()" class="text-red-600 hover:text-red-800 text-sm">삭제하기</button>
                        <div class="space-x-2">
                            <button type="button" onclick="closeModal('edit-group-modal')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">취소</button>
                            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">저장</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <!-- 모달: 서류 관리 -->
        <div id="doc-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 class="text-lg font-bold mb-2"><i class="fas fa-folder-open text-yellow-500 mr-2"></i>행정 서류 체크리스트</h3>
                <p class="text-sm text-gray-500 mb-6">필요한 서류의 제출 여부를 체크하세요.</p>
                
                <form onsubmit="submitDocs(event)">
                    <input type="hidden" id="doc-match-id">
                    <div class="space-y-3 mb-6">
                        <label class="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="doc-agreement" class="h-5 w-5 text-indigo-600">
                            <span class="text-gray-700">협약서</span>
                        </label>
                        <label class="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="doc-estimate" class="h-5 w-5 text-indigo-600">
                            <span class="text-gray-700">견적서</span>
                        </label>
                        <label class="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="doc-plan" class="h-5 w-5 text-indigo-600">
                            <span class="text-gray-700">강의계획서</span>
                        </label>
                        <label class="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="doc-sex-offender" class="h-5 w-5 text-indigo-600">
                            <span class="text-gray-700">성범죄 경력조회 동의서</span>
                        </label>
                    </div>
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1">기타 서류 / 비고</label>
                        <textarea id="doc-etc" rows="2" class="w-full border rounded p-2 text-sm" placeholder="추가로 필요한 서류나 메모를 입력하세요."></textarea>
                    </div>
                    <div class="flex justify-end space-x-2">
                        <button type="button" onclick="closeModal('doc-modal')" class="px-4 py-2 bg-gray-200 rounded">취소</button>
                        <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">저장하기</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            dayjs.locale('ko');

            let groupsData = [];
            let requestsData = [];
            let currentRequestId = null;
            let currentFilter = 'total'; // 현재 필터 상태 (기본값: 전체)

            function showTab(tabName) {
                ['dashboard', 'request', 'groups'].forEach(t => {
                    document.getElementById('tab-' + t).classList.add('hidden');
                    document.getElementById('btn-' + t).classList.remove('bg-indigo-700');
                });
                document.getElementById('tab-' + tabName).classList.remove('hidden');
                document.getElementById('btn-' + tabName).classList.add('bg-indigo-700');
                
                if (tabName === 'dashboard') loadRequests();
                if (tabName === 'groups') loadGroups();
            }

            // 필터링 함수
            function filterRequests(filterType) {
                currentFilter = filterType;
                
                // 카드 활성화 시각적 효과
                ['matched', 'pending', 'completed', 'month', 'total'].forEach(type => {
                    const card = document.getElementById('card-' + type);
                    if (type === filterType) {
                        card.classList.add('ring-2', 'ring-indigo-500', 'bg-gray-50');
                    } else {
                        card.classList.remove('ring-2', 'ring-indigo-500', 'bg-gray-50');
                    }
                });

                renderRequests();
            }

            function formatDate(dateStr) {
                if (!dateStr) return '-';
                return dayjs(dateStr).format('YYYY-MM-DD(ddd)');
            }

            async function loadGroups() {
                try {
                    const res = await axios.get('/api/groups');
                    groupsData = res.data;
                    renderGroups();
                    document.getElementById('stat-groups').innerText = groupsData.length;
                } catch (e) { console.error(e); }
            }

            async function loadRequests() {
                try {
                    const res = await axios.get('/api/requests');
                    requestsData = res.data;
                    renderRequests();
                    updateStats();
                } catch (e) { console.error(e); }
            }

            function copyApplyLink() {
                const url = window.location.origin + '/apply';
                navigator.clipboard.writeText(url).then(() => {
                    alert('📋 외부 기관용 접수 링크가 복사되었습니다!\\n\\n' + url + '\\n\\n이 주소를 학교 담당자에게 보내주세요.');
                }).catch(err => {
                    alert('링크 복사에 실패했습니다. 아래 주소를 직접 복사하세요:\\n' + url);
                });
            }

            function updateStats() {
                // 1. 대기 (pending)
                document.getElementById('stat-waiting').innerText = requestsData.filter(r => r.status === 'pending').length;
                // 2. 진행중 (matched)
                document.getElementById('stat-processing').innerText = requestsData.filter(r => r.status === 'matched').length;
                // 3. 완료 (completed)
                document.getElementById('stat-completed').innerText = requestsData.filter(r => r.status === 'completed').length;
                // 4. 이번달 교육
                document.getElementById('stat-month').innerText = requestsData.filter(r => r.target_date && r.target_date.startsWith(dayjs().format('YYYY-MM'))).length;
                // 5. 전체 운영 교육 (수정됨)
                document.getElementById('stat-total').innerText = requestsData.length;
            }

            // 완료 처리 함수
            async function completeRequest(id) {
                if (!confirm('이 교육을 완료 상태로 변경하시겠습니까?')) return;
                try {
                    await axios.put('/api/requests/' + id + '/status', { status: 'completed' });
                    loadRequests(); // 새로고침
                } catch(e) {
                    alert('처리 중 오류가 발생했습니다.');
                }
            }

            function renderGroups() {
                const container = document.getElementById('group-list');
                container.innerHTML = groupsData.map(g => \`
                    <div class="bg-white rounded-lg shadow p-5 border-t-4 \${g.type === 'CLUB' ? 'border-blue-500' : 'border-green-500'}">
                        <div class="flex justify-between mb-2">
                            <h3 class="font-bold text-lg">\${g.name}</h3>
                            <span class="px-2 py-1 rounded text-xs font-semibold \${g.type === 'CLUB' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">\${g.type === 'CLUB' ? '동아리' : '협동조합'}</span>
                        </div>
                        <p class="text-sm text-gray-600">\${g.category || ''}</p>
                        <p class="text-sm text-gray-500 mt-2">\${g.description || ''}</p>
                        \${g.members ? \`<div class="mt-3 pt-3 border-t text-xs text-gray-500 bg-gray-50 p-2 rounded"><i class="fas fa-users mr-1"></i> <strong>소속강사:</strong> \${g.members}</div>\` : ''}
                        <button onclick="openEditGroupModal(\${g.id})" class="text-xs text-indigo-500 mt-4 hover:text-indigo-700 w-full text-right"><i class="fas fa-edit"></i> 수정/관리</button>
                    </div>
                \`).join('');
            }

            // ... (openEditGroupModal, submitEditGroup, deleteGroup 등은 기존 동일)
            function openEditGroupModal(id) {
                const group = groupsData.find(g => g.id === id);
                if (!group) return;
                document.getElementById('edit-group-id').value = group.id;
                document.getElementById('edit-group-name').value = group.name;
                document.getElementById('edit-group-type').value = group.type;
                document.getElementById('edit-group-category').value = group.category;
                document.getElementById('edit-group-description').value = group.description || '';
                document.getElementById('edit-group-members').value = group.members || '';
                document.getElementById('edit-group-modal').classList.remove('hidden');
                document.getElementById('edit-group-modal').classList.add('flex');
            }
            async function submitEditGroup(e) {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                try {
                    await axios.put('/api/groups/' + data.id, data);
                    closeModal('edit-group-modal');
                    loadGroups();
                    alert('수정되었습니다.');
                } catch (e) { alert('수정 실패'); }
            }
            async function deleteGroup() {
                const id = document.getElementById('edit-group-id').value;
                if (!confirm('삭제하시겠습니까?')) return;
                try { await axios.delete('/api/groups/' + id); closeModal('edit-group-modal'); loadGroups(); alert('삭제되었습니다.'); } catch(e) { alert('오류'); }
            }

            // 의뢰 상세 모달 열기
            function openDetailModal(id) {
                const req = requestsData.find(r => r.id === id);
                if (!req) return;

                document.getElementById('detail-id').value = req.id;
                document.getElementById('detail-institution_name').value = req.institution_name;
                document.getElementById('detail-education_type').value = req.education_type;
                document.getElementById('detail-target_date').value = req.target_date || '';
                document.getElementById('detail-edu_time').value = req.edu_time || '';
                document.getElementById('detail-total_hours').value = req.total_hours || '';
                document.getElementById('detail-class_count').value = req.class_count || '';
                document.getElementById('detail-target_audience').value = req.target_audience || '';
                document.getElementById('detail-student_count').value = req.student_count || '';
                document.getElementById('detail-budget').value = req.budget || '';
                document.getElementById('detail-note').value = req.note || '';

                document.getElementById('request-detail-modal').classList.remove('hidden');
                document.getElementById('request-detail-modal').classList.add('flex');
            }

            // 의뢰 수정 제출
            async function submitEditRequest(e) {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                const id = data.id;

                try {
                    await axios.put('/api/requests/' + id, data);
                    closeModal('request-detail-modal');
                    loadRequests();
                    alert('의뢰 정보가 수정되었습니다.');
                } catch (e) {
                    alert('수정 실패: ' + e.message);
                }
            }

            // 의뢰 삭제
            async function deleteRequest() {
                const id = document.getElementById('detail-id').value;
                if (!confirm('정말로 이 의뢰를 삭제하시겠습니까?\\n(관련된 매칭 정보도 함께 삭제됩니다)')) return;

                try {
                    await axios.delete('/api/requests/' + id);
                    closeModal('request-detail-modal');
                    loadRequests();
                    alert('삭제되었습니다.');
                } catch (e) {
                    alert('삭제 실패: ' + e.message);
                }
            }

            function renderRequests() {
                const tbody = document.getElementById('request-list');
                
                // 필터링 적용
                let filteredData = requestsData;
                const thisMonth = dayjs().format('YYYY-MM');

                if (currentFilter === 'pending') filteredData = requestsData.filter(r => r.status === 'pending');
                else if (currentFilter === 'matched') filteredData = requestsData.filter(r => r.status === 'matched');
                else if (currentFilter === 'completed') filteredData = requestsData.filter(r => r.status === 'completed');
                else if (currentFilter === 'month') filteredData = requestsData.filter(r => r.target_date && r.target_date.startsWith(thisMonth));
                // total은 필터링 없음

                // 월별(날짜) 순서대로 정렬 (내림차순: 최신순)
                // 이미 API에서 정렬되어 오지만, 필터링 후 안전하게 재정렬
                filteredData.sort((a, b) => {
                    const dateA = a.target_date || '0000-00-00';
                    const dateB = b.target_date || '0000-00-00';
                    return dateB.localeCompare(dateA);
                });

                if (filteredData.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">해당하는 의뢰가 없습니다.</td></tr>';
                    return;
                }

                const today = dayjs().format('YYYY-MM-DD');

                tbody.innerHTML = filteredData.map(r => {
                    let statusHtml = '';
                    const isPast = r.target_date && r.target_date < today;

                    if (r.status === 'completed') {
                        statusHtml = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-600">완료됨</span>';
                    } else if (r.status === 'matched') {
                        if (isPast) {
                            statusHtml = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">교육종료(처리필요)</span>';
                        } else {
                            statusHtml = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">진행중</span>';
                        }
                    } else {
                        if (isPast) {
                            statusHtml = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-400">기한만료(미매칭)</span>';
                        } else {
                            statusHtml = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">대기중</span>';
                        }
                    }
                    
                    let matchInfo = r.matched_group_name 
                        ? \`<div class="font-bold text-indigo-700">\${r.matched_group_name}</div>
                           <div class="text-xs">\${r.matched_group_type === 'CLUB' ? '동아리' : '협동조합'}</div>\`
                        : '<span class="text-gray-400">-</span>';

                    let docCount = 0;
                    if(r.doc_agreement) docCount++;
                    if(r.doc_estimate) docCount++;
                    if(r.doc_plan) docCount++;
                    if(r.doc_sex_offender) docCount++;
                    
                    let docStatus = r.match_id 
                        ? \`<div class="text-xs mt-1 \${docCount === 4 ? 'text-green-600' : 'text-orange-500'}">
                             <i class="fas fa-check-circle"></i> 서류 \${docCount}/4
                           </div>\` 
                        : '';

                    // 관리 버튼 영역
                    let actionButtons = '';
                    if (r.status === 'completed') {
                        actionButtons = '<span class="text-gray-400 text-xs">관리종료</span>';
                    } else {
                        actionButtons = \`
                            <button onclick="openMatchModal(\${r.id}, '\${r.education_type}')" class="text-indigo-600 hover:text-indigo-900 mr-2 text-xs border border-indigo-200 px-2 py-1 rounded">매칭</button>
                            \${r.match_id ? \`<button onclick="openDocModal(\${r.match_id}, \${r.doc_agreement}, \${r.doc_estimate}, \${r.doc_plan}, \${r.doc_sex_offender}, '\${r.doc_etc || ''}')" class="text-green-600 hover:text-green-900 bg-green-50 px-2 py-1 rounded text-xs mr-2">서류</button>\` : ''}
                            \${r.status === 'matched' ? \`<button onclick="completeRequest(\${r.id})" class="\${isPast ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-100 text-gray-600 hover:text-black'} px-2 py-1 rounded text-xs"><i class="fas fa-check"></i> 완료처리</button>\` : ''}
                        \`;
                    }

                    return \`
                        <tr class="hover:bg-gray-50 \${isPast && r.status !== 'completed' ? 'bg-red-50' : ''}">
                            <td class="px-6 py-4 whitespace-nowrap">\${statusHtml}</td>
                            <td class="px-6 py-4">
                                <div class="text-sm font-medium">\${formatDate(r.target_date)}</div>
                                <div onclick="openDetailModal(\${r.id})" class="text-xs text-indigo-600 font-bold cursor-pointer hover:underline">\${r.institution_name} <i class="fas fa-external-link-alt ml-1"></i></div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm font-bold">\${r.education_type}</div>
                                <div class="text-xs text-gray-500">
                                    \${r.target_audience} / \${r.student_count}명<br>
                                    \${r.total_hours ? r.total_hours + '교시' : ''} \${r.budget ? '/ ' + r.budget.toLocaleString() + '원' : ''}
                                </div>
                            </td>
                            <td class="px-6 py-4">\${matchInfo} \${docStatus}</td>
                            <td class="px-6 py-4 text-sm font-medium">
                                \${actionButtons}
                            </td>
                        </tr>
                    \`;
                }).join('');
            }

            function openMatchModal(reqId, eduType) {
                currentRequestId = reqId;
                document.getElementById('match-modal').classList.remove('hidden');
                document.getElementById('match-modal').classList.add('flex');
                document.getElementById('match-target-info').innerText = \`추천 분야: \${eduType}\`;
                if (groupsData.length === 0) loadGroups();
                const container = document.getElementById('match-group-options');
                container.innerHTML = groupsData.map(g => \`
                    <div onclick="selectGroup(\${g.id})" class="p-3 border rounded cursor-pointer hover:bg-gray-100 transition flex justify-between items-center">
                        <div>
                            <span class="font-bold">\${g.name}</span>
                            <span class="text-xs ml-2 text-gray-500">\${g.type === 'CLUB' ? '동아리' : '협동조합'}</span>
                        </div>
                        <div class="text-xs text-gray-400">\${g.category}</div>
                    </div>
                \`).join('');
            }

            function openDocModal(matchId, agree, est, plan, sex, etc) {
                document.getElementById('doc-match-id').value = matchId;
                document.getElementById('doc-agreement').checked = agree === 1;
                document.getElementById('doc-estimate').checked = est === 1;
                document.getElementById('doc-plan').checked = plan === 1;
                document.getElementById('doc-sex-offender').checked = sex === 1;
                document.getElementById('doc-etc').value = etc === 'null' ? '' : etc;
                document.getElementById('doc-modal').classList.remove('hidden');
                document.getElementById('doc-modal').classList.add('flex');
            }

            function closeModal(id) {
                document.getElementById(id).classList.add('hidden');
                document.getElementById(id).classList.remove('flex');
            }

            async function selectGroup(groupId) {
                if (!confirm('이 그룹으로 매칭하시겠습니까?')) return;
                try {
                    await axios.post('/api/matches', { request_id: currentRequestId, group_id: groupId });
                    closeModal('match-modal');
                    loadRequests();
                    alert('매칭 완료!');
                } catch (e) { alert('오류 발생'); }
            }

            async function submitRequest(e) {
                e.preventDefault();
                const formData = new FormData(e.target);
                try {
                    await axios.post('/api/requests', Object.fromEntries(formData));
                    e.target.reset();
                    alert('등록되었습니다.');
                    showTab('dashboard');
                } catch (e) { alert('오류 발생'); }
            }

            async function submitGroup(e) {
                e.preventDefault();
                const formData = new FormData(e.target);
                try {
                    await axios.post('/api/groups', Object.fromEntries(formData));
                    e.target.reset();
                    loadGroups();
                    alert('추가되었습니다.');
                } catch (e) { alert('오류 발생'); }
            }

            async function submitDocs(e) {
                e.preventDefault();
                const matchId = document.getElementById('doc-match-id').value;
                const data = {
                    doc_agreement: document.getElementById('doc-agreement').checked ? 1 : 0,
                    doc_estimate: document.getElementById('doc-estimate').checked ? 1 : 0,
                    doc_plan: document.getElementById('doc-plan').checked ? 1 : 0,
                    doc_sex_offender: document.getElementById('doc-sex-offender').checked ? 1 : 0,
                    doc_etc: document.getElementById('doc-etc').value
                };
                try {
                    await axios.post('/api/matches/' + matchId + '/docs', data);
                    closeModal('doc-modal');
                    loadRequests();
                    alert('저장되었습니다.');
                } catch (e) { alert('오류 발생'); }
            }

            loadRequests();
            loadGroups();
        </script>
    </body>
    </html>
  `)
})

export default app
