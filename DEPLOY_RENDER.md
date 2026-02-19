# Render + Supabase 배포 가이드

## 1) GitHub에 코드 올리기

```bash
# 저장소 초기화가 안되어 있다면 (이미 git 저장소면 생략)
git init

# 변경 커밋
git add .
git commit -m "Prepare Render deployment"

# GitHub 원격 연결 (YOUR_REPO_URL 교체)
git remote add origin YOUR_REPO_URL
git branch -M main
git push -u origin main
```

## 2) Render에서 서비스 만들기 (Blueprint)

1. Render Dashboard → `New +` → `Blueprint`
2. 방금 연결한 GitHub 저장소 선택
3. `render.yaml` 감지 확인 후 생성

`render.yaml` 기준 설정:

- Build Command: `npm ci && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/`
- Runtime: Node

## 3) Render 환경변수 입력

Render 서비스의 `Environment`에서 아래 2개를 직접 입력:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

입력 후 `Manual Deploy` 또는 재배포 실행.

## 4) Supabase URL 설정

Supabase Dashboard → Authentication → URL Configuration:

- `Site URL`: Render 퍼블릭 URL (`https://...onrender.com`)
- `Redirect URLs`: 위 URL 포함(필요한 콜백 경로가 있으면 추가)

## 5) 최종 확인

1. Render 퍼블릭 URL 접속
2. `/auth`에서 회원가입/로그인 확인
3. `/diet`, `/shopping`, `/profile` 동작 확인
4. 브라우저 콘솔/Render 로그에 Supabase 관련 오류 없는지 확인

