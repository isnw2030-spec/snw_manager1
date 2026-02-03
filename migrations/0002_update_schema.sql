-- 1. 강사 단체 (동아리/협동조합) 테이블
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'CLUB'(동아리), 'COOP'(협동조합)
  category TEXT,
  description TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 교육 의뢰 테이블 (항목 추가됨)
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_name TEXT NOT NULL,
  education_type TEXT NOT NULL,
  target_date DATE,
  edu_time TEXT,          -- 교육 시간 (예: 13:00~15:00)
  total_hours INTEGER,    -- 총 교시
  class_count INTEGER,    -- 학급 수
  budget INTEGER,         -- 예산(강사료)
  target_audience TEXT,
  student_count INTEGER,
  status TEXT DEFAULT 'pending',
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 매칭 및 행정 테이블 (서류 체크리스트 추가)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  group_id INTEGER,
  admin_status TEXT DEFAULT 'assigned',
  
  -- 서류 체크리스트 (JSON 형태로 저장하거나 별도 컬럼)
  -- 편의상 주요 서류 컬럼 추가 (1=제출, 0=미제출)
  doc_agreement INTEGER DEFAULT 0,    -- 협약서
  doc_estimate INTEGER DEFAULT 0,     -- 견적서
  doc_plan INTEGER DEFAULT 0,         -- 강의계획서
  doc_sex_offender INTEGER DEFAULT 0, -- 성범죄조회동의서
  doc_etc TEXT,                       -- 기타 서류 (텍스트로 기록)
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- 초기 데이터
INSERT OR IGNORE INTO groups (name, type, category, description) VALUES 
('진로탐험 동아리', 'CLUB', '직업체험', '다양한 직업을 체험하는 강사 동아리 (센터 행정지원 필요)'),
('꿈키움 협동조합', 'COOP', '학습코칭', '자기주도학습 전문 강사 협동조합 (자체 행정 가능)'),
('실버케어 동아리', 'CLUB', '실버인지', '치매예방 및 인지놀이 전문 (센터 행정지원 필요)'),
('메이커스 조합', 'COOP', '직업체험', '3D프린팅 및 코딩 교육 (자체 행정 가능)');
