-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'staff', -- 'admin', 'staff'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Groups table (Club or Coop)
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'CLUB' (동아리), 'COOP' (협동조합)
  category TEXT, -- '직업체험', '학습코칭', '실버인지' 등
  description TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Requests table (Education Requests from Schools)
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_name TEXT NOT NULL, -- 학교/기관명
  education_type TEXT NOT NULL, -- 교육 분야
  target_date DATE,
  target_audience TEXT, -- 대상 (중학생, 어르신 등)
  student_count INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'matched', 'completed', 'cancelled'
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matches table (Connection between Request and Group)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  group_id INTEGER,
  admin_status TEXT DEFAULT 'assigned', -- 'assigned', 'documents_sent', 'finalized'
  admin_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- Initial Seed Data
INSERT OR IGNORE INTO users (email, name, role) VALUES 
('isnw2020@gmail.com', '관리자', 'admin');

-- Example Groups Data
INSERT OR IGNORE INTO groups (name, type, category, description) VALUES 
('진로탐험 동아리', 'CLUB', '직업체험', '다양한 직업을 체험하는 강사 동아리 (센터 행정지원 필요)'),
('꿈키움 협동조합', 'COOP', '학습코칭', '자기주도학습 전문 강사 협동조합 (자체 행정 가능)'),
('실버케어 동아리', 'CLUB', '실버인지', '치매예방 및 인지놀이 전문 (센터 행정지원 필요)'),
('메이커스 조합', 'COOP', '직업체험', '3D프린팅 및 코딩 교육 (자체 행정 가능)');
