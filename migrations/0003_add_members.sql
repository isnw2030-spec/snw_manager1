-- 1. 강사 그룹 테이블에 '소속 강사(members)' 컬럼 추가
ALTER TABLE groups ADD COLUMN members TEXT;
