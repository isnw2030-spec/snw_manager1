import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { html } from 'hono/html'
import Database from 'better-sqlite3'
import dayjs from 'dayjs'

// DB 초기화
const db = new Database('local.db')
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    edu_date TEXT,
    edu_time TEXT,
    edu_category TEXT,
    edu_detail TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    admin_status TEXT DEFAULT 'WAITING',
    memo TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES requests(id),
    FOREIGN KEY (group_id) REFERENCES groups(id)
  );
  
  -- 초기 데이터가 없으면 넣기
  INSERT OR IGNORE INTO groups (id, name, type, category, contact_person, phone) VALUES 
  (1, '꿈키움 직업체험단', 'CLUB', 'JOB', '김동아', '010-1111-2222'),
  (2, '학습코칭 연구회', 'CLUB', 'COACHING', '이학습', '010-3333-4444'),
  (3, '실버인지 놀이협동조합', 'COOP', 'SILVER', '박조합', '010-5555-6666'),
  (4, '미래직업 협동조합', 'COOP', 'JOB', '최미래', '010-7777-8888');
`)

const app = new Hono()

// 레이아웃
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
          <i class="fas fa-chalkboard-teacher"></i> 강사뱅크 매니저
        </h1>
        <div class="space-x-4 text-sm font-medium">
          <a href="/" class="hover:text-blue-200 transition">대시보드</a>
          <a href="/groups" class="hover:text-blue-200 transition">강사 단체 관리</a>
          <a href="/settings" class="hover:text-blue-200 transition">설정(백업)</a>
        </div>
      </div>
    </nav>
    <main class="container mx-auto p-4 md:p-6 max-w-6xl">
      ${children}
    </main>
  </body>
  </html>
`

// 1. 대시보드
app.get('/', (c) => {
  const requests = db.prepare(`
    SELECT r.*, g.name as group_name, a.admin_status 
    FROM requests r 
    LEFT JOIN assignments a ON r.id = a.request_id 
    LEFT JOIN groups g ON a.group_id = g.id
    ORDER BY r.created_at DESC
  `).all()

  const groups = db.prepare('SELECT * FROM groups').all()

  const pendingCount = requests.filter(r => r.status === 'PENDING').length
  const assignedCount = requests.filter(r => r.status === 'ASSIGNED').length
  const completedCount = requests.filter(r => r.status === 'COMPLETED').length

  return c.html(Layout(html`
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-gray-800">교육 의뢰 현황</h2>
      <div class="flex gap-2 w-full md:w-auto">
         <button onclick="toggleModal('requestModal')" class="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition flex items-center justify-center gap-2">
           <i class="fas fa-plus"></i> 의뢰 등록
         </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-yellow-500 hover:shadow-md transition">
        <div class="text-xs text-gray-500 uppercase font-semibold">접수 대기</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${pendingCount}건</div>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500 hover:shadow-md transition">
        <div class="text-xs text-gray-500 uppercase font-semibold">배정 완료</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${assignedCount}건</div>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500 hover:shadow-md transition">
        <div class="text-xs text-gray-500 uppercase font-semibold">교육 완료</div>
        <div class="text-2xl font-bold text-gray-800 mt-1">${completedCount}건</div>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 border-gray-500 hover:shadow-md transition">
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
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기관명 / 담당자</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">분야</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">희망일시</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">배정 단체</th>
              <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태 / 행정</th>
              <th class="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${requests.map(req => html`
              <tr class="hover:bg-gray-50 transition">
                <td class="py-3 px-4 whitespace-nowrap">
                  <div class="font-bold text-gray-900">${req.org_name}</div>
                  <div class="text-xs text-gray-500">${req.contact_name} <span class="text-gray-300">|</span> ${req.contact_phone}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                  <span class="${
                    req.edu_category === 'JOB' ? 'bg-purple-100 text-purple-800' :
                    req.edu_category === 'COACHING' ? 'bg-indigo-100 text-indigo-800' :
                    'bg-pink-100 text-pink-800'
                  } inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
                    ${req.edu_category === 'JOB' ? '직업체험' : req.edu_category === 'COACHING' ? '학습코칭' : '실버인지'}
                  </span>
                </td>
                <td class="py-3 px-4 whitespace-nowrap text-sm text-gray-600">
                  <div class="font-medium">${req.edu_date}</div>
                  <div class="text-xs">${req.edu_time}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                  ${req.group_name ? html`
                    <span class="font-medium text-blue-600 text-sm flex items-center gap-1">
                      <i class="fas fa-users text-xs"></i> ${req.group_name}
                    </span>
                  ` : html`
                    <span class="text-gray-400 text-sm">-</span>
                  `}
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                  <div class="flex flex-col gap-1 items-start">
                    <span class="${
                      req.status === 'PENDING' ? 'text-yellow-600 bg-yellow-50' : 
                      req.status === 'ASSIGNED' ? 'text-blue-600 bg-blue-50' : 
                      'text-green-600 bg-green-50'
                    } text-xs font-bold px-2 py-0.5 rounded">
                      ${req.status === 'PENDING' ? '접수중' : req.status === 'ASSIGNED' ? '배정됨' : req.status}
                    </span>
                    ${req.admin_status ? html`
                      <span class="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                        ${req.admin_status === 'WAITING_DOCS' ? '📄 센터서류준비' : 
                          req.admin_status === 'CONTACT_SHARED' ? '📞 연락처공유완료' : req.admin_status}
                      </span>
                    ` : ''}
                  </div>
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                  ${req.status === 'PENDING' ? html`
                    <form action="/assign" method="post" class="flex gap-2 justify-center items-center">
                      <input type="hidden" name="request_id" value="${req.id}" />
                      <select name="group_id" class="text-xs border border-gray-300 rounded p-1.5 w-32 focus:ring-blue-500 focus:border-blue-500" required>
                        <option value="">단체 선택...</option>
                        ${groups.map(g => html`
                          <option value="${g.id}">
                            [${g.type === 'CLUB' ? '동아리' : '조합'}] ${g.name}
                          </option>
                        `)}
                      </select>
                      <button class="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded transition">배정</button>
                    </form>
                  ` : html`
                    <button class="text-gray-400 text-xs cursor-not-allowed" disabled>관리완료</button>
                  `}
                </td>
              </tr>
            `)}
            ${requests.length === 0 ? html`
              <tr>
                <td colspan="6" class="py-12 text-center text-gray-500">
                  <div class="flex flex-col items-center gap-2">
                    <i class="far fa-folder-open text-3xl text-gray-300"></i>
                    <p>등록된 교육 의뢰가 없습니다.</p>
                  </div>
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 의뢰 등록 모달 -->
    <div id="requestModal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 justify-center items-center z-50 backdrop-blur-sm transition-opacity">
      <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg m-4 transform transition-all scale-100">
        <div class="flex justify-between items-center mb-6 border-b pb-4">
          <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit text-blue-600 mr-2"></i>새 교육 의뢰 등록</h3>
          <button onclick="toggleModal('requestModal')" class="text-gray-400 hover:text-gray-600 transition text-xl">&times;</button>
        </div>
        <form action="/requests" method="post" class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">기관명 <span class="text-red-500">*</span></label>
            <input type="text" name="org_name" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" placeholder="예: 서울중학교" required />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">담당자명 <span class="text-red-500">*</span></label>
              <input type="text" name="contact_name" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" required />
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">연락처 <span class="text-red-500">*</span></label>
              <input type="text" name="contact_phone" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" placeholder="010-0000-0000" required />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">교육일자 <span class="text-red-500">*</span></label>
              <input type="date" name="edu_date" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" required />
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">시간</label>
              <input type="text" name="edu_time" placeholder="예: 14:00~16:00" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">교육 분야 <span class="text-red-500">*</span></label>
            <select name="edu_category" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition">
              <option value="JOB">직업체험</option>
              <option value="COACHING">학습코칭</option>
              <option value="SILVER">실버인지</option>
              <option value="ETC">기타</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">상세 요청사항</label>
            <textarea name="edu_detail" rows="3" class="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" placeholder="특이사항이나 요청 내용을 입력하세요"></textarea>
          </div>
          <div class="pt-4">
            <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-lg transform hover:-translate-y-0.5">
              등록하기
            </button>
          </div>
        </form>
      </div>
    </div>
  `))
})

// 2. 의뢰 등록
app.post('/requests', async (c) => {
  const body = await c.req.parseBody()
  db.prepare(`
    INSERT INTO requests (org_name, contact_name, contact_phone, edu_date, edu_time, edu_category, edu_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.org_name, body.contact_name, body.contact_phone, 
    body.edu_date, body.edu_time, body.edu_category, body.edu_detail
  )
  return c.redirect('/')
})

// 3. 배정
app.post('/assign', async (c) => {
  const body = await c.req.parseBody()
  const requestId = body.request_id
  const groupId = body.group_id

  const group = db.prepare('SELECT type FROM groups WHERE id = ?').get(groupId)
  if (!group) return c.text('Group not found', 404)

  const adminStatus = group.type === 'CLUB' ? 'WAITING_DOCS' : 'CONTACT_SHARED'

  db.transaction(() => {
    db.prepare('INSERT INTO assignments (request_id, group_id, admin_status) VALUES (?, ?, ?)').run(requestId, groupId, adminStatus)
    db.prepare("UPDATE requests SET status = 'ASSIGNED' WHERE id = ?").run(requestId)
  })()

  return c.redirect('/')
})

// 4. 강사 단체
app.get('/groups', (c) => {
  const groups = db.prepare('SELECT * FROM groups ORDER BY created_at DESC').all()
  return c.html(Layout(html`
    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2"><i class="fas fa-users-cog"></i> 강사 단체 관리</h2>
    
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
      <h3 class="text-lg font-bold mb-4 text-gray-800">새 단체 등록</h3>
      <form action="/groups" method="post" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" name="name" placeholder="단체명 (예: 창의체험동아리)" class="border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" required />
        <select name="type" class="border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
          <option value="CLUB">동아리 (센터 행정지원)</option>
          <option value="COOP">협동조합 (자체 행정)</option>
        </select>
        <select name="category" class="border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
          <option value="JOB">직업체험</option>
          <option value="COACHING">학습코칭</option>
          <option value="SILVER">실버인지</option>
        </select>
        <input type="text" name="contact_person" placeholder="대표자명" class="border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
        <input type="text" name="phone" placeholder="연락처" class="border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
        <button type="submit" class="bg-green-600 text-white font-bold py-2.5 rounded-lg hover:bg-green-700 transition md:col-span-2 shadow">
          등록하기
        </button>
      </form>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${groups.map(g => html`
        <div class="bg-white p-5 rounded-lg shadow-sm hover:shadow-md transition border border-gray-100 relative overflow-hidden group">
          <div class="absolute top-0 left-0 w-1 h-full ${g.type === 'CLUB' ? 'bg-yellow-400' : 'bg-green-500'}"></div>
          <div class="flex justify-between items-start mb-3 pl-2">
            <h4 class="font-bold text-lg text-gray-800">${g.name}</h4>
            <span class="${g.type === 'CLUB' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'} text-xs px-2 py-1 rounded-full font-medium">
              ${g.type === 'CLUB' ? '동아리' : '협동조합'}
            </span>
          </div>
          <div class="text-sm text-gray-600 pl-2 space-y-1">
            <p><i class="fas fa-user w-5 text-center text-gray-400"></i> ${g.contact_person} <span class="text-gray-300">|</span> ${g.phone}</p>
            <p><i class="fas fa-tag w-5 text-center text-gray-400"></i> ${g.category === 'JOB' ? '직업체험' : g.category === 'COACHING' ? '학습코칭' : '실버인지'}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-gray-100 pl-2 text-xs text-gray-400 flex justify-between">
            <span>등록일: ${dayjs(g.created_at).format('YYYY-MM-DD')}</span>
            <button class="text-blue-500 hover:text-blue-700 font-medium">수정</button>
          </div>
        </div>
      `)}
    </div>
  `))
})

app.post('/groups', async (c) => {
  const body = await c.req.parseBody()
  db.prepare('INSERT INTO groups (name, type, category, contact_person, phone) VALUES (?, ?, ?, ?, ?)').run(
    body.name, body.type, body.category, body.contact_person, body.phone
  )
  return c.redirect('/groups')
})

// 5. 설정 및 백업
app.get('/settings', (c) => {
  return c.html(Layout(html`
    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2"><i class="fas fa-cog"></i> 설정</h2>
    
    <div class="bg-white p-6 rounded-lg shadow-md max-w-3xl border border-gray-200">
      <div class="flex items-center gap-3 mb-6 border-b pb-4">
        <div class="bg-green-100 p-3 rounded-full text-green-600 text-xl">
          <i class="fab fa-google-drive"></i>
        </div>
        <div>
          <h3 class="text-lg font-bold text-gray-800">구글 드라이브 백업 설정</h3>
          <p class="text-sm text-gray-500">교육 의뢰 데이터를 구글 드라이브(isnw2020@gmail.com)로 안전하게 백업합니다.</p>
        </div>
      </div>

      <div class="space-y-6">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">1단계: Google Apps Script 배포 URL 입력</label>
          <form action="/backup/config" method="post" class="flex gap-2">
             <input type="text" name="webhook_url" placeholder="https://script.google.com/macros/s/..." class="flex-1 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
             <button class="bg-gray-800 text-white px-6 py-2.5 rounded-lg hover:bg-gray-900 transition font-medium">저장</button>
          </form>
          <p class="text-xs text-gray-500 mt-2 ml-1">※ 아래 스크립트를 배포하여 얻은 웹앱 URL을 입력해주세요.</p>
        </div>

        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
           <label class="block text-sm font-semibold text-gray-700 mb-2">2단계: 백업 실행 테스트</label>
           <form action="/backup/run" method="post">
             <button class="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition shadow flex justify-center items-center gap-2 font-bold">
               <i class="fas fa-file-excel"></i> 지금 구글 드라이브로 데이터 보내기
             </button>
           </form>
        </div>

        <div>
           <label class="block text-sm font-semibold text-gray-700 mb-2">참고: 구글 앱스 스크립트 코드</label>
           <div class="relative group">
             <pre class="bg-gray-900 text-gray-300 p-4 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed select-all border border-gray-700 shadow-inner">
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderName = "강사뱅크_백업";
    var fileName = "교육의뢰_" + Utilities.formatDate(new Date(), "GMT+9", "yyyyMMdd_HHmm") + ".csv";
    
    // 폴더 찾기 또는 생성
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    // CSV 내용 생성
    var csvContent = "\\uFEFF"; // BOM for Excel encoding
    csvContent += "ID,기관명,담당자,연락처,날짜,분야,상태,배정단체\\n";
    
    data.forEach(function(row) {
      csvContent += [
        row.id,
        row.org_name,
        row.contact_name,
        row.contact_phone,
        row.edu_date,
        row.edu_category,
        row.status,
        row.group_name || '미배정'
      ].join(",") + "\\n";
    });
    
    // 파일 생성
    folder.createFile(fileName, csvContent, MimeType.CSV);
    
    return ContentService.createTextOutput(JSON.stringify({result: "success", file: fileName}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({result: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
             </pre>
             <div class="absolute top-2 right-2 bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">복사 가능</div>
           </div>
        </div>
      </div>
    </div>
  `))
})

// 백업 실행 (실제로는 Webhook으로 데이터 전송)
app.post('/backup/run', async (c) => {
  // 실제 DB 데이터 조회
  const requests = db.prepare(`
    SELECT r.*, g.name as group_name 
    FROM requests r 
    LEFT JOIN assignments a ON r.id = a.request_id 
    LEFT JOIN groups g ON a.group_id = g.id
  `).all()

  // TODO: 저장된 webhook_url을 가져와서 fetch 요청을 보내야 함
  // 여기서는 시뮬레이션만
  
  return c.html(Layout(html`
    <div class="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <div class="text-5xl text-green-500 mb-4"><i class="fas fa-check-circle"></i></div>
      <h2 class="text-2xl font-bold text-gray-800 mb-2">백업 요청 완료</h2>
      <p class="text-gray-600 mb-6">구글 드라이브(isnw2020@gmail.com)의 '강사뱅크_백업' 폴더를 확인해주세요.</p>
      <p class="text-sm text-gray-400 mb-8">(주의: Webhook URL이 설정되어 있어야 실제 파일이 생성됩니다)</p>
      <a href="/settings" class="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-900 transition">돌아가기</a>
    </div>
  `))
})

console.log('Server running on http://localhost:3000')

serve({
  fetch: app.fetch,
  port: 3000
})
