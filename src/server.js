import { Hono } from 'hono'
import { html } from 'hono/html'
import dayjs from 'dayjs'

const app = new Hono()

// 레이아웃 함수
const Layout = (children) => html`
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>강사뱅크 운영 시스템</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" />
    <script>
      function toggleModal(id) {
        const modal = document.getElementById(id);
        if(modal.classList.contains('hidden')) {
          modal.classList.remove('hidden');
          modal.classList.add('flex');
        } else {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }
      }
    </script>
  </head>
  <body class="bg-gray-50 text-gray-800 font-sans">
    <nav class="bg-blue-600 text-white p-4 shadow-lg sticky top-0 z-50">
      <div class="container mx-auto flex justify-between items-center">
        <h1 class="text-xl font-bold flex items-center gap-2">
          <i class="fas fa-chalkboard-teacher"></i> 강사뱅크 매니저 (Cloud Version)
        </h1>
        <div class="space-x-4 text-sm font-medium">
          <a href="/" class="hover:text-blue-200 transition">대시보드</a>
          <a href="/groups" class="hover:text-blue-200 transition">강사 단체 관리</a>
          <a href="/settings" class="hover:text-blue-200 transition">설정</a>
        </div>
      </div>
    </nav>
    <main class="container mx-auto p-4 md:p-6 max-w-6xl">
      ${children}
    </main>
  </body>
  </html>
`

// 1. 대시보드 (D1 DB 연동)
app.get('/', async (c) => {
  // Cloudflare D1은 비동기(async/await)로 작동합니다.
  // c.env.DB 가 바로 아까 wrangler.toml에서 설정한 그 데이터베이스입니다.
  
  const { results: requests } = await c.env.DB.prepare(`
    SELECT r.*, g.name as group_name, a.admin_status 
    FROM requests r 
    LEFT JOIN assignments a ON r.id = a.request_id 
    LEFT JOIN groups g ON a.group_id = g.id
    ORDER BY r.created_at DESC
  `).all();

  const { results: groups } = await c.env.DB.prepare('SELECT * FROM groups').all();

  const pendingCount = requests.filter(r => r.status === 'PENDING').length
  const assignedCount = requests.filter(r => r.status === 'ASSIGNED').length
  const completedCount = requests.filter(r => r.status === 'COMPLETED').length

  return c.html(Layout(html`
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-gray-800">교육 의뢰 현황</h2>
      <button onclick="toggleModal('requestModal')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition flex items-center gap-2">
        <i class="fas fa-plus"></i> 의뢰 등록
      </button>
    </div>

    <!-- 통계 카드 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-yellow-500">
        <div class="text-xs text-gray-500 uppercase font-semibold">접수 대기</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${pendingCount}건</div>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
        <div class="text-xs text-gray-500 uppercase font-semibold">배정 완료</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${assignedCount}건</div>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
        <div class="text-xs text-gray-500 uppercase font-semibold">교육 완료</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${completedCount}건</div>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-gray-500">
        <div class="text-xs text-gray-500 uppercase font-semibold">총 의뢰</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${requests.length}건</div>
      </div>
    </div>

    <!-- 리스트 테이블 -->
    <div class="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">기관명 / 담당자</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">분야 / 예산</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">일시 / 규모</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">배정 단체</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
              <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase">관리</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${requests.map(req => html`
              <tr class="hover:bg-gray-50 transition">
                <td class="py-3 px-4">
                  <div class="font-bold text-gray-900">${req.org_name}</div>
                  <div class="text-xs text-gray-500">${req.contact_name} | ${req.contact_phone}</div>
                </td>
                <td class="py-3 px-4">
                  <div class="text-xs font-bold text-indigo-600 mb-1">
                    ${req.edu_category === 'JOB' ? '직업체험' : req.edu_category === 'COACHING' ? '학습코칭' : req.edu_category === 'SILVER' ? '실버인지' : '기타'}
                  </div>
                  <div class="text-xs text-gray-500">예산: ${req.budget ? req.budget.toLocaleString() : '0'}원</div>
                </td>
                <td class="py-3 px-4">
                  <div class="text-sm font-medium">${req.edu_date}</div>
                  <div class="text-xs text-gray-500">${req.edu_time || '-'} (${req.total_hours || 0}교시)</div>
                  <div class="text-xs text-gray-400 mt-0.5">${req.class_count || 0}학급 / ${req.student_count || 0}명</div>
                </td>
                <td class="py-3 px-4">
                  ${req.group_name ? html`<span class="text-blue-600 text-sm font-medium">${req.group_name}</span>` : html`<span class="text-gray-400 text-sm">-</span>`}
                </td>
                <td class="py-3 px-4">
                  <span class="${req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'} text-xs px-2 py-1 rounded font-bold">
                    ${req.status === 'PENDING' ? '접수중' : '배정됨'}
                  </span>
                </td>
                <td class="py-3 px-4 text-center">
                  ${req.status === 'PENDING' ? html`
                    <form action="/assign" method="post" class="flex flex-col gap-1">
                      <input type="hidden" name="request_id" value="${req.id}" />
                      <select name="group_id" class="text-xs border rounded p-1" required>
                        <option value="">단체 선택</option>
                        ${groups.map(g => html`<option value="${g.id}">${g.name}</option>`)}
                      </select>
                      <button class="bg-blue-500 text-white text-xs px-2 py-1 rounded">배정하기</button>
                    </form>
                  ` : html`<span class="text-gray-400 text-xs">완료</span>`}
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 의뢰 등록 모달 (짱구님이 원하던 항목 완벽 반영) -->
    <div id="requestModal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 justify-center items-center z-50">
      <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg m-4 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-6 border-b pb-4">
          <h3 class="text-lg font-bold">새 교육 의뢰 등록</h3>
          <button onclick="toggleModal('requestModal')" class="text-2xl">&times;</button>
        </div>
        <form action="/requests" method="post" class="space-y-4">
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">기관명</label>
            <input type="text" name="org_name" class="w-full border rounded p-2" required />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-bold mb-1">담당자</label><input type="text" name="contact_name" class="w-full border rounded p-2" required /></div>
            <div><label class="block text-sm font-bold mb-1">연락처</label><input type="text" name="contact_phone" class="w-full border rounded p-2" required /></div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-bold mb-1">교육일자</label><input type="date" name="edu_date" class="w-full border rounded p-2" required /></div>
            <div><label class="block text-sm font-bold mb-1">시간</label><input type="text" name="edu_time" placeholder="14:00~16:00" class="w-full border rounded p-2" /></div>
          </div>
          
          <!-- 추가된 상세 항목들 -->
          <div class="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded">
            <div><label class="block text-xs font-bold mb-1">총 교시</label><input type="number" name="total_hours" placeholder="4" class="w-full border rounded p-1" /></div>
            <div><label class="block text-xs font-bold mb-1">학급 수</label><input type="number" name="class_count" placeholder="3" class="w-full border rounded p-1" /></div>
            <div><label class="block text-xs font-bold mb-1">예산(원)</label><input type="number" name="budget" placeholder="500000" class="w-full border rounded p-1" /></div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
             <div><label class="block text-sm font-bold mb-1">대상</label><input type="text" name="target_audience" placeholder="중2" class="w-full border rounded p-2" /></div>
             <div><label class="block text-sm font-bold mb-1">인원(명)</label><input type="number" name="student_count" class="w-full border rounded p-2" /></div>
          </div>

          <div>
            <label class="block text-sm font-bold mb-1">분야</label>
            <select name="edu_category" class="w-full border rounded p-2">
              <option value="JOB">직업체험</option>
              <option value="COACHING">학습코칭</option>
              <option value="SILVER">실버인지</option>
              <option value="ETC">기타</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold mb-1">상세 내용</label>
            <textarea name="edu_detail" rows="2" class="w-full border rounded p-2"></textarea>
          </div>
          <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700">등록하기</button>
        </form>
      </div>
    </div>
  `))
})

// 2. 의뢰 등록 처리 (Cloudflare D1 전용 코드)
app.post('/requests', async (c) => {
  const body = await c.req.parseBody()
  
  // D1 쿼리 실행 (DB 바인딩 사용)
  await c.env.DB.prepare(`
    INSERT INTO requests (
      org_name, contact_name, contact_phone, edu_date, 
      edu_time, total_hours, class_count, budget,
      edu_category, edu_detail, target_audience, student_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.org_name, body.contact_name, body.contact_phone, body.edu_date, 
    body.edu_time, body.total_hours || 0, body.class_count || 0, body.budget || 0,
    body.edu_category, body.edu_detail, body.target_audience, body.student_count || 0
  ).run();

  return c.redirect('/')
})

// 3. 배정 처리
app.post('/assign', async (c) => {
  const body = await c.req.parseBody()
  const { request_id, group_id } = body;

  const group = await c.env.DB.prepare('SELECT type FROM groups WHERE id = ?').bind(group_id).first();
  if (!group) return c.text('Group not found', 404);

  const adminStatus = group.type === 'CLUB' ? 'WAITING_DOCS' : 'CONTACT_SHARED';

  // 배치(Batch) 실행
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO assignments (request_id, group_id, admin_status) VALUES (?, ?, ?)').bind(request_id, group_id, adminStatus),
    c.env.DB.prepare("UPDATE requests SET status = 'ASSIGNED' WHERE id = ?").bind(request_id)
  ]);

  return c.redirect('/')
})

// 4. 강사 단체 관리
app.get('/groups', async (c) => {
  const { results: groups } = await c.env.DB.prepare('SELECT * FROM groups ORDER BY created_at DESC').all();
  
  return c.html(Layout(html`
    <h2 class="text-2xl font-bold mb-6">강사 단체 관리</h2>
    
    <div class="bg-white p-6 rounded-lg shadow-sm border mb-8">
      <h3 class="font-bold mb-4">새 단체 등록</h3>
      <form action="/groups" method="post" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" name="name" placeholder="단체명" class="border p-2 rounded" required />
        <select name="type" class="border p-2 rounded">
          <option value="CLUB">동아리</option>
          <option value="COOP">협동조합</option>
        </select>
        <select name="category" class="border p-2 rounded">
          <option value="JOB">직업체험</option>
          <option value="COACHING">학습코칭</option>
        </select>
        <input type="text" name="contact_person" placeholder="대표자" class="border p-2 rounded" />
        <input type="text" name="phone" placeholder="연락처" class="border p-2 rounded" />
        <button type="submit" class="bg-green-600 text-white font-bold py-2 rounded md:col-span-2">등록하기</button>
      </form>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      ${groups.map(g => html`
        <div class="bg-white p-5 rounded shadow border border-l-4 ${g.type === 'CLUB' ? 'border-l-yellow-400' : 'border-l-green-500'}">
          <h4 class="font-bold text-lg">${g.name}</h4>
          <p class="text-sm text-gray-600">${g.contact_person} | ${g.phone}</p>
        </div>
      `)}
    </div>
  `))
})

app.post('/groups', async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare('INSERT INTO groups (name, type, category, contact_person, phone) VALUES (?, ?, ?, ?, ?)').bind(
    body.name, body.type, body.category, body.contact_person, body.phone
  ).run();
  return c.redirect('/groups')
})

export default app
